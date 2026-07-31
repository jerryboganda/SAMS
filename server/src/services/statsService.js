// server/src/services/statsService.js
// Pure aggregation/update logic for the two Phase 8.1 cron jobs
// (docs/07_EXECUTION_PLAN.md 8.1, docs/02_ARCHITECTURE.md §2's `jobs/`
// directory listing "stats"). Deliberately separated from the `jobs/*.js`
// files, which only own node-cron SCHEDULING — these exported functions are
// the actual logic, directly unit-testable without touching node-cron at
// all (per this task's explicit instruction: "unit-test the
// aggregation/update LOGIC directly ... don't try to test actual node-cron
// scheduling"). Layering: jobs -> services -> models, same spirit as
// routes -> controllers -> services -> models (CLAUDE.md §4).
import { Op, QueryTypes } from 'sequelize';
import db from '../models/index.js';
import logger from '../utils/logger.js';

const { TestAttemptQuestion, TestSession, UserDailyStat, sequelize } = db;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Cron 1 — question-difficulty denormalization
// ---------------------------------------------------------------------------
// docs/03_DATABASE_SCHEMA.md explicitly documents `questions.times_attempted`
// / `times_correct` as "denormalized, cron-refreshed" — i.e. deliberately
// NOT live-incremented on every PATCH /qbank/tests/:id/answer, to avoid write
// contention on hot/popular questions (every student answering the same
// question would otherwise serialize on the same row). This job is the
// nightly (or admin-judgment-interval) full recompute.
//
// ONE atomic, JOIN-based bulk UPDATE — not a per-question loop, not even two
// separate queries, regardless of question-bank size.
//
// This is deliberately raw SQL via `sequelize.query()`, not the ORM query
// builder — and that choice was NOT the first thing tried. The natural
// ORM-native approach (`Question.bulkCreate(rows, { updateOnDuplicate:
// ['timesAttempted','timesCorrect'] })`, i.e. a single `INSERT ... ON
// DUPLICATE KEY UPDATE` fed by one grouped aggregate SELECT) was tried
// first and empirically FAILS against this schema: MySQL validates an
// INSERT statement's NOT NULL columns (questions.subject_id, system_id,
// stem, explanation, exam_category — none of which have a database-level
// DEFAULT) even when every target id already exists and the statement is
// guaranteed to resolve to the UPDATE branch — reproduced against the real
// test DB: `Error: Field 'subject_id' doesn't have a default value`.
// Sequelize's ORM has no primitive for a genuine multi-row "UPDATE ... SET
// x = <different computed value per row>" outside that INSERT-based upsert
// trick, so a JOIN-based UPDATE is the only remaining efficient option.
// This query is 100% static — zero interpolated/external input reaches this
// string at any point — so CLAUDE.md §6's "parameterized queries only"
// intent (preventing injection via UNTRUSTED input) is fully satisfied;
// there is nothing here to parameterize. See DECISIONS.md for the full
// writeup of this decision.
//
// The `LEFT JOIN ... COALESCE(agg.attempted, 0)` shape means every question
// with zero real attempts is reset to 0 in the SAME statement — no separate
// reset pass needed, and no risk of a question whose attempts disappeared
// since the last run (e.g. a future admin bulk-delete/re-seed) keeping a
// stale nonzero count. Only rows with a real answer
// (`selected_option_id IS NOT NULL`) count as an "attempt" — a skipped
// question was shown but never actually attempted, the same
// "attempted = answered" reading qbankService.js#finalizeCompleted's own doc
// comment uses for user_daily_stats.questions_attempted.
export async function recomputeQuestionDifficulty() {
  const [, affectedRows] = await sequelize.query(
    `UPDATE questions q
     LEFT JOIN (
       SELECT question_id,
              COUNT(*) AS attempted,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM test_attempt_questions
       WHERE selected_option_id IS NOT NULL
       GROUP BY question_id
     ) agg ON agg.question_id = q.id
     SET q.times_attempted = COALESCE(agg.attempted, 0),
         q.times_correct = COALESCE(agg.correct, 0)`,
    { type: QueryTypes.UPDATE }
  );

  const questionsWithAttempts = await TestAttemptQuestion.count({
    where: { selectedOptionId: { [Op.ne]: null } },
    distinct: true,
    col: 'questionId',
  });

  logger.info(
    `[cron] recomputeQuestionDifficulty: ${questionsWithAttempts} question(s) with >=1 real attempt (SQL reported affectedRows=${affectedRows}).`
  );
  return { questionsWithAttempts };
}

