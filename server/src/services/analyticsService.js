// server/src/services/analyticsService.js
// Business logic for GET /qbank/analytics (docs/04_API_SPEC.md §4,
// docs/02_ARCHITECTURE.md §5, docs/07_EXECUTION_PLAN.md 8.1). Kept as its own
// service file per docs/02_ARCHITECTURE.md §2's explicit services list
// ("... qbankService, testService, ... analyticsService, ... statsService")
// even though the route itself is mounted under the qbank router
// (routes/v1/qbank.js, alongside the rest of §4) — same "route grouping !=
// service-file grouping" precedent already established by
// studentDashboardService.js sitting next to studentCourseService.js.
// Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
//
// Response shape matched to the already-built frontend's mock fixture
// (client/src/api/endpoints/qbank.ts's `getAnalytics()` USE_MOCK branch —
// the ONLY concrete contract available; there is no `Analytics*` type in
// client/src/types/index.ts and the real branch is `apiFetch<any>(...)`) per
// CLAUDE.md §1a: `{ overall:{totalAttempted,totalCorrect,totalIncorrect,
// totalSkipped,overallPercent,avgTimePerQuestionSeconds}, strengths:[{name,
// score}], weaknesses:[{name,score}], subjectPerformance:[{subjectId,name,
// total,correct,percent}], systemPerformance:[{systemId,name,total,correct,
// percent}], dailyTrend:[{date,questions,correct}] }`. See DECISIONS.md's
// dated Phase 8.1 entry for every contract-drift/frontend finding (the page
// itself, client/src/pages/student/AnalyticsPage.tsx, never actually sends a
// `?range=` query param nor reads `dailyTrend` today — both real, harmless
// gaps left for the Phase 8.2 wiring task, not fixed here since client/ is
// read-only this round).
import { Op, col, fn } from 'sequelize';
import db from '../models/index.js';

const { TestSession, TestAttemptQuestion, Question, Subject, BodySystem, UserDailyStat } = db;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Scope: which test_sessions count toward "attempted" for this endpoint
// ---------------------------------------------------------------------------
// Both terminal states — 'completed' AND 'abandoned' — count. A question
// answered inside an abandoned test still has a real, graded
// correct/incorrect verdict on its test_attempt_questions row (see
// qbankService.js#finalizeAbandoned: it computes correct/incorrect/skipped
// via the exact same scoreAttemptQuestions() helper a real submit uses), so
// there is no reason to hide that signal from the student's own analytics.
// 'in_progress' sessions are excluded — not yet finalized/graded, mirroring
// the terminal-status gate used throughout qbankService.js
// (`session.status !== 'in_progress'`).
//
// This is a DIFFERENTLY-SCOPED (wider) definition than
// jobs/statsReconciliationCron.js's reconciliation query, which deliberately
// narrows to 'completed' ONLY — that job exists purely to re-derive what the
// LIVE bumpDailyStat() increment already wrote (which skips 'abandoned' by
// design, per finalizeAbandoned's own doc comment: "user_daily_stats is NOT
// touched at all on abandon"), not to redefine what "attempted" means for
// this read-only analytics endpoint. The two are allowed to disagree on
// scope because they answer different questions ("what did the live counter
// record?" vs. "what has this student actually done?"). See DECISIONS.md.
const ATTEMPT_SCOPE_STATUSES = ['completed', 'abandoned'];

// Minimum ATTEMPTED question count (`total` — the SAME denominator the
// displayed `percent` itself uses, deliberately not a separately-defined
// "answered only" count, so a subject/system is never gated by a number the
// student can't also see) a subject/system needs before it is eligible to
// appear in strengths/weaknesses. Below this floor, a subject stays visible
// in subjectPerformance/systemPerformance (real total/correct/percent, never
// hidden) but is excluded from the ranked top/bottom lists — a single lucky
// (or unlucky) guess must not become "your strongest area". 5 chosen to
// mirror QBANK_TEST_COUNT_MIN (server/src/config/constants.js) — the
// smallest test block a student can ever create — as "one minimum-size
// block's worth of engagement", a defensible floor for a real sample without
// inventing an unrelated new magic number. Documented per this task's
// explicit instruction; see DECISIONS.md.
const STRENGTHS_MIN_ATTEMPTED = 5;

// Matches the shipped AnalyticsPage.tsx's hardcoded "(Top 3)" / "(Bottom 3)"
// panel headings (client/src/pages/student/AnalyticsPage.tsx) — not a
// coincidence, that UI copy is the reason 3 was picked, not the other way
// around.
const STRENGTHS_WEAKNESSES_TOP_N = 3;

