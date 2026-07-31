// server/tests/qbank/analytics.test.js
// GET /api/v1/qbank/analytics (docs/04_API_SPEC.md §4, docs/07_EXECUTION_PLAN.md
// 8.1) — hand-computed-fixture aggregate correctness (AC: "aggregates match
// hand-computed seed fixture"), strengths/weaknesses floor + ranking, scope
// (completed+abandoned counted, in_progress excluded), the `?range=` series,
// empty-state, and auth/validation. Fixtures built directly via the model
// layer, scoped to a fresh unique user per test (same isolation mitigation
// Phase 7's DECISIONS.md flagged for this shared-test-DB suite) — every
// query this endpoint runs is scoped by `userId`, so a fresh user per test
// is sufficient isolation regardless of examCategory/subject naming.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize, TestAttemptQuestion, QuestionOption, UserDailyStat } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentAgent(prefix) {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return { agent, user };
}

/** Directly sets one test_attempt_questions row's answer state — bypassing the PATCH /answer HTTP flow for precise, deterministic fixture control (same "create rows directly via the model layer" pattern qbankFixtures.js already establishes). */
async function answerAttempt(session, question, result, timeSpentSeconds = 0) {
  const attempt = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: question.id } });
  if (result === 'skipped') {
    attempt.selectedOptionId = null;
    attempt.isCorrect = null;
    attempt.answeredAt = null;
  } else {
    const options = await QuestionOption.findAll({ where: { questionId: question.id }, order: [['sortOrder', 'ASC']] });
    const chosen = result === 'correct' ? options.find((o) => o.isCorrect) : options.find((o) => !o.isCorrect);
    attempt.selectedOptionId = chosen.id;
    attempt.isCorrect = result === 'correct';
    attempt.answeredAt = new Date();
  }
  attempt.timeSpentSeconds = timeSpentSeconds;
  await attempt.save();
  return attempt;
}

/** First `correctCount` questions answered correct, the rest incorrect — no skips. */
async function answerAllBatch(session, questions, correctCount, timeSpentSeconds = 5) {
  for (let i = 0; i < questions.length; i += 1) {
    await answerAttempt(session, questions[i], i < correctCount ? 'correct' : 'incorrect', timeSpentSeconds);
  }
}

