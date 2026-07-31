// server/tests/qbank/review.test.js
// GET /api/v1/qbank/tests/:id/review (docs/04_API_SPEC.md §4,
// docs/07_EXECUTION_PLAN.md 7.4) — 403 while in_progress, full payload
// (chosen vs correct option, explanation, reference_text, time-per-question)
// once completed OR abandoned, IDOR, and auth gating.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, QuestionOption } = db;

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
async function incorrectOptionIdFor(questionId) {
  const opt = await QuestionOption.findOne({ where: { questionId, isCorrect: false } });
  return opt.id;
}

describe('GET /api/v1/qbank/tests/:id/review', () => {
  test('403 FORBIDDEN while the session is still in_progress', async () => {
    const { agent, user } = await studentAgent('review-inprogress');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'exam' });

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}/review`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('review does NOT lazily auto-finalize an expired-but-still-in_progress session — still 403s (only GET/PATCH/submit/abandon do that, see DECISIONS.md)', async () => {
    const { agent, user } = await studentAgent('review-expired-not-finalized');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, {
      mode: 'exam',
      timeLimitSeconds: 30,
      startedAt: new Date(Date.now() - 90 * 1000),
    });

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}/review`);
    expect(res.status).toBe(403);

    const row = await db.TestSession.findByPk(session.id);
    expect(row.status).toBe('in_progress'); // untouched by the review call itself
  });

  test('full payload after completion: chosen vs correct option per question, explanation, reference_text, time-per-question', async () => {
    const { agent, user } = await studentAgent('review-completed');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'exam' });

    const wrongOptId = await incorrectOptionIdFor(questions[0].id);
    const correctOptId = await correctOptionIdFor(questions[0].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[0].id, optionId: wrongOptId, timeSpent: 42 });
    await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}/review`);
    expect(res.status).toBe(200);
    const item = res.body.data.questions.find((q) => q.questionId === questions[0].id);

    expect(item.selectedOptionId).toBe(wrongOptId); // chosen
    expect(item.question.options.find((o) => o.id === correctOptId).isCorrect).toBe(true); // correct
    expect(item.isCorrect).toBe(false);
    expect(typeof item.question.explanation).toBe('string');
    expect(item.question.explanation.length).toBeGreaterThan(0);
    expect(typeof item.question.referenceText).toBe('string');
    expect(item.timeSpentSeconds).toBe(42); // time-per-question
  });

  test('also opens for an ABANDONED session (not just completed)', async () => {
    const { agent, user } = await studentAgent('review-abandoned');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });
    await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}/review`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('abandoned');
    expect(res.body.data.questions).toHaveLength(2);
  });

  test('IDOR: another user cannot review my session -> 404 NOT_FOUND', async () => {
    const { agent: ownerAgent, user: owner } = await studentAgent('review-idor-owner');
    const { agent: strangerAgent } = await studentAgent('review-idor-stranger');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(owner, questions, { mode: 'practice' });
    await ownerAgent.post(`/api/v1/qbank/tests/${session.id}/submit`);

    const res = await strangerAgent.get(`/api/v1/qbank/tests/${session.id}/review`);
    expect(res.status).toBe(404);
  });

  test('no auth -> 401; nonexistent id -> 404', async () => {
    const { agent } = await studentAgent('review-404');
    const anon = await request(app).get('/api/v1/qbank/tests/1/review');
    expect(anon.status).toBe(401);

    const res = await agent.get('/api/v1/qbank/tests/999999999/review');
    expect(res.status).toBe(404);
  });
});
