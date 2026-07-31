// server/tests/mockExams/start.test.js
// POST /api/v1/mock-exams/:id/start (docs/04_API_SPEC.md §4,
// docs/07_EXECUTION_PLAN.md Phase 8.3) — the FIXED, admin-configured
// question set in its EXACT configured order (never a random pool
// selection), server-computed timeLimitSeconds, the same platform-wide
// ACTIVE_TEST_EXISTS 409 Phase 7's createTest enforces, and the same
// enrollment gate.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../helpers/studentFixtures.js';
import { createQuestions } from '../helpers/qbankFixtures.js';
import { createMockExam, attachQuestionsToMockExam } from '../helpers/mockExamFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize, TestSession, TestAttemptQuestion } = db;

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

describe('POST /api/v1/mock-exams/:id/start', () => {
  test('happy path: creates an in_progress mock session with the EXACT configured question set, in the EXACT configured order (not random)', async () => {
    const { agent } = await studentWithQbankAccess('start-happy');
    const subject = await createSubject();
    const system = await createBodySystem();
    // Deliberately created in one order, then attached to the paper in a
    // DIFFERENT, shuffled order — proves the session mirrors the PAPER's
    // configured sequence, not the questions' creation/id order.
    const questions = await createQuestions(subject, system, 5);
    const configuredOrder = [questions[3], questions[0], questions[4], questions[1], questions[2]];
    const mockExam = await createMockExam({ examCategory: 'NRE1', durationMinutes: 45, passPercent: 60 });
    await attachQuestionsToMockExam(mockExam, configuredOrder);

    const res = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.status).toBe('in_progress');
    expect(data.mode).toBe('mock');
    expect(data.mockExamId).toBe(mockExam.id);
    expect(data.examCategory).toBe('NRE1');
    expect(data.questionCount).toBe(5);
    // Server-computed from durationMinutes*60 — never client-supplied
    // (this endpoint takes no body at all).
    expect(data.timeLimitSeconds).toBe(45 * 60);
    expect(data.timeRemainingSeconds).toBeGreaterThan(45 * 60 - 10);
    expect(data.timeRemainingSeconds).toBeLessThanOrEqual(45 * 60);

    const rows = await TestAttemptQuestion.findAll({ where: { testSessionId: data.id }, order: [['sortOrder', 'ASC']] });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.questionId)).toEqual(configuredOrder.map((q) => q.id));
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    rows.forEach((r) => {
      expect(r.selectedOptionId).toBeNull();
      expect(r.answeredAt).toBeNull();
    });
  });

  test('ACTIVE_TEST_EXISTS: a second start call while one is in_progress -> 409 with the existing testId in details', async () => {
    const { agent } = await studentWithQbankAccess('start-conflict');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const mockExam = await createMockExam({ examCategory: 'NRE1' });
    await attachQuestionsToMockExam(mockExam, questions);

    const first = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(first.status).toBe(201);
    const firstTestId = first.body.data.id;

    const second = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_TEST_EXISTS');
    expect(second.body.error.details.testId).toBe(firstTestId);
  });

  test('ACTIVE_TEST_EXISTS is platform-wide: a regular /qbank/tests session already in progress blocks a mock-exam start too', async () => {
    const { agent, user } = await studentWithQbankAccess('start-conflict-crosstype');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 5);
    const mockExam = await createMockExam({ examCategory: 'NRE1' });
    await attachQuestionsToMockExam(mockExam, questions.slice(0, 3));

    const practiceRes = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });
    expect(practiceRes.status).toBe(201);
    void user;

    const startRes = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(startRes.status).toBe(409);
    expect(startRes.body.error.code).toBe('ACTIVE_TEST_EXISTS');
  });

  test('not entitled for the mock exam\'s examCategory (no qbank-enabled active enrollment) -> 403 NOT_ENROLLED', async () => {
    const email = uniqueEmail('start-notenrolled');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-start-notenrolled' });
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const mockExam = await createMockExam({ examCategory: 'NRE1' });
    await attachQuestionsToMockExam(mockExam, questions);

    const res = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  test('unpublished mock exam -> 404 NOT_FOUND (same treatment as nonexistent)', async () => {
    const { agent } = await studentWithQbankAccess('start-unpublished');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const mockExam = await createMockExam({ examCategory: 'NRE1', isPublished: false });
    await attachQuestionsToMockExam(mockExam, questions);

    const res = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('nonexistent mock exam id -> 404 NOT_FOUND', async () => {
    const { agent } = await studentWithQbankAccess('start-nonexistent');
    const res = await agent.post('/api/v1/mock-exams/999999999/start');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('a published mock exam with zero configured questions -> 409 CONFLICT', async () => {
    const { agent } = await studentWithQbankAccess('start-empty-paper');
    const mockExam = await createMockExam({ examCategory: 'NRE1', isPublished: true });

    const res = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    const sessionCount = await TestSession.count({ where: { mockExamId: mockExam.id } });
    expect(sessionCount).toBe(0);
  });

  test('auth failure: no session -> 401', async () => {
    const mockExam = await createMockExam({ examCategory: 'NRE1' });
    const res = await request(app).post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: admin session -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const mockExam = await createMockExam({ examCategory: 'NRE1' });
    const res = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