describe('GET /api/v1/qbank/analytics', () => {
  test('happy path: overall totals + subject/system arrays match a hand-computed fixture exactly', async () => {
    const { agent, user } = await studentAgent('an-happy');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q1, q2, q3, q4, q5] = await createQuestions(subject, system, 5, { examCategory: 'OTHER' });

    const session = await createTestSessionDirect(user, [q1, q2, q3, q4, q5], {
      status: 'completed',
      completedAt: new Date(),
      examCategory: 'OTHER',
    });

    // Hand-computed: 2 correct, 2 incorrect, 1 skipped -> total=5, correct%=40.
    // Time spent: 30+40+20+10+0 = 100 -> avg = 100/5 = 20.
    await answerAttempt(session, q1, 'correct', 30);
    await answerAttempt(session, q2, 'correct', 40);
    await answerAttempt(session, q3, 'incorrect', 20);
    await answerAttempt(session, q4, 'incorrect', 10);
    await answerAttempt(session, q5, 'skipped', 0);

    const res = await agent.get('/api/v1/qbank/analytics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;

    expect(data.overall).toEqual({
      totalAttempted: 5,
      totalCorrect: 2,
      totalIncorrect: 2,
      totalSkipped: 1,
      overallPercent: 40,
      avgTimePerQuestionSeconds: 20,
    });

    expect(data.subjectPerformance).toEqual([
      { subjectId: subject.id, name: subject.name, total: 5, correct: 2, percent: 40 },
    ]);
    expect(data.systemPerformance).toEqual([
      { systemId: system.id, name: system.name, total: 5, correct: 2, percent: 40 },
    ]);
  });

  test('strengths/weaknesses: ranked top/bottom 3 by percent, floor excludes a low-sample-size subject/system even when it scores lowest', async () => {
    const { agent, user } = await studentAgent('an-strength');

    const sysCommon = await createBodySystem();
    const sysBelowFloor = await createBodySystem();
    const subj1 = await createSubject();
    const subj2 = await createSubject();
    const subj3 = await createSubject();
    const subj4 = await createSubject();
    const subj5 = await createSubject();

    const q1 = await createQuestions(subj1, sysCommon, 10, { examCategory: 'OTHER' });
    const q2 = await createQuestions(subj2, sysCommon, 10, { examCategory: 'OTHER' });
    const q3 = await createQuestions(subj3, sysCommon, 10, { examCategory: 'OTHER' });
    const q4 = await createQuestions(subj4, sysCommon, 10, { examCategory: 'OTHER' });
    // Below the 5-attempted floor (only 2 questions) despite scoring 0% —
    // must be excluded from strengths/weaknesses but still visible in the
    // subjectPerformance/systemPerformance arrays.
    const q5 = await createQuestions(subj5, sysBelowFloor, 2, { examCategory: 'OTHER' });

    const allQuestions = [...q1, ...q2, ...q3, ...q4, ...q5];
    const session = await createTestSessionDirect(user, allQuestions, {
      status: 'completed',
      completedAt: new Date(),
      examCategory: 'OTHER',
    });

    await answerAllBatch(session, q1, 10); // Subj1: 100% (10/10) -- SysCommon contributes 10/10
    await answerAllBatch(session, q2, 9); // Subj2: 90% (9/10) -- SysCommon contributes 9/10
    await answerAllBatch(session, q3, 5); // Subj3: 50% (5/10) -- SysCommon contributes 5/10
    await answerAllBatch(session, q4, 1); // Subj4: 10% (1/10) -- SysCommon contributes 1/10
    await answerAllBatch(session, q5, 0); // Subj5: 0% (0/2), below floor

    // SysCommon (blended Subj1-4): total=40, correct=10+9+5+1=25 -> 62.5% -> rounds to 63.
    // SysBelowFloor: total=2, correct=0 -> 0%, below floor.

    const res = await agent.get('/api/v1/qbank/analytics');
    expect(res.status).toBe(200);
    const { data } = res.body;

    const bySubjectId = new Map(data.subjectPerformance.map((s) => [s.subjectId, s]));
    expect(bySubjectId.get(subj1.id)).toEqual({ subjectId: subj1.id, name: subj1.name, total: 10, correct: 10, percent: 100 });
    expect(bySubjectId.get(subj2.id)).toEqual({ subjectId: subj2.id, name: subj2.name, total: 10, correct: 9, percent: 90 });
    expect(bySubjectId.get(subj3.id)).toEqual({ subjectId: subj3.id, name: subj3.name, total: 10, correct: 5, percent: 50 });
    expect(bySubjectId.get(subj4.id)).toEqual({ subjectId: subj4.id, name: subj4.name, total: 10, correct: 1, percent: 10 });
    expect(bySubjectId.get(subj5.id)).toEqual({ subjectId: subj5.id, name: subj5.name, total: 2, correct: 0, percent: 0 });

    const bySystemId = new Map(data.systemPerformance.map((s) => [s.systemId, s]));
    expect(bySystemId.get(sysCommon.id)).toEqual({ systemId: sysCommon.id, name: sysCommon.name, total: 40, correct: 25, percent: 63 });
    expect(bySystemId.get(sysBelowFloor.id)).toEqual({ systemId: sysBelowFloor.id, name: sysBelowFloor.name, total: 2, correct: 0, percent: 0 });

    expect(data.strengths).toEqual([
      { name: subj1.name, score: 100 },
      { name: subj2.name, score: 90 },
      { name: sysCommon.name, score: 63 },
    ]);
    expect(data.weaknesses).toEqual([
      { name: subj4.name, score: 10 },
      { name: subj3.name, score: 50 },
    ]);

    // subj5 / sysBelowFloor never appear in either ranked list despite subj5
    // scoring the objective lowest (0%) -- the floor wins.
    const strengthWeaknessNames = new Set([...data.strengths, ...data.weaknesses].map((c) => c.name));
    expect(strengthWeaknessNames.has(subj5.name)).toBe(false);
    expect(strengthWeaknessNames.has(sysBelowFloor.name)).toBe(false);
  });

  test('scope: in_progress session excluded from totals, abandoned session included', async () => {
    const { agent, user } = await studentAgent('an-scope');
    const subject = await createSubject();
    const system = await createBodySystem();

    const [inProgQ1, inProgQ2] = await createQuestions(subject, system, 2, { examCategory: 'OTHER' });
    const inProgressSession = await createTestSessionDirect(user, [inProgQ1, inProgQ2], { examCategory: 'OTHER' }); // status defaults to 'in_progress'
    await answerAttempt(inProgressSession, inProgQ1, 'correct', 999);
    await answerAttempt(inProgressSession, inProgQ2, 'correct', 999);

    const [abQ1, abQ2, abQ3] = await createQuestions(subject, system, 3, { examCategory: 'OTHER' });
    const abandonedSession = await createTestSessionDirect(user, [abQ1, abQ2, abQ3], {
      status: 'abandoned',
      completedAt: new Date(),
      examCategory: 'OTHER',
    });
    await answerAttempt(abandonedSession, abQ1, 'correct', 10);
    await answerAttempt(abandonedSession, abQ2, 'incorrect', 10);
    await answerAttempt(abandonedSession, abQ3, 'skipped', 0);

    const res = await agent.get('/api/v1/qbank/analytics');
    expect(res.status).toBe(200);
    const { data } = res.body;

    // Only the abandoned session's 3 questions count -- the 2 in_progress
    // ones (which would otherwise dominate with their absurd 999s timeSpent)
    // must be fully excluded.
    expect(data.overall).toEqual({
      totalAttempted: 3,
      totalCorrect: 1,
      totalIncorrect: 1,
      totalSkipped: 1,
      overallPercent: 33.33,
      avgTimePerQuestionSeconds: 7, // (10+10+0)/3 = 6.67 -> rounds to 7
    });
  });

  test('empty state: brand-new user with zero qbank activity gets an all-zero, non-error payload', async () => {
    const { agent } = await studentAgent('an-empty');

    const res = await agent.get('/api/v1/qbank/analytics');
    expect(res.status).toBe(200);
    const { data } = res.body;

    expect(data.overall).toEqual({
      totalAttempted: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      totalSkipped: 0,
      overallPercent: 0,
      avgTimePerQuestionSeconds: 0,
    });
    expect(data.subjectPerformance).toEqual([]);
    expect(data.systemPerformance).toEqual([]);
    expect(data.strengths).toEqual([]);
    expect(data.weaknesses).toEqual([]);
    expect(data.dailyTrend).toHaveLength(30); // default range='daily' -> 30 zero-filled buckets
    for (const bucket of data.dailyTrend) {
      expect(bucket).toMatchObject({ questions: 0, correct: 0, qbankSeconds: 0 });
      expect(typeof bucket.date).toBe('string');
    }
  });

  test('series: ?range=daily buckets a real user_daily_stats row on the correct date, zero-fills the rest, and drops rows outside the 30-day window', async () => {
    const { agent, user } = await studentAgent('an-series-daily');

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fortyDaysAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await UserDailyStat.create({ userId: user.id, statDate: todayStr, questionsAttempted: 12, questionsCorrect: 9, qbankSeconds: 300, videoSeconds: 0 });
    await UserDailyStat.create({ userId: user.id, statDate: fiveDaysAgo, questionsAttempted: 4, questionsCorrect: 2, qbankSeconds: 80, videoSeconds: 0 });
    // Outside the 30-day daily window -- must be excluded, no error.
    await UserDailyStat.create({ userId: user.id, statDate: fortyDaysAgo, questionsAttempted: 999, questionsCorrect: 999, qbankSeconds: 999, videoSeconds: 0 });

    const res = await agent.get('/api/v1/qbank/analytics?range=daily');
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.range).toBe('daily');
    expect(data.dailyTrend).toHaveLength(30);

    const byDate = new Map(data.dailyTrend.map((b) => [b.date, b]));
    expect(byDate.get(todayStr)).toEqual({ date: todayStr, questions: 12, correct: 9, qbankSeconds: 300 });
    expect(byDate.get(fiveDaysAgo)).toEqual({ date: fiveDaysAgo, questions: 4, correct: 2, qbankSeconds: 80 });
    expect(byDate.has(fortyDaysAgo)).toBe(false);

    const totalQuestionsInSeries = data.dailyTrend.reduce((sum, b) => sum + b.questions, 0);
    expect(totalQuestionsInSeries).toBe(16); // 12 + 4, the 999-row is out of window
  });

  test('series: ?range=weekly and ?range=monthly return the documented bucket counts (12 each)', async () => {
    const { agent } = await studentAgent('an-series-buckets');

    const weekly = await agent.get('/api/v1/qbank/analytics?range=weekly');
    expect(weekly.status).toBe(200);
    expect(weekly.body.data.range).toBe('weekly');
    expect(weekly.body.data.dailyTrend).toHaveLength(12);

    const monthly = await agent.get('/api/v1/qbank/analytics?range=monthly');
    expect(monthly.status).toBe(200);
    expect(monthly.body.data.range).toBe('monthly');
    expect(monthly.body.data.dailyTrend).toHaveLength(12);
  });

  test('?range= omitted defaults to daily (30 buckets)', async () => {
    const { agent } = await studentAgent('an-series-default');
    const res = await agent.get('/api/v1/qbank/analytics');
    expect(res.status).toBe(200);
    expect(res.body.data.range).toBe('daily');
    expect(res.body.data.dailyTrend).toHaveLength(30);
  });

  test('?range=bogus -> 422 VALIDATION_ERROR', async () => {
    const { agent } = await studentAgent('an-invalid-range');
    const res = await agent.get('/api/v1/qbank/analytics?range=yearly');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('no auth at all -> 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/qbank/analytics');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/qbank/analytics');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