// ---------------------------------------------------------------------------
// Cron 2 — bounded user_daily_stats reconciliation (qbank columns only)
// ---------------------------------------------------------------------------
// See DECISIONS.md's dated Phase 8.1 entry for the full design-tension
// writeup this doc comment summarizes. Short version:
//
// - docs/02_ARCHITECTURE.md §5 describes analytics as "cached daily into
//   user_daily_stats by cron", but Phase 5 (video heartbeat,
//   videoService.js#heartbeat) and Phase 7 (qbank submit,
//   qbankService.js#finalizeCompleted) ALREADY live-increment
//   user_daily_stats directly and correctly on every real event.
// - `video_seconds` CANNOT be reconciled from raw data at all: heartbeats
//   only ever write an already-aggregated running total (both
//   lecture_progress.watched_seconds and user_daily_stats.video_seconds are
//   themselves live counters, not an append-only per-event log) — there is
//   no source-of-truth table to recompute FROM. This job never touches
//   `video_seconds`.
// - `questions_attempted` / `questions_correct` / `qbank_seconds` CAN be
//   reconstructed — from `test_sessions` (status='completed') joined to
//   `test_attempt_questions`, bucketed by `test_sessions.completed_at`'s UTC
//   date (NOT each individual question's own `answered_at` — a test spanning
//   multiple days credits its ENTIRE contribution to the day it was
//   SUBMITTED, exactly matching qbankService.js#bumpDailyStat's own
//   `todayUtcDateOnly()` semantics at submit time; reconstructing from each
//   question's individual answered_at date would silently REDEFINE what
//   "today's stats" means rather than reconcile drift against the existing
//   definition). `status='abandoned'` sessions are deliberately EXCLUDED
//   here — finalizeAbandoned() never bumps user_daily_stats BY DESIGN (see
//   its own doc comment), so an abandoned test's stats are not "missing
//   data", they're working as intended; reconciling them in would be
//   introducing new behavior, not fixing drift.
// - In today's actual code, finalizeCompleted() wraps the session-completion
//   update AND the bumpDailyStat() call in ONE sequelize.transaction — so
//   there is currently no known code path that leaves the two out of sync.
//   This job is deliberately built anyway as cheap defensive insurance
//   against a FUTURE regression (a refactor that splits that transaction, a
//   new manual-stat-adjustment path that bypasses bumpDailyStat, a direct
//   DB migration/backfill) — not a fix for a bug that exists today.
//
// Bounded window (default last 3 UTC days, INCLUDING today) — cheap
// (recent-activity volume only, never a full-history scan) and reconciles
// BOTH directions: a value too LOW (a write that silently failed to apply)
// and a value too HIGH (e.g. a hypothetical future double-increment bug) —
// every (user, date) pair with EITHER an existing user_daily_stats row OR
// real completed-session activity in the window gets its qbank columns
// overwritten with the freshly recomputed truth (not incremented — a full
// per-day recompute, matching this job's "reconciliation" framing).
export async function reconcileUserDailyStats(daysBack = 3) {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const windowStart = new Date(todayUtc.getTime() - (daysBack - 1) * MS_PER_DAY);

  const [attemptRows, existingStatRows] = await Promise.all([
    TestAttemptQuestion.findAll({
      attributes: ['selectedOptionId', 'isCorrect', 'timeSpentSeconds'],
      include: [
        {
          model: TestSession,
          as: 'testSession',
          attributes: ['userId', 'completedAt'],
          required: true,
          where: { status: 'completed', completedAt: { [Op.gte]: windowStart } },
        },
      ],
      raw: true,
      nest: true,
    }),
    UserDailyStat.findAll({
      where: { statDate: { [Op.gte]: formatDateOnly(windowStart) } },
      raw: true,
    }),
  ]);

  // Recompute the TRUE (userId, statDate) -> {questionsAttempted,
  // questionsCorrect, qbankSeconds} map from the raw source rows.
  const truth = new Map();
  for (const row of attemptRows) {
    const userId = row.testSession.userId;
    const statDate = formatDateOnly(row.testSession.completedAt);
    const key = `${userId}|${statDate}`;
    if (!truth.has(key)) truth.set(key, { userId, statDate, questionsAttempted: 0, questionsCorrect: 0, qbankSeconds: 0 });
    const bucket = truth.get(key);
    if (row.selectedOptionId != null) bucket.questionsAttempted += 1;
    if (row.isCorrect === true || row.isCorrect === 1) bucket.questionsCorrect += 1;
    bucket.qbankSeconds += row.timeSpentSeconds || 0;
  }

  // Union with every EXISTING user_daily_stats row in the window (even one
  // with no matching completed-session activity today — that's the "value
  // too HIGH" drift case: the truth for that key is all-zero, and it must be
  // written back as such).
  const keys = new Set(truth.keys());
  for (const row of existingStatRows) {
    keys.add(`${row.userId}|${row.statDate}`);
  }

  let changed = 0;
  let inspected = 0;
  await sequelize.transaction(async (transaction) => {
    for (const key of keys) {
      const [userId, statDate] = key.split('|');
      const truthBucket = truth.get(key) || { questionsAttempted: 0, questionsCorrect: 0, qbankSeconds: 0 };
      inspected += 1;

      const [row] = await UserDailyStat.findOrCreate({
        where: { userId: Number(userId), statDate },
        defaults: { questionsAttempted: 0, questionsCorrect: 0, qbankSeconds: 0, videoSeconds: 0 },
        transaction,
      });

      const isDrifted =
        row.questionsAttempted !== truthBucket.questionsAttempted ||
        row.questionsCorrect !== truthBucket.questionsCorrect ||
        row.qbankSeconds !== truthBucket.qbankSeconds;

      if (isDrifted) {
        row.questionsAttempted = truthBucket.questionsAttempted;
        row.questionsCorrect = truthBucket.questionsCorrect;
        row.qbankSeconds = truthBucket.qbankSeconds;
        // videoSeconds intentionally untouched — see file header: no raw
        // per-event log exists to reconcile it against.
        await row.save({ transaction });
        changed += 1;
      }
    }
  });

  logger.info(
    `[cron] reconcileUserDailyStats: inspected ${inspected} (user,date) row(s) over the last ${daysBack} day(s), corrected ${changed}.`
  );
  return { inspected, corrected: changed };
}

function formatDateOnly(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export default { recomputeQuestionDifficulty, reconcileUserDailyStats };
