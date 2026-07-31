// server/tests/qbank/runner.test.js
// GET /api/v1/qbank/tests/:id, PATCH .../answer, POST .../submit
// (docs/04_API_SPEC.md §4, docs/07_EXECUTION_PLAN.md 7.3) — the
// security/correctness-critical runner core: answer-secrecy (deep-scan leak
// tests for exam vs practice mode), server-authoritative timing + lazy
// auto-submit-on-expiry, IDOR, scoring math (incl. skipped), mock-mode
// `passed`, and submit idempotency.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { findForbiddenKeys } from '../helpers/leakScan.js';

const { sequelize, TestSession, TestAttemptQuestion, QuestionOption, MockExam } = db;

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

const FORBIDDEN_KEYS = ['isCorrect', 'is_correct', 'explanation'];

describe('GET /api/v1/qbank/tests/:id — answer secrecy', () => {
  test('exam mode, in_progress: NEVER leaks isCorrect/explanation, answered or not (deep-scan)', async () => {
    const { agent, user } = await studentAgent('secrecy-exam');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const session = await createTestSessionDirect(user, questions, { mode: 'exam', examCategory: 'NRE1' });

    // Answer ONE question via the real PATCH endpoint (exam mode) so the
    // deep-scan covers an ANSWERED question too, not just untouched ones.
    const optionId = await correctOptionIdFor(questions[0].id);
    const patchRes = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({
      questionId: questions[0].id,
      optionId,
      timeSpent: 12,
    });
    expect(patchRes.status).toBe(200);
    expect(findForbiddenKeys(patchRes.body, FORBIDDEN_KEYS)).toEqual([]);
    expect(patchRes.body.data).toEqual({ success: true });

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(res.status).toBe(200);
    const hits = findForbiddenKeys(res.body, FORBIDDEN_KEYS);
    expect(hits).toEqual([]);
  });

  test('practice mode, in_progress: isCorrect/explanation present ONLY for the already-answered question, absent for the rest', async () => {
    const { agent, user } = await studentAgent('secrecy-practice');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice', examCategory: 'NRE1' });

    const optionId = await correctOptionIdFor(questions[0].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({
      questionId: questions[0].id,
      optionId,
      timeSpent: 12,
    });

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(res.status).toBe(200);
    const items = res.body.data.questions;
    const answered = items.find((q) => q.questionId === questions[0].id);
    const untouched1 = items.find((q) => q.questionId === questions[1].id);
    const untouched2 = items.find((q) => q.questionId === questions[2].id);

    expect(answered.isCorrect).toBe(true);
    expect(answered.question.explanation).toBeTruthy();
    expect(answered.question.options.some((o) => o.isCorrect !== undefined)).toBe(true);

    expect(untouched1.isCorrect).toBeUndefined();
    expect(untouched1.question.explanation).toBeUndefined();
    expect(untouched1.question.options.every((o) => o.isCorrect === undefined)).toBe(true);
    expect(untouched2.isCorrect).toBeUndefined();
    expect(untouched2.question.explanation).toBeUndefined();

    // Explicit key-level assertion (not just value-level) via JSON round trip.
    expect(Object.prototype.hasOwnProperty.call(untouched1, 'isCorrect')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(untouched1.question, 'explanation')).toBe(false);
  });

  test('exam mode, completed: secrecy lifts — full answer key visible after submit', async () => {
    const { agent, user } = await studentAgent('secrecy-exam-done');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'exam', examCategory: 'NRE1' });

    await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    res.body.data.questions.forEach((q) => {
      expect(q.question.explanation).toBeTruthy();
      expect(q.question.options.some((o) => o.isCorrect === true)).toBe(true);
    });
  });

  test('IDOR: another user cannot GET my session -> 404 NOT_FOUND', async () => {
    const { agent: ownerAgent, user: owner } = await studentAgent('secrecy-owner');
    const { agent: strangerAgent } = await studentAgent('secrecy-stranger');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(owner, questions, { mode: 'practice' });

    const res = await strangerAgent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    // sanity: the real owner CAN see it.
    const ownRes = await ownerAgent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(ownRes.status).toBe(200);
  });

  test('no auth -> 401; nonexistent test id -> 404', async () => {
    const { agent } = await studentAgent('secrecy-404');
    const anon = await request(app).get('/api/v1/qbank/tests/1');
    expect(anon.status).toBe(401);

    const res = await agent.get('/api/v1/qbank/tests/999999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('server-authoritative timing + lazy auto-submit-on-expiry', () => {
  test('GET on an expired timed session auto-submits it (status flips to completed, not left in_progress)', async () => {
    const { agent, user } = await studentAgent('expiry-get');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 4);
    const session = await createTestSessionDirect(user, questions, {
      mode: 'exam',
      timeLimitSeconds: 60,
      startedAt: new Date(Date.now() - 120 * 1000), // 120s elapsed, 60s limit
    });

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.timeRemainingSeconds).toBe(0);
    // All 4 questions were untouched -> all skipped, 0% score.
    expect(res.body.data.skippedCount).toBe(4);
    expect(res.body.data.correctCount).toBe(0);
    expect(res.body.data.scorePercent).toBe(0);

    const row = await TestSession.findByPk(session.id);
    expect(row.status).toBe('completed');
    expect(row.completedAt).toBeTruthy();
  });

  test('PATCH answer on an expired timed session -> 409 TEST_EXPIRED, auto-submits as a side effect, answer NOT recorded', async () => {
    const { agent, user } = await studentAgent('expiry-patch');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, {
      mode: 'practice',
      timeLimitSeconds: 30,
      startedAt: new Date(Date.now() - 90 * 1000),
    });

    const optionId = await correctOptionIdFor(questions[0].id);
    const res = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({
      questionId: questions[0].id,
      optionId,
      timeSpent: 5,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEST_EXPIRED');

    const row = await TestSession.findByPk(session.id);
    expect(row.status).toBe('completed');

    const attemptRow = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: questions[0].id } });
    expect(attemptRow.selectedOptionId).toBeNull();
    expect(attemptRow.answeredAt).toBeNull();
  });

  test('PATCH answer on an already-completed (submitted) session -> 409 TEST_NOT_IN_PROGRESS (distinct code from TEST_EXPIRED)', async () => {
    const { agent, user } = await studentAgent('notinprogress-patch');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });
    await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);

    const optionId = await correctOptionIdFor(questions[0].id);
    const res = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({
      questionId: questions[0].id,
      optionId,
      timeSpent: 5,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEST_NOT_IN_PROGRESS');
  });

  test('an untimed session never auto-expires (timeRemainingSeconds omitted, status stays in_progress indefinitely)', async () => {
    const { agent, user } = await studentAgent('untimed');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, {
      mode: 'practice',
      timeLimitSeconds: null,
      startedAt: new Date(Date.now() - 100000000), // absurdly old, would exceed any real timer
    });

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_progress');
    expect(res.body.data.timeRemainingSeconds).toBeUndefined();
  });
});

