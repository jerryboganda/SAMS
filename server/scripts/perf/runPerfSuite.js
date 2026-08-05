#!/usr/bin/env node
// server/scripts/perf/runPerfSuite.js
// Phase 12.4 (docs/07_EXECUTION_PLAN.md) EXPLAIN + timing harness. Runs
// against the ALREADY-seeded perf DB (server/scripts/perf/seedSyntheticLoad.js
// must be run first) and generates docs/PERF_REPORT.md — this generated file
// IS the "perf script output committed" acceptance criterion.
//
// Usage:
//   node server/scripts/perf/runPerfSuite.js                 # baseline run
//   node server/scripts/perf/runPerfSuite.js --migrate --save=after
//       # applies any pending migrations (additive `db:migrate`, no reset —
//       # used for Part C's "add an index, re-measure the SAME seeded data"
//       # workflow) then measures again, diffing against the prior
//       # `baseline` run for a before/after comparison in the report.
//
// Flags:
//   --save=<name>      results cache file name under .perf-results/ (default 'latest')
//   --baseline=<name>  explicit baseline to diff against (default: auto-uses
//                      '.perf-results/baseline.json' if it exists and --save
//                      isn't itself 'baseline')
//   --migrate          run `sequelize-cli db:migrate --env perf` (additive
//                      only — never undo/reset) before measuring
//   --iterations=<n>   timed iterations per query after warmup (default 25)
//
// === Query-shape fidelity ===
// Every case below is the REAL Sequelize call from the named service file —
// copied verbatim (same attributes/where/group/order/include), not a
// hand-simplified stand-in — run against models re-loaded from
// server/src/models/*.js (lib/perfDb.js#loadPerfModels), bound to the
// isolated perf DB. Each call is passed a per-invocation `logging` callback
// so the EXACT SQL Sequelize generates is captured and fed to `EXPLAIN`,
// rather than a hand-written approximation of what the ORM "probably" emits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Op, fn, col } from 'sequelize';
import { assertPerfDbIsolated, buildPerfSequelize, loadPerfModels, migratePerfDb, PERF_DB_NAME, SERVER_ROOT } from './lib/perfDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'PERF_REPORT.md');
const RESULTS_DIR = path.join(__dirname, '.perf-results');
const P95_BUDGET_MS = 500; // task AC: "p95 <500 ms"

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { save: 'latest', baseline: null, migrate: false, iterations: 25, warmup: 3 };
  for (const a of args) {
    if (a === '--migrate') opts.migrate = true;
    else if (a.startsWith('--save=')) opts.save = a.slice('--save='.length);
    else if (a.startsWith('--baseline=')) opts.baseline = a.slice('--baseline='.length);
    else if (a.startsWith('--iterations=')) opts.iterations = Number(a.slice('--iterations='.length));
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Timing + SQL capture + EXPLAIN
// ---------------------------------------------------------------------------

async function timeQuery(run, { warmup, iterations }) {
  for (let i = 0; i < warmup; i += 1) await run();
  const timings = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = process.hrtime.bigint();
    await run();
    const t1 = process.hrtime.bigint();
    timings.push(Number(t1 - t0) / 1e6);
  }
  timings.sort((a, b) => a - b);
  const pct = (p) => timings[Math.min(timings.length - 1, Math.floor((timings.length - 1) * p))];
  return { p50: pct(0.5), p95: pct(0.95), max: timings[timings.length - 1], min: timings[0], iterations };
}

function collectSql() {
  const statements = [];
  const logger = (msg) => {
    statements.push(String(msg).replace(/^Executing \([^)]*\):\s*/, ''));
  };
  return { logger, statements };
}

async function explainSql(sequelize, sql) {
  const trimmed = sql.trim();
  if (!/^select/i.test(trimmed)) return null; // only SELECTs are EXPLAIN-able as captured
  const cleanSql = trimmed.replace(/;$/, '');
  const [rows] = await sequelize.query(`EXPLAIN ${cleanSql}`);
  return rows;
}

async function runCase(sequelize, def, { iterations, warmup }) {
  const { logger, statements } = collectSql();
  await def.run(logger);

  const explains = [];
  for (const sql of statements) {
    const rows = await explainSql(sequelize, sql);
    if (rows) explains.push({ sql, rows });
  }

  const timing = await timeQuery(() => def.run(() => {}), { warmup, iterations });

  return {
    id: def.id,
    name: def.name,
    sourceRef: def.sourceRef,
    note: def.note ?? null,
    statementsCount: statements.length,
    explains,
    timing,
  };
}

