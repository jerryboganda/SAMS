// server/tests/mockExams/passMark.test.js
// End-to-end integration: a mode='mock' session created via THIS phase's
// POST /mock-exams/:id/start actually works correctly through Phase 7's
// EXISTING /qbank/tests/:id/... runner endpoints (docs/04_API_SPEC.md §4's
// own note: "— run/submit/review | S | same /qbank/tests/:id/... endpoints
// (mode='mock'; adds passed flag)") — GET session, PATCH answer, POST
// submit, GET review all exercised against a session THIS endpoint created,
// plus the literal "pass mark logic test" acceptance criterion: a fixture
// mock exam with passPercent=60, boundary-tested at exactly-below,
// exactly-at, and above the threshold via Phase 7's real submit/scoring
// logic (not a directly-constructed session — the full start->answer->submit
// HTTP round trip). Finally confirms "attempt history stored": every
// completed mock session shows up in GET /qbank/tests with mode='mock' and
// its mockExamId/passed fields intact.
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../helpers/studentFixtures.js';
import { createQuestions } from '../helpers/qbankFixtures.js';
import { createMockExam, attachQuestionsToMockExam } from '../helpers/mockExamFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, QuestionOption } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentWithQbankAccess(prefix, examCategory = 'NRE1') {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  const course = await createCourse({ examCategory, includesQbank: true });
  await createActiveEnrollment(user, course);
  return { agent, user, course };
}

async function correctOptionIdFor(questionId) {
  const opt = await QuestionOption.findOne({ where: { questionId, isCorrect: true } });
  return opt.id;
}
async function incorrectOptionIdFor(questionId) {
  const opt = await QuestionOption.findOne({ where: { questionId, isCorrect: false } });
  return opt.id;
}

/** Starts a mock exam, answers exactly `correctCount` of its 5 questions correctly (the rest wrong), then submits — returns the submit response body's `data`. */
async function runMockAttempt(agent, mockExam, questions, correctCount) {
  const startRes = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
  expect(startRes.status).toBe(201);
  const testId = startRes.body.data.id;

  for (let i = 0; i < questions.length; i += 1) {
    const optionId = i < correctCount ? await correctOptionIdFor(questions[i].id) : await incorrectOptionIdFor(questions[i].id);
    const answerRes = await agent.patch(`/api/v1/qbank/tests/${testId}/answer`).send({
      questionId: questions[i].id,
      optionId,
      timeSpent: 10,
    });
    expect(answerRes.status).toBe(200);
  }

  const submitRes = await agent.post(`/api/v1/qbank/tests/${testId}/submit`);
  expect(submitRes.status).toBe(200);
  return submitRes.body.data;
}

describe('Mock exam pass-mark logic (via the real start -> answer -> submit HTTP flow)', () => {
  test('boundary: below/at/above a passPercent=60 threshold, scored via Phase 7\'s real submit logic', async () => {
    const { agent } = await studentWithQbankAccess('passmark-boundary');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 5);
    const mockExam = await createMockExam({ examCategory: 'NRE1', durationMinutes: 30, passPercent: 60, isPublished: true });
    await attachQuestionsToMockExam(mockExam, questions);

    // 2/5 = 40% < 60% -> fail.
    const below = await runMockAttempt(agent, mockExam, questions, 2);
    expect(below.scorePercent).toBe(40);
    expect(below.passed).toBe(false);
    expect(below.mode).toBe('mock');
    expect(below.mockExamId).toBe(mockExam.id);

    // 3/5 = 60% == 60% -> pass (>=, not >).
    const atExact = await runMockAttempt(agent, mockExam, questions, 3);
    expect(atExact.scorePercent).toBe(60);
    expect(atExact.passed).toBe(true);

    // 4/5 = 80% > 60% -> pass.
    const above = await runMockAttempt(agent, mockExam, questions, 4);
    expect(above.scorePercent).toBe(80);
    expect(above.passed).toBe(true);
  });

  test('attempt history stored: every completed mock session appears in GET /qbank/tests with mode=\'mock\' and its mockExamId/passed intact', async () => {
    const { agent } = await studentWithQbankAccess('passmark-history');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 5);
    const mockExam = await createMockExam({ examCategory: 'NRE1', durationMinutes: 30, passPercent: 60, isPublished: true });
    await attachQuestionsToMockExam(mockExam, questions);

    const completed = await runMockAttempt(agent, mockExam, questions, 4);

    const historyRes = await agent.get('/api/v1/qbank/tests');
    expect(historyRes.status).toBe(200);
    const row = historyRes.body.data.find((s) => s.id === completed.id);
    expect(row).toBeTruthy();
    expect(row.mode).toBe('mock');
    expect(row.mockExamId).toBe(mockExam.id);
    expect(row.status).toBe('completed');
    expect(row.scorePercent).toBe(80);
    expect(row.passed).toBe(true);
  });

  test('full runner round trip on a mock-started session: GET session (in_progress), PATCH answer, POST submit, GET review all work via the EXISTING /qbank/tests/:id endpoints', async () => {
    const { agent } = await studentWithQbankAccess('passmark-runner-roundtrip');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const mockExam = await createMockExam({ examCategory: 'NRE1', durationMinutes: 20, passPercent: 50, isPublished: true });
    await attachQuestionsToMockExam(mockExam, questions);

    const startRes = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(startRes.status).toBe(201);
    const testId = startRes.body.data.id;

    const getRes = await agent.get(`/api/v1/qbank/tests/${testId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.status).toBe('in_progress');
    expect(getRes.body.data.mode).toBe('mock');
    expect(getRes.body.data.questions).toHaveLength(3);

    for (const q of questions) {
      const optionId = await correctOptionIdFor(q.id);
      const answerRes = await agent.patch(`/api/v1/qbank/tests/${testId}/answer`).send({ questionId: q.id, optionId, timeSpent: 5 });
      expect(answerRes.status).toBe(200);
    }

    const submitRes = await agent.post(`/api/v1/qbank/tests/${testId}/submit`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('completed');
    expect(submitRes.body.data.scorePercent).toBe(100);
    expect(submitRes.body.data.passed).toBe(true);

    const reviewRes = await agent.get(`/api/v1/qbank/tests/${testId}/review`);
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.questions).toHaveLength(3);
    reviewRes.body.data.questions.forEach((q) => {
      expect(q.isCorrect).toBe(true);
      expect(q.question.explanation).toBeTruthy();
    });
  });
});