describe('PATCH /api/v1/qbank/tests/:id/answer', () => {
  test('practice mode: immediate feedback shape {isCorrect, correctOptionId, explanation, referenceText}', async () => {
    const { agent, user } = await studentAgent('patch-practice-shape');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    const session = await createTestSessionDirect(user, [q], { mode: 'practice' });
    const wrongOptionId = await incorrectOptionIdFor(q.id);
    const correctOptionId = await correctOptionIdFor(q.id);

    const res = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({
      questionId: q.id,
      optionId: wrongOptionId,
      timeSpent: 20,
      flagged: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.isCorrect).toBe(false);
    expect(res.body.data.correctOptionId).toBe(correctOptionId);
    expect(typeof res.body.data.explanation).toBe('string');
    expect(res.body.data.explanation.length).toBeGreaterThan(0);

    const row = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: q.id } });
    expect(row.selectedOptionId).toBe(wrongOptionId);
    expect(row.isCorrect).toBe(false);
    expect(row.isFlagged).toBe(true);
    expect(row.timeSpentSeconds).toBe(20);
    expect(row.answeredAt).toBeTruthy();
  });

  test('time_spent_seconds accumulates across re-answers of the same question, never overwrites', async () => {
    const { agent, user } = await studentAgent('patch-accumulate');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    const session = await createTestSessionDirect(user, [q], { mode: 'practice' });
    const optionId = await correctOptionIdFor(q.id);

    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q.id, optionId, timeSpent: 10 });
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q.id, optionId, timeSpent: 7 });

    const row = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: q.id } });
    expect(row.timeSpentSeconds).toBe(17);
  });

  test('exam mode: response is just an ack, never correctness/explanation', async () => {
    const { agent, user } = await studentAgent('patch-exam-shape');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    const session = await createTestSessionDirect(user, [q], { mode: 'exam' });
    const optionId = await correctOptionIdFor(q.id);

    const res = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q.id, optionId, timeSpent: 9 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ success: true });

    // Server still computed + stored correctness internally (secret, but real).
    const row = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: q.id } });
    expect(row.isCorrect).toBe(true);
  });

  test('optionId:null explicitly clears/records a skip (no correctness)', async () => {
    const { agent, user } = await studentAgent('patch-null-option');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    const session = await createTestSessionDirect(user, [q], { mode: 'practice' });

    const res = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q.id, optionId: null, timeSpent: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.isCorrect).toBeNull();

    const row = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: q.id } });
    expect(row.selectedOptionId).toBeNull();
    expect(row.isCorrect).toBeNull();
    expect(row.answeredAt).toBeTruthy(); // still "visited"
  });

  test('a question not part of this test -> 404 NOT_FOUND', async () => {
    const { agent, user } = await studentAgent('patch-foreign-q');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [inTest] = await createQuestions(subject, system, 1);
    const [notInTest] = await createQuestions(subject, system, 1);
    const session = await createTestSessionDirect(user, [inTest], { mode: 'practice' });
    const optionId = await correctOptionIdFor(notInTest.id);

    const res = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: notInTest.id, optionId, timeSpent: 5 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('an optionId belonging to a DIFFERENT question -> 422 VALIDATION_ERROR', async () => {
    const { agent, user } = await studentAgent('patch-mismatched-option');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q1, q2] = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, [q1, q2], { mode: 'practice' });
    const q2OptionId = await correctOptionIdFor(q2.id);

    const res = await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q1.id, optionId: q2OptionId, timeSpent: 5 });
    expect(res.status).toBe(422);
  });

  test('IDOR: another user cannot PATCH my session -> 404 NOT_FOUND', async () => {
    const { user: owner } = await studentAgent('patch-idor-owner');
    const { agent: strangerAgent } = await studentAgent('patch-idor-stranger');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    const session = await createTestSessionDirect(owner, [q], { mode: 'practice' });
    const optionId = await correctOptionIdFor(q.id);

    const res = await strangerAgent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q.id, optionId, timeSpent: 5 });
    expect(res.status).toBe(404);
  });

  test('no auth -> 401', async () => {
    const res = await request(app).patch('/api/v1/qbank/tests/1/answer').send({ questionId: 1, optionId: 1, timeSpent: 1 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/qbank/tests/:id/submit — scoring + resume', () => {
  test('scoring math: correct/incorrect/skipped tallies + scorePercent (skipped tracked separately, not folded into incorrect)', async () => {
    const { agent, user } = await studentAgent('submit-scoring');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 5);
    const session = await createTestSessionDirect(user, questions, { mode: 'exam' });

    // q0, q1 correct; q2 incorrect; q3, q4 left untouched (skipped).
    for (const q of [questions[0], questions[1]]) {
      const optId = await correctOptionIdFor(q.id);
      await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q.id, optionId: optId, timeSpent: 10 });
    }
    const wrongOptId = await incorrectOptionIdFor(questions[2].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[2].id, optionId: wrongOptId, timeSpent: 10 });

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.status).toBe('completed');
    expect(data.correctCount).toBe(2);
    expect(data.incorrectCount).toBe(1);
    expect(data.skippedCount).toBe(2);
    expect(data.scorePercent).toBe(40); // 2/5 * 100

    const row = await TestSession.findByPk(session.id);
    expect(row.correctCount).toBe(2);
    expect(row.incorrectCount).toBe(1);
    expect(row.skippedCount).toBe(2);
    expect(Number(row.scorePercent)).toBe(40);
  });

  test("mode='mock' with a linked mock exam: passed = scorePercent >= pass_percent", async () => {
    const { agent, user } = await studentAgent('submit-mock-pass');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 4);
    const mockExam = await MockExam.create({ title: 'Mock Exam Pass Test', examCategory: 'NRE1', durationMinutes: 60, passPercent: 50, isPublished: true });
    const session = await createTestSessionDirect(user, questions, { mode: 'mock', mockExamId: mockExam.id });

    for (const q of [questions[0], questions[1]]) {
      const optId = await correctOptionIdFor(q.id);
      await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: q.id, optionId: optId, timeSpent: 10 });
    }
    // 2/4 = 50% >= 50% pass_percent -> passed=true

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(res.status).toBe(200);
    expect(res.body.data.scorePercent).toBe(50);
    expect(res.body.data.passed).toBe(true);
  });

  test("mode='mock' with a linked mock exam: below pass_percent -> passed=false", async () => {
    const { agent, user } = await studentAgent('submit-mock-fail');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 4);
    const mockExam = await MockExam.create({ title: 'Mock Exam Fail Test', examCategory: 'NRE1', durationMinutes: 60, passPercent: 80, isPublished: true });
    const session = await createTestSessionDirect(user, questions, { mode: 'mock', mockExamId: mockExam.id });

    const optId = await correctOptionIdFor(questions[0].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[0].id, optionId: optId, timeSpent: 10 });
    // 1/4 = 25% < 80% -> passed=false

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(res.status).toBe(200);
    expect(res.body.data.passed).toBe(false);
  });

  test("mode='practice' and mode='exam': passed is not applicable (omitted/null)", async () => {
    const { agent, user } = await studentAgent('submit-passed-na');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(res.status).toBe(200);
    expect(res.body.data.passed == null).toBe(true);
  });

  test("mode='mock' but WITHOUT a linked mock_exam_id: passed stays null (same as practice/exam)", async () => {
    const { agent, user } = await studentAgent('submit-mock-no-link');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'mock', mockExamId: null });

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(res.status).toBe(200);
    expect(res.body.data.passed == null).toBe(true);
  });

  test('submitting an already-completed session is idempotent (returns the same result, not an error)', async () => {
    const { agent, user } = await studentAgent('submit-idempotent');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });

    const first = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(first.status).toBe(200);
    // Compare against the DB-PERSISTED value (DATETIME column, whole-second
    // precision) rather than the first HTTP response's in-memory
    // `completedAt` (set via `new Date()` with millisecond precision before
    // being truncated on write) — comparing those two directly would always
    // differ by sub-second rounding even when nothing was actually
    // re-stamped, which isn't what this test is trying to prove.
    const persistedAfterFirst = await TestSession.findByPk(session.id);

    const second = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('completed');
    expect(new Date(second.body.data.completedAt).getTime()).toBe(new Date(persistedAfterFirst.completedAt).getTime());
  });

  test('re-submitting an ABANDONED session -> 409 TEST_NOT_IN_PROGRESS (not silently accepted)', async () => {
    const { agent, user } = await studentAgent('submit-after-abandon');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });
    await agent.post(`/api/v1/qbank/tests/${session.id}/abandon`);

    const res = await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEST_NOT_IN_PROGRESS');
  });

  test('resume mid-test: GET after some PATCHes reflects palette state (answered/flagged/unanswered) accurately', async () => {
    const { agent, user } = await studentAgent('resume');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const session = await createTestSessionDirect(user, questions, { mode: 'practice' });

    const opt0 = await correctOptionIdFor(questions[0].id);
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[0].id, optionId: opt0, timeSpent: 5 });
    await agent.patch(`/api/v1/qbank/tests/${session.id}/answer`).send({ questionId: questions[1].id, optionId: null, timeSpent: 2, flagged: true });

    const res = await agent.get(`/api/v1/qbank/tests/${session.id}`);
    expect(res.status).toBe(200);
    const items = res.body.data.questions;
    const q0 = items.find((q) => q.questionId === questions[0].id);
    const q1 = items.find((q) => q.questionId === questions[1].id);
    const q2 = items.find((q) => q.questionId === questions[2].id);

    expect(q0.selectedOptionId).toBe(opt0);
    expect(q0.isFlagged).toBe(false);
    expect(q1.selectedOptionId).toBeUndefined();
    expect(q1.isFlagged).toBe(true);
    expect(q2.selectedOptionId).toBeUndefined();
    expect(q2.isFlagged).toBe(false);
    expect(res.body.data.status).toBe('in_progress');
  });

  test('no auth -> 401; nonexistent id -> 404', async () => {
    const { agent } = await studentAgent('submit-404');
    const anon = await request(app).post('/api/v1/qbank/tests/1/submit');
    expect(anon.status).toBe(401);

    const res = await agent.post('/api/v1/qbank/tests/999999999/submit');
    expect(res.status).toBe(404);
  });
});