// ---------------------------------------------------------------------------
// Row counts
// ---------------------------------------------------------------------------

async function gatherRowCounts(sequelize) {
  const tables = [
    'users', 'courses', 'course_sections', 'lectures', 'lecture_progress',
    'questions', 'question_options', 'orders', 'enrollments',
    'test_sessions', 'test_attempt_questions', 'user_question_history', 'user_daily_stats',
  ];
  const counts = {};
  for (const t of tables) {
    const [[{ cnt }]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``);
    counts[t] = Number(cnt);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Markdown report generation
// ---------------------------------------------------------------------------

function fmtMs(v) {
  return `${v.toFixed(2)} ms`;
}

function explainTableMarkdown(rows) {
  const header = '| table | type | possible_keys | key | key_len | rows | filtered | Extra |\n|---|---|---|---|---|---|---|---|';
  const body = rows
    .map((r) => {
      const cell = (v) => (v === null || v === undefined ? '' : String(v).replace(/\|/g, '\\|'));
      return `| ${cell(r.table)} | ${cell(r.type)} | ${cell(r.possible_keys)} | ${cell(r.key)} | ${cell(r.key_len)} | ${cell(r.rows)} | ${cell(r.filtered)} | ${cell(r.Extra)} |`;
    })
    .join('\n');
  return `${header}\n${body}`;
}

function findBaselineCase(baseline, id) {
  if (!baseline) return null;
  return baseline.cases.find((c) => c.id === id) || null;
}

function buildMarkdownReport(payload, baseline) {
  const lines = [];
  lines.push('# Perf Report — Phase 12.4 (10k-question / 1k-user synthetic load)');
  lines.push('');
  lines.push(
    '> Generated by `server/scripts/perf/runPerfSuite.js` against the dedicated, isolated perf database ' +
      '(never the real dev DB or the jest test DB — see that script and `server/scripts/perf/lib/perfDb.js` for the ' +
      'isolation guarantee). Data was produced by `server/scripts/perf/seedSyntheticLoad.js`. Do not hand-edit the ' +
      'auto-generated sections below this line; see the "Findings & indexes added" section at the bottom for the ' +
      'hand-written narrative.'
  );
  lines.push('');
  lines.push(`- **Generated at:** ${payload.generatedAt}`);
  lines.push(`- **Perf database:** \`${payload.dbName}\``);
  lines.push(`- **MySQL version:** ${payload.mysqlVersion}`);
  lines.push(`- **p95 budget (task AC):** < ${P95_BUDGET_MS} ms`);
  lines.push('');
  lines.push('## Seeded row counts');
  lines.push('');
  lines.push('| table | rows |\n|---|---|');
  for (const [table, count] of Object.entries(payload.rowCounts)) {
    lines.push(`| \`${table}\` | ${count.toLocaleString()} |`);
  }
  lines.push('');
  lines.push('## Summary — p50/p95/max per query');
  lines.push('');
  const summaryHeader = baseline
    ? '| # | query | p50 | p95 | max | AC (p95<500ms) | baseline p95 | Δ p95 |'
    : '| # | query | p50 | p95 | max | AC (p95<500ms) |';
  const summarySep = baseline ? '|---|---|---|---|---|---|---|---|' : '|---|---|---|---|---|---|';
  lines.push(summaryHeader);
  lines.push(summarySep);
  payload.cases.forEach((c, idx) => {
    const pass = c.timing.p95 < P95_BUDGET_MS ? 'PASS' : 'FAIL';
    const base = findBaselineCase(baseline, c.id);
    if (baseline) {
      const baseP95 = base ? base.timing.p95 : null;
      const delta = baseP95 != null ? `${(c.timing.p95 - baseP95 >= 0 ? '+' : '')}${(c.timing.p95 - baseP95).toFixed(2)} ms` : 'n/a (new)';
      lines.push(
        `| ${idx + 1} | ${c.name} | ${fmtMs(c.timing.p50)} | ${fmtMs(c.timing.p95)} | ${fmtMs(c.timing.max)} | ${pass} | ${baseP95 != null ? fmtMs(baseP95) : 'n/a'} | ${delta} |`
      );
    } else {
      lines.push(`| ${idx + 1} | ${c.name} | ${fmtMs(c.timing.p50)} | ${fmtMs(c.timing.p95)} | ${fmtMs(c.timing.max)} | ${pass} |`);
    }
  });
  lines.push('');
  lines.push('## Per-query detail');
  lines.push('');

  payload.cases.forEach((c, idx) => {
    lines.push(`### ${idx + 1}. ${c.name}`);
    lines.push('');
    lines.push(`- **Source:** \`${c.sourceRef}\``);
    if (c.note) lines.push(`- **Note:** ${c.note}`);
    lines.push(`- **Statements captured:** ${c.statementsCount}`);
    lines.push(
      `- **Timing (${c.timing.iterations} iterations, after warmup):** p50 = ${fmtMs(c.timing.p50)}, p95 = ${fmtMs(c.timing.p95)}, max = ${fmtMs(c.timing.max)}, min = ${fmtMs(c.timing.min)}`
    );
    const base = findBaselineCase(baseline, c.id);
    if (base) {
      lines.push(
        `- **Baseline comparison:** baseline p50 = ${fmtMs(base.timing.p50)}, p95 = ${fmtMs(base.timing.p95)}, max = ${fmtMs(base.timing.max)} → Δp95 = ${(c.timing.p95 - base.timing.p95).toFixed(2)} ms`
      );
    }
    lines.push('');
    c.explains.forEach((e, sIdx) => {
      lines.push(`**EXPLAIN — statement ${sIdx + 1}/${c.explains.length}:**`);
      lines.push('');
      lines.push('```sql');
      lines.push(e.sql);
      lines.push('```');
      lines.push('');
      lines.push(explainTableMarkdown(e.rows));
      lines.push('');
    });
  });

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  console.log(`[perf] target database: ${PERF_DB_NAME}`);
  assertPerfDbIsolated();

  if (opts.migrate) {
    console.log('[perf] applying pending migrations (db:migrate --env perf, additive only) ...');
    migratePerfDb();
  }

  const sequelize = buildPerfSequelize();
  const db = await loadPerfModels(sequelize);

  try {
    const [[{ version }]] = await sequelize.query('SELECT VERSION() AS version');
    const rowCounts = await gatherRowCounts(sequelize);

    const subjects = await db.Subject.findAll({ limit: 2, order: [['id', 'ASC']] });
    const systems = await db.BodySystem.findAll({ limit: 2, order: [['id', 'ASC']] });
    const sampleCategory = 'NRE1';
    const sampleSubjectIds = subjects.map((s) => s.id);
    const sampleSystemIds = systems.map((s) => s.id);
    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const lpRow = await db.LectureProgress.findOne({ where: { isCompleted: false }, order: [['id', 'ASC']] });
    const fallbackEnrollment = lpRow ? null : await db.Enrollment.findOne({ order: [['id', 'ASC']] });
    const sampleStudentId = lpRow ? lpRow.userId : fallbackEnrollment.userId;

    const testsTakenRows = await db.TestSession.findAll({
      attributes: ['userId', [fn('COUNT', col('id')), 'testsTaken']],
      where: { status: 'completed' },
      group: ['userId'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      limit: 10,
      raw: true,
    });
    const top10UserIds = testsTakenRows.map((r) => r.userId);

    console.log(
      `[perf] sample params: category=${sampleCategory} subjectIds=${sampleSubjectIds} systemIds=${sampleSystemIds} ` +
        `studentId=${sampleStudentId} top10UserIds=${top10UserIds.length}`
    );

    const cases = [
      // ---------------------------------------------------------------
      // 1. QBank test-session creation's question-pool resolution
      // ---------------------------------------------------------------
      {
        id: 'qbank-pool-all-category-only',
        name: 'QBank pool resolution — pool:"all", examCategory only (no subject/system narrowing)',
        sourceRef: 'server/src/services/qbankService.js#resolvePoolQuestionIds (pool==="all" branch)',
        note: 'Most common real create-test call shape: a student picks only an exam category.',
        run: (logging) =>
          db.Question.findAll({
            where: { examCategory: sampleCategory, isActive: true },
            attributes: ['id'],
            order: sequelize.random(),
            limit: 40,
            raw: true,
            logging,
          }),
      },
      {
        id: 'qbank-pool-all-filtered',
        name: 'QBank pool resolution — pool:"all", examCategory + subjectIds + systemIds filters',
        sourceRef: 'server/src/services/qbankService.js#resolvePoolQuestionIds (pool==="all" branch, subjectId/systemId IN (...) applied)',
        note:
          'This is the query the task brief describes as filtering on "examCategory/subject/system/difficulty" — ' +
          'read the actual source: resolvePoolQuestionIds has NO difficulty filter at all (only examCategory, ' +
          'subjectId IN(...), systemId IN(...), isActive=true). Measured exactly as implemented, not as described.',
        run: (logging) =>
          db.Question.findAll({
            where: { examCategory: sampleCategory, isActive: true, subjectId: sampleSubjectIds, systemId: sampleSystemIds },
            attributes: ['id'],
            order: sequelize.random(),
            limit: 40,
            raw: true,
            logging,
          }),
      },

      // ---------------------------------------------------------------
      // 2. Admin KPI dashboard revenue/enrollment aggregates
      // ---------------------------------------------------------------
      {
        id: 'admin-dashboard-revenue-total',
        name: 'Admin KPI dashboard — lifetime paid revenue (sumPaidRevenue(), revenueTotal)',
        sourceRef: 'server/src/services/adminDashboardService.js#sumPaidRevenue',
        run: (logging) =>
          db.Order.findOne({ attributes: [[fn('SUM', col('final_amount')), 'total']], where: { status: 'paid' }, raw: true, logging }),
      },
      {
        id: 'admin-dashboard-revenue-trend',
        name: 'Admin KPI dashboard — 30-day revenue trend raw scan',
        sourceRef: 'server/src/services/adminDashboardService.js#buildRevenueTrend',
        run: (logging) =>
          db.Order.findAll({
            attributes: ['paidAt', 'finalAmount'],
            where: { status: 'paid', paidAt: { [Op.gte]: windowStart } },
            raw: true,
            logging,
          }),
      },
      {
        id: 'admin-dashboard-top-courses',
        name: 'Admin KPI dashboard — top 5 courses by active enrollment (computeTopCourses, query 1/2)',
        sourceRef: 'server/src/services/adminDashboardService.js#computeTopCourses',
        run: (logging) =>
          db.Enrollment.findAll({
            attributes: ['courseId', [fn('COUNT', col('id')), 'enrollmentsCount']],
            where: { status: 'active' },
            group: ['courseId'],
            order: [[fn('COUNT', col('id')), 'DESC']],
            limit: 5,
            raw: true,
            logging,
          }),
      },

      // ---------------------------------------------------------------
      // 3. Admin reports grouped aggregates
      // ---------------------------------------------------------------
      {
        id: 'admin-reports-top-subjects',
        name: 'Admin reports — topSubjectsAttempted grouped join (test_attempt_questions x questions)',
        sourceRef: 'server/src/services/adminReportsService.js#buildTopSubjectsAttempted',
        note: 'Heaviest of the reports queries: no user/session restriction, scans every answered attempt row.',
        run: (logging) =>
          db.TestAttemptQuestion.findAll({
            attributes: [
              [col('question.subject_id'), 'subjectId'],
              [col('TestAttemptQuestion.is_correct'), 'isCorrect'],
              [fn('COUNT', col('TestAttemptQuestion.id')), 'cnt'],
            ],
            include: [{ model: db.Question, as: 'question', attributes: [], required: true }],
            where: { answeredAt: { [Op.ne]: null } },
            group: [col('question.subject_id'), col('TestAttemptQuestion.is_correct')],
            raw: true,
            logging,
          }),
      },
      {
        id: 'admin-reports-top-students-testscount',
        name: 'Admin reports — topStudents testsTaken grouped query (1/3)',
        sourceRef: 'server/src/services/adminReportsService.js#buildTopStudents (testsTakenRows)',
        run: (logging) =>
          db.TestSession.findAll({
            attributes: ['userId', [fn('COUNT', col('id')), 'testsTaken']],
            where: { status: 'completed' },
            group: ['userId'],
            order: [[fn('COUNT', col('id')), 'DESC']],
            limit: 10,
            raw: true,
            logging,
          }),
      },
      {
        id: 'admin-reports-top-students-accuracy',
        name: 'Admin reports — topStudents accuracy grouped join (2/3, scoped to top-10 user ids)',
        sourceRef: 'server/src/services/adminReportsService.js#buildTopStudents (accuracyRows)',
        run: (logging) =>
          db.TestAttemptQuestion.findAll({
            attributes: [
              [col('testSession.user_id'), 'userId'],
              [col('TestAttemptQuestion.is_correct'), 'isCorrect'],
              [fn('COUNT', col('TestAttemptQuestion.id')), 'cnt'],
            ],
            include: [{ model: db.TestSession, as: 'testSession', attributes: [], required: true, where: { userId: top10UserIds } }],
            where: { answeredAt: { [Op.ne]: null } },
            group: [col('testSession.user_id'), col('TestAttemptQuestion.is_correct')],
            raw: true,
            logging,
          }),
      },

      // ---------------------------------------------------------------
      // 4. Student dashboard continue-watching + enrollment query
      // ---------------------------------------------------------------
      {
        id: 'student-dashboard-continue-watching',
        name: 'Student dashboard — continue-watching lookup',
        sourceRef: 'server/src/services/studentDashboardService.js#loadContinueWatching',
        run: (logging) =>
          db.LectureProgress.findOne({
            where: { userId: sampleStudentId, isCompleted: false },
            order: [['updatedAt', 'DESC']],
            include: [{ model: db.Lecture, as: 'lecture', include: [{ model: db.Course, as: 'course' }] }],
            logging,
          }),
      },
      {
        id: 'student-dashboard-enrollments',
        name: 'Student dashboard / My Courses — enrollments+course query',
        sourceRef: 'server/src/services/studentCourseService.js#getEnrollmentsWithProgress (enrollments query, 1/2)',
        run: (logging) =>
          db.Enrollment.findAll({
            where: { userId: sampleStudentId },
            include: [{ model: db.Course, as: 'course' }],
            order: [['id', 'DESC']],
            logging,
          }),
      },

      // ---------------------------------------------------------------
      // 5. Admin question-bank list
      // ---------------------------------------------------------------
      {
        id: 'admin-question-bank-list',
        name: 'Admin QBank question list (listQuestionsAdmin) — flat limit:1000, no pagination',
        sourceRef: 'server/src/services/adminQuestionService.js#listQuestionsAdmin',
        note: 'Flagged in the task brief as most likely to be slow at 10k rows (flat limit:1000, no WHERE, no pagination).',
        run: (logging) =>
          db.Question.findAll({
            limit: 1000,
            order: [['id', 'DESC']],
            include: [
              { model: db.Subject, as: 'subject' },
              { model: db.BodySystem, as: 'system' },
              { model: db.QuestionOption, as: 'questionOptions', separate: true, order: [['sortOrder', 'ASC']] },
            ],
            logging,
          }),
      },
    ];

    const results = [];
    for (const def of cases) {
      console.log(`[perf] running case: ${def.id} ...`);
      const result = await runCase(sequelize, def, { iterations: opts.iterations, warmup: opts.warmup });
      results.push(result);
      console.log(`[perf]   p50=${result.timing.p50.toFixed(2)}ms p95=${result.timing.p95.toFixed(2)}ms max=${result.timing.max.toFixed(2)}ms`);
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      dbName: PERF_DB_NAME,
      mysqlVersion: version,
      rowCounts,
      sampleParams: { sampleCategory, sampleSubjectIds, sampleSystemIds, sampleStudentId, top10UserIds },
      cases: results,
    };

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTS_DIR, `${opts.save}.json`), JSON.stringify(payload, null, 2));

    let baseline = null;
    const baselineName = opts.baseline || (opts.save !== 'baseline' ? 'baseline' : null);
    if (baselineName) {
      const p = path.join(RESULTS_DIR, `${baselineName}.json`);
      if (fs.existsSync(p)) baseline = JSON.parse(fs.readFileSync(p, 'utf8'));
    }

    const markdown = buildMarkdownReport(payload, baseline);
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, markdown);
    console.log(`[perf] wrote ${REPORT_PATH}`);
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error('[perf] runPerfSuite.js FAILED:', err);
  process.exitCode = 1;
});
