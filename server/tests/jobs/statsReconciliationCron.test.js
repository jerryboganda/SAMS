// server/tests/jobs/statsReconciliationCron.test.js
// Unit tests for services/statsService.js#reconcileUserDailyStats — the
// aggregation/update LOGIC behind jobs/statsReconciliationCron.js, called
// directly (per this task's explicit instruction: don't try to test actual
// node-cron scheduling). Like the difficulty-cron job, this job's own scan
// is GLOBAL within its bounded time window (every user's recent
// user_daily_stats rows, not one user) — every assertion below is keyed to
// THIS file's own freshly-created (userId, statDate) rows, which no other
// spec file can collide with (fresh uniqueEmail() user per test), so this
// file's assertions stay deterministic regardless of what else exists in the
// shared test DB. See services/statsService.js's doc comment + DECISIONS.md
// for the full "why build this at all" reasoning.
import { afterAll, describe, expect, test } from '@jest/globals';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser } from '../helpers/testUsers.js';
import { reconcileUserDailyStats } from '../../src/services/statsService.js';

const { sequelize, TestAttemptQuestion, QuestionOption, UserDailyStat } = db;

afterAll(async () => {
  await sequelize.close();
});

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

async function answerAttempt(session, question, result, timeSpentSeconds) {
  const attempt = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: question.id } });
  if (result === 'skipped') {
    attempt.selectedOptionId = null;
    attempt.isCorrect = null;
  } else {
    const options = await QuestionOption.findAll({ where: { questionId: question.id }, order: [['sortOrder', 'ASC']] });
    const chosen = result === 'correct' ? options.find((o) => o.isCorrect) : options.find((o) => !o.isCorrect);
    attempt.selectedOptionId = chosen.id;
    attempt.isCorrect = result === 'correct';
  }
  attempt.timeSpentSeconds = timeSpentSeconds;
  attempt.answeredAt = result === 'skipped' ? null : new Date();
  await attempt.save();
}

describe('statsService.reconcileUserDailyStats', () => {
  test('corrects a drifted row from real completed-session source data, and never touches video_seconds', async () => {
    const { user } = await createVerifiedUser({ email: `recon-${Date.now()}-1@example.test` });
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q1, q2] = await createQuestions(subject, system, 2, { examCategory: 'OTHER' });

    const session = await createTestSessionDirect(user, [q1, q2], { status: 'completed', completedAt: new Date() });
    await answerAttempt(session, q1, 'correct', 15);
    await answerAttempt(session, q2, 'incorrect', 25);
    // True answered-based reconciled values: questionsAttempted=2,
    // questionsCorrect=1, qbankSeconds=15+25=40.

    // Pre-seed a deliberately WRONG ("drifted") row plus a real video_seconds
    // value that must survive untouched.
    await UserDailyStat.create({
      userId: user.id,
      statDate: todayDateStr(),
      questionsAttempted: 999,
      questionsCorrect: 999,
      qbankSeconds: 999,
      videoSeconds: 500,
    });

    const result = await reconcileUserDailyStats(3);
    expect(result.corrected).toBeGreaterThanOrEqual(1);

    const row = await UserDailyStat.findOne({ where: { userId: user.id, statDate: todayDateStr() } });
    expect(row.questionsAttempted).toBe(2);
    expect(row.questionsCorrect).toBe(1);
    expect(row.qbankSeconds).toBe(40);
    expect(row.videoSeconds).toBe(500); // untouched -- no raw per-event log to reconcile it against
  });

  test('abandoned sessions are excluded from the reconciled truth (matching bumpDailyStat\'s own abandon-skip design) -- no row is created for a purely-abandoned day', async () => {
    const { user } = await createVerifiedUser({ email: `recon-${Date.now()}-2@example.test` });
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q1] = await createQuestions(subject, system, 1, { examCategory: 'OTHER' });

    const session = await createTestSessionDirect(user, [q1], { status: 'abandoned', completedAt: new Date() });
    await answerAttempt(session, q1, 'correct', 30);

    await reconcileUserDailyStats(3);

    const row = await UserDailyStat.findOne({ where: { userId: user.id, statDate: todayDateStr() } });
    expect(row).toBeNull();
  });

  test('bounded window: a drifted row OUTSIDE the daysBack window is left untouched', async () => {
    const { user } = await createVerifiedUser({ email: `recon-${Date.now()}-3@example.test` });
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await UserDailyStat.create({
      userId: user.id,
      statDate: tenDaysAgo,
      questionsAttempted: 500,
      questionsCorrect: 500,
      qbankSeconds: 500,
      videoSeconds: 0,
    });

    await reconcileUserDailyStats(3); // default window only covers the last 3 days

    const row = await UserDailyStat.findOne({ where: { userId: user.id, statDate: tenDaysAgo } });
    expect(row.questionsAttempted).toBe(500); // untouched -- outside the bounded window
  });
});