// ---------------------------------------------------------------------------
// Series window sizes per `?range=` (docs/04_API_SPEC.md §4 "series ...
// ?range=daily|weekly|monthly from user_daily_stats"). "Your call" per the
// task brief — documented here and in DECISIONS.md:
//   daily:   last 30 days,  one bucket per calendar UTC day.
//   weekly:  last 12 weeks, one bucket per rolling 7-day window (12*7=84
//            days), most recent bucket = [today-6, today].
//   monthly: last 12 months, one bucket per calendar UTC month.
// Default (no `?range=` given): 'daily' — the closest match to
// AnalyticsPage.tsx's own default 30-day view (`dateRange` state initialized
// to `30`), even though that page doesn't wire `?range=` through to this
// endpoint yet (see file header + DECISIONS.md).
// ---------------------------------------------------------------------------
const SERIES_RANGES = {
  daily: { unit: 'day', count: 30 },
  weekly: { unit: 'week', count: 12 },
  monthly: { unit: 'month', count: 12 },
};
const DEFAULT_RANGE = 'daily';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateOnly(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatYearMonth(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function utcDateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ---------------------------------------------------------------------------
// Overall totals + avg time/Q — ONE grouped aggregate query (grouped by
// `is_correct`, which is NULL for a skipped question, `false` for a
// selected-but-wrong option, `true` for correct — see
// qbankService.js#answerQuestion), never a per-question loop. `col()`
// entries deliberately reference the PHYSICAL (already-underscored) column
// names, not the camelCase JS attribute names — `col()` inside
// attributes/group is NOT run through the model's underscored-mapping the
// way plain where/bare-string attributes/group entries are, empirically
// verified in services/studentCourseService.js#loadProgressByCourseId (see
// its doc comment + DECISIONS.md 2026-07-31); reusing that already-proven
// pattern here rather than re-verifying from scratch.
//
// `totalAttempted` deliberately counts EVERY row in scope, including skipped
// ones (selected_option_id IS NULL) — NOT "answered only". This matches the
// arithmetic identity baked into the frontend's own mock fixture
// (`getAnalytics()`'s USE_MOCK branch: totalCorrect(321)+totalIncorrect(84)+
// totalSkipped(15)=420=totalAttempted, and overallPercent(76.4) =
// round(321/420*10000)/100 exactly) — i.e. "attempted" here means "was part
// of a graded test", not "an option was actually selected". This is a
// narrower-sounding but DIFFERENT definition than user_daily_stats'
// live-incremented `questions_attempted` column (which credits ANSWERED-only,
// selected_option_id IS NOT NULL — see qbankService.js#finalizeCompleted's
// own doc comment) — the two are allowed to disagree because they serve
// different call sites with different established contracts; matching each
// one's own precedent exactly (not inventing a third definition) is the
// priority. See DECISIONS.md.
async function computeOverall(userId) {
  const rows = await TestAttemptQuestion.findAll({
    attributes: [
      [col('TestAttemptQuestion.is_correct'), 'isCorrect'],
      [fn('COUNT', col('TestAttemptQuestion.id')), 'cnt'],
      [fn('SUM', col('TestAttemptQuestion.time_spent_seconds')), 'timeSum'],
    ],
    include: [
      {
        model: TestSession,
        as: 'testSession',
        attributes: [],
        required: true,
        where: { userId, status: ATTEMPT_SCOPE_STATUSES },
      },
    ],
    group: [col('TestAttemptQuestion.is_correct')],
    raw: true,
  });

  let totalAttempted = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let totalSkipped = 0;
  let totalTimeSpentSeconds = 0;

  for (const row of rows) {
    const cnt = Number(row.cnt) || 0;
    const timeSum = Number(row.timeSum) || 0;
    totalAttempted += cnt;
    totalTimeSpentSeconds += timeSum;
    if (row.isCorrect === true || row.isCorrect === 1) totalCorrect += cnt;
    else if (row.isCorrect === false || row.isCorrect === 0) totalIncorrect += cnt;
    else totalSkipped += cnt;
  }

  const overallPercent = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 10000) / 100 : 0;
  const avgTimePerQuestionSeconds = totalAttempted > 0 ? Math.round(totalTimeSpentSeconds / totalAttempted) : 0;

  return { totalAttempted, totalCorrect, totalIncorrect, totalSkipped, overallPercent, avgTimePerQuestionSeconds };
}

// ---------------------------------------------------------------------------
// Subject-wise / system-wise arrays — ONE grouped aggregate query each (2
// total for both arrays), joined through `question` to reach
// subject_id/system_id, grouped by (that taxonomy id, is_correct). Never one
// query per subject/system (no N+1) — this is what the task brief explicitly
// calls out ("grouped aggregate queries, not N+1 per subject").
//
// Only subjects/systems the user has ACTUALLY attempted at least one
// question in are returned (`total > 0`) — deliberately NOT
// getQbankMeta()'s "every taxonomy row, even with an honest 0" convention.
// That convention exists there because GET /qbank/meta is a filter-picker
// (a student needs to see a subject exists even with zero matching
// questions, to decide whether to filter by it); this endpoint is a
// performance-history chart, where a subject the student has literally never
// touched carries no signal and would just be a meaningless 0%-flatline bar
// cluttering the chart. See DECISIONS.md.
async function computeGroupPerformance(userId, physicalColumn, TaxonomyModel, idField) {
  const rows = await TestAttemptQuestion.findAll({
    attributes: [
      [col(`question.${physicalColumn}`), 'groupId'],
      [col('TestAttemptQuestion.is_correct'), 'isCorrect'],
      [fn('COUNT', col('TestAttemptQuestion.id')), 'cnt'],
    ],
    include: [
      {
        model: TestSession,
        as: 'testSession',
        attributes: [],
        required: true,
        where: { userId, status: ATTEMPT_SCOPE_STATUSES },
      },
      { model: Question, as: 'question', attributes: [], required: true },
    ],
    group: [col(`question.${physicalColumn}`), col('TestAttemptQuestion.is_correct')],
    raw: true,
  });

  const byGroup = new Map();
  for (const row of rows) {
    const groupId = row.groupId;
    if (groupId == null) continue;
    if (!byGroup.has(groupId)) byGroup.set(groupId, { total: 0, correct: 0 });
    const bucket = byGroup.get(groupId);
    const cnt = Number(row.cnt) || 0;
    bucket.total += cnt;
    if (row.isCorrect === true || row.isCorrect === 1) bucket.correct += cnt;
  }

  if (byGroup.size === 0) return [];

  const taxonomyRows = await TaxonomyModel.findAll({
    where: { id: [...byGroup.keys()] },
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
  });

  return taxonomyRows.map((t) => {
    const bucket = byGroup.get(t.id);
    const percent = bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : 0;
    return { [idField]: t.id, name: t.name, total: bucket.total, correct: bucket.correct, percent };
  });
}

// ---------------------------------------------------------------------------
// Strengths / weaknesses — derived in-memory from the two arrays above (no
// extra query). Combined candidate pool = every subject AND every system
// entry together (the frontend's own mock fixture mixes both kinds in one
// list — e.g. "Cardiovascular System" sitting next to "Pathology"/
// "Pharmacology" — confirming this is a single blended ranking, not
// separate "top subject" / "top system" lists). Floor-filtered
// (STRENGTHS_MIN_ATTEMPTED) before ranking. Strengths = top N by percent
// desc; weaknesses = bottom N by percent asc, drawn from the REMAINING
// candidates after strengths are removed (a small candidate pool can never
// produce the same subject/system in both lists). Ties broken by total desc
// (more data = more representative) then name asc (determinism).
// ---------------------------------------------------------------------------
function deriveStrengthsWeaknesses(subjectPerformance, systemPerformance) {
  const candidates = [
    ...subjectPerformance.map((s) => ({ key: `subject:${s.subjectId}`, name: s.name, total: s.total, percent: s.percent })),
    ...systemPerformance.map((s) => ({ key: `system:${s.systemId}`, name: s.name, total: s.total, percent: s.percent })),
  ].filter((c) => c.total >= STRENGTHS_MIN_ATTEMPTED);

  const byPercentDesc = (a, b) => b.percent - a.percent || b.total - a.total || a.name.localeCompare(b.name);
  const byPercentAsc = (a, b) => a.percent - b.percent || b.total - a.total || a.name.localeCompare(b.name);

  const strengthsRanked = [...candidates].sort(byPercentDesc).slice(0, STRENGTHS_WEAKNESSES_TOP_N);
  const strongKeys = new Set(strengthsRanked.map((c) => c.key));

  const weaknessesRanked = candidates
    .filter((c) => !strongKeys.has(c.key))
    .sort(byPercentAsc)
    .slice(0, STRENGTHS_WEAKNESSES_TOP_N);

  return {
    strengths: strengthsRanked.map((c) => ({ name: c.name, score: c.percent })),
    weaknesses: weaknessesRanked.map((c) => ({ name: c.name, score: c.percent })),
  };
}

// ---------------------------------------------------------------------------
// Series (`dailyTrend`) — reads directly from `user_daily_stats`, ALREADY
// kept live-updated on every real qbank submit/abandon-with-answers
// (qbankService.js#bumpDailyStat) and every video heartbeat
// (videoService.js) — no cron needed for THIS part to be correct today (see
// this task's own brief). ONE query fetches every row in the window; bucket
// placement + zero-fill happen in memory (window sizes are small — at most
// 90 raw rows for the 'weekly' 12*7-day case — never a per-bucket query).
// Every bucket in the window is present in the output, zero-filled when no
// user_daily_stats row exists for that day, so the series is always a
// continuous, gap-free array a line/bar chart can render directly.
// ---------------------------------------------------------------------------
async function buildSeries(userId, range) {
  const cfg = SERIES_RANGES[range] || SERIES_RANGES[DEFAULT_RANGE];
  const todayUtc = utcDateOnly(new Date());

  let windowStart;
  if (cfg.unit === 'day') {
    windowStart = new Date(todayUtc);
    windowStart.setUTCDate(windowStart.getUTCDate() - (cfg.count - 1));
  } else if (cfg.unit === 'week') {
    windowStart = new Date(todayUtc);
    windowStart.setUTCDate(windowStart.getUTCDate() - (cfg.count * 7 - 1));
  } else {
    windowStart = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - (cfg.count - 1), 1));
  }

  const rows = await UserDailyStat.findAll({
    where: { userId, statDate: { [Op.gte]: formatDateOnly(windowStart) } },
    raw: true,
  });

  const buckets = new Map();
  const order = [];

  if (cfg.unit === 'day') {
    for (let i = 0; i < cfg.count; i += 1) {
      const d = new Date(windowStart);
      d.setUTCDate(d.getUTCDate() + i);
      const key = formatDateOnly(d);
      order.push(key);
      buckets.set(key, { date: key, questionsAttempted: 0, questionsCorrect: 0, qbankSeconds: 0 });
    }
    for (const row of rows) {
      const bucket = buckets.get(row.statDate);
      if (bucket) {
        bucket.questionsAttempted += Number(row.questionsAttempted) || 0;
        bucket.questionsCorrect += Number(row.questionsCorrect) || 0;
        bucket.qbankSeconds += Number(row.qbankSeconds) || 0;
      }
    }
  } else if (cfg.unit === 'week') {
    for (let i = 0; i < cfg.count; i += 1) {
      const weekStart = new Date(windowStart);
      weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
      const key = formatDateOnly(weekStart);
      order.push(key);
      buckets.set(key, { date: key, questionsAttempted: 0, questionsCorrect: 0, qbankSeconds: 0 });
    }
    for (const row of rows) {
      const rowDate = new Date(`${row.statDate}T00:00:00.000Z`);
      const daysFromStart = Math.floor((rowDate.getTime() - windowStart.getTime()) / MS_PER_DAY);
      const weekIndex = Math.min(cfg.count - 1, Math.max(0, Math.floor(daysFromStart / 7)));
      const bucket = buckets.get(order[weekIndex]);
      if (bucket) {
        bucket.questionsAttempted += Number(row.questionsAttempted) || 0;
        bucket.questionsCorrect += Number(row.questionsCorrect) || 0;
        bucket.qbankSeconds += Number(row.qbankSeconds) || 0;
      }
    }
  } else {
    for (let i = 0; i < cfg.count; i += 1) {
      const d = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + i, 1));
      const key = formatYearMonth(d);
      order.push(key);
      buckets.set(key, { date: key, questionsAttempted: 0, questionsCorrect: 0, qbankSeconds: 0 });
    }
    for (const row of rows) {
      const rowDate = new Date(`${row.statDate}T00:00:00.000Z`);
      const bucket = buckets.get(formatYearMonth(rowDate));
      if (bucket) {
        bucket.questionsAttempted += Number(row.questionsAttempted) || 0;
        bucket.questionsCorrect += Number(row.questionsCorrect) || 0;
        bucket.qbankSeconds += Number(row.qbankSeconds) || 0;
      }
    }
  }

  return order.map((key) => {
    const b = buckets.get(key);
    return { date: b.date, questions: b.questionsAttempted, correct: b.questionsCorrect, qbankSeconds: b.qbankSeconds };
  });
}

// ---------------------------------------------------------------------------
// GET /qbank/analytics
// ---------------------------------------------------------------------------

/**
 * `range` is already zod-validated + defaulted by the controller
 * (`z.enum(['daily','weekly','monthly']).default('daily')`); an unrecognized
 * value can't reach this function, but `SERIES_RANGES[range] ||
 * SERIES_RANGES[DEFAULT_RANGE]` inside buildSeries is a defensive
 * belt-and-suspenders fallback regardless.
 */
export async function getAnalytics(userId, range = DEFAULT_RANGE) {
  const [overall, subjectPerformance, systemPerformance, dailyTrend] = await Promise.all([
    computeOverall(userId),
    computeGroupPerformance(userId, 'subject_id', Subject, 'subjectId'),
    computeGroupPerformance(userId, 'system_id', BodySystem, 'systemId'),
    buildSeries(userId, range),
  ]);

  const { strengths, weaknesses } = deriveStrengthsWeaknesses(subjectPerformance, systemPerformance);

  return {
    overall,
    strengths,
    weaknesses,
    subjectPerformance,
    systemPerformance,
    dailyTrend,
    range: SERIES_RANGES[range] ? range : DEFAULT_RANGE,
  };
}

export default { getAnalytics };
