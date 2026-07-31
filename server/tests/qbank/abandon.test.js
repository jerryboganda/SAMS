// server/tests/qbank/abandon.test.js
// POST /api/v1/qbank/tests/:id/abandon (docs/04_API_SPEC.md §4,
// docs/07_EXECUTION_PLAN.md 7.3) — status transition, the answers-still-
// recorded-to-history behavior (ONLY for questions actually answered, unlike
// submit's "every question including skipped"), daily-stats NOT touched, and
// the TEST_NOT_IN_PROGRESS double-abandon / abandon-after-complete guards.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, TestSession, UserQuestionHistory, UserDailyStat, QuestionOption } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentAgent(prefix) {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return { agent, user };
}

async function correctOptionIdFor(questionId) {
  const opt = await QuestionOption.findOne({ where: { questionId, isCorrect: true } });
  return opt.id;
}

describe('POST /api/v1/qbank/tests/:id/abandon', () => {
  test('happy path: status -> abandoned, completedAt set, score fields computed for the review UI', async () => {
    const { agent, user } = await studentAgent('abandon-happy');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 4);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });

    const optId = await correctOptionIdFor(questions[0].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[0].id, optionId: optId, timeSpent: 10 });

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('abandoned');
    expect(res.body.data.completedAt).toBeTruthy();
    expect(res.body.data.correctCount).toBe(1);
    expect(res.body.data.skippedCount).toBe(3);
    expect(res.body.data.passed == null).toBe(true);

    const row = await TestSession.findByPk(session.id);
    expect(row.status).toBe('abandoned');
    expect(row.completedAt).toBeTruthy();
  });

  test('answers-still-recorded-to-history: ONLY the answered question gets a user_question_history row — untouched questions are NOT marked "seen"', async () => {
    const { agent, user } = await studentAgent('abandon-history');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });

    const optId = await correctOptionIdFor(questions[0].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[0].id, optionId: optId, timeSpent: 10 });

    await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);

    const answeredHistory = await UserQuestionHistory.findOne({ where: { userId: user.id, questionId: questions[0].id } });
    expect(answeredHistory).toBeTruthy();
    expect(answeredHistory.timesSeen).toBe(1);
    expect(answeredHistory.lastResult).toBe('correct');

    const untouchedHistory1 = await UserQuestionHistory.findOne({ where: { userId: user.id, questionId: questions[1].id } });
    const untouchedHistory2 = await UserQuestionHistory.findOne({ where: { userId: user.id, questionId: questions[2].id } });
    expect(untouchedHistory1).toBeNull();
    expect(untouchedHistory2).toBeNull();
  });

  test('user_daily_stats is NOT touched by abandon (only real submit counts toward daily study stats)', async () => {
    const { agent, user } = await studentAgent('abandon-dailystats');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });
    const optId = await correctOptionIdFor(questions[0].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[0].id, optionId: optId, timeSpent: 15 });

    await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);

    const statDate = new Date().toISOString().slice(0, 10);
    const stat = await UserDailyStat.findOne({ where: { userId: user.id, statDate } });
    expect(stat).toBeNull();
  });

  test('double-abandon -> 409 TEST_NOT_IN_PROGRESS on the second call', async () => {
    const { agent, user } = await studentAgent('abandon-double');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });

    const first = await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);
    expect(first.status).toBe(200);
    const second = await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('TEST_NOT_IN_PROGRESS');
  });

  test('abandoning an already-submitted (completed) session -> 409 TEST_NOT_IN_PROGRESS', async () => {
    const { agent, user } = await studentAgent('abandon-after-submit');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });
    await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEST_NOT_IN_PROGRESS');
  });

  test('abandoning an already-expired timed session -> lazy auto-submit intercepts it first, so abandon then 409s (it is no longer in_progress)', async () => {
    const { agent, user } = await studentAgent('abandon-expired');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, {
      mode: 'exam',
      timeLimitSeconds: 30,
      startedAt: new Date(Date.now() - 90 * 1000),
    });

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEST_NOT_IN_PROGRESS');

    const row = await TestSession.findByPk(session.id);
    expect(row.status).toBe('completed'); // auto-submitted, not abandoned
  });

  test('IDOR: another user cannot abandon my session -> 404 NOT_FOUND', async () => {
    const { user: owner } = await studentAgent('abandon-idor-owner');
    const { agent: strangerAgent } = await studentAgent('abandon-idor-stranger');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(owner, questions, { mode: 'practice' });

    const res = await strangerAgent.post(`/api/v1/qbank/tests/${session.id}/abandon`);
    expect(res.status).toBe(404);
  });

  test('no auth -> 401; nonexistent id -> 404', async () => {
    const { agent } = await studentAgent('abandon-404');
    const anon = await request(app).post('/api/v1/qbank/tests/1/abandon');
    expect(anon.status).toBe(401);

    const res = await agent.post('/api/v1/qbank/tests/999999999/abandon');
    expect(res.status).toBe(404);
  });
});
