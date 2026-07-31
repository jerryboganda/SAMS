// server/tests/mockExams/list.test.js
// GET /api/v1/mock-exams (docs/04_API_SPEC.md §4, docs/07_EXECUTION_PLAN.md
// Phase 8.3) — enrollment-derived category scoping (same definition
// qbankService.js's GET /qbank/meta uses), published-only visibility, and
// the best-score/most-recent-attempt annotation.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createActiveEnrollment, createExpiredEnrollment } from '../helpers/studentFixtures.js';
import { createQuestions } from '../helpers/qbankFixtures.js';
import { createMockExam, attachQuestionsToMockExam } from '../helpers/mockExamFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize, TestSession } = db;

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

describe('GET /api/v1/mock-exams', () => {
  test('happy path: only published mock exams in the user\'s accessible categories are returned', async () => {
    const { agent } = await studentWithQbankAccess('list-happy');
    const inCategory = await createMockExam({ examCategory: 'NRE1', isPublished: true });
    const unpublished = await createMockExam({ examCategory: 'NRE1', isPublished: false });
    const otherCategory = await createMockExam({ examCategory: 'USMLE1', isPublished: true });

    const res = await agent.get('/api/v1/mock-exams');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((m) => m.id);
    expect(ids).toContain(inCategory.id);
    expect(ids).not.toContain(unpublished.id);
    expect(ids).not.toContain(otherCategory.id);
  });

  test('no qbank-enabled active enrollment -> empty list (not 403 — a listing, not a gate)', async () => {
    const email = uniqueEmail('list-noenroll');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-list-noenroll' });
    await createMockExam({ examCategory: 'NRE1', isPublished: true });

    const res = await agent.get('/api/v1/mock-exams');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('an EXPIRED enrollment grants no access, mirroring the qbank-meta definition of "accessible categories"', async () => {
    const email = uniqueEmail('list-expired');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-list-expired' });
    const course = await createCourse({ examCategory: 'NRE1', includesQbank: true });
    await createExpiredEnrollment(user, course);
    await createMockExam({ examCategory: 'NRE1', isPublished: true });

    const res = await agent.get('/api/v1/mock-exams');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('questionsCount reflects the real configured paper length', async () => {
    const { agent } = await studentWithQbankAccess('list-qcount');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const mockExam = await createMockExam({ examCategory: 'NRE1', isPublished: true });
    await attachQuestionsToMockExam(mockExam, questions);

    const res = await agent.get('/api/v1/mock-exams');
    const row = res.body.data.find((m) => m.id === mockExam.id);
    expect(row.questionsCount).toBe(3);
  });

  test('bestScore/attemptsCount/lastAttempt: best is the MAX completed score, attemptsCount excludes in_progress, most recent wins the "last" fields', async () => {
    const { agent, user } = await studentWithQbankAccess('list-annotate');
    const mockExam = await createMockExam({ examCategory: 'NRE1', isPublished: true, passPercent: 60 });

    const now = Date.now();
    // Oldest, lower score.
    await TestSession.create({
      userId: user.id,
      mode: 'mock',
      mockExamId: mockExam.id,
      examCategory: 'NRE1',
      questionCount: 5,
      status: 'completed',
      startedAt: new Date(now - 3 * 60 * 60 * 1000),
      completedAt: new Date(now - 3 * 60 * 60 * 1000 + 1000),
      correctCount: 2,
      incorrectCount: 3,
      skippedCount: 0,
      scorePercent: 40,
      passed: false,
    });
    // Middle, highest score (this is the "best").
    await TestSession.create({
      userId: user.id,
      mode: 'mock',
      mockExamId: mockExam.id,
      examCategory: 'NRE1',
      questionCount: 5,
      status: 'completed',
      startedAt: new Date(now - 2 * 60 * 60 * 1000),
      completedAt: new Date(now - 2 * 60 * 60 * 1000 + 1000),
      correctCount: 4,
      incorrectCount: 1,
      skippedCount: 0,
      scorePercent: 80,
      passed: true,
    });
    // Most recent, abandoned — counts toward attemptsCount and IS the "last"
    // attempt (most recent by startedAt), but must NOT move bestScore (only
    // completed attempts count toward "personal best").
    await TestSession.create({
      userId: user.id,
      mode: 'mock',
      mockExamId: mockExam.id,
      examCategory: 'NRE1',
      questionCount: 5,
      status: 'abandoned',
      startedAt: new Date(now - 1 * 60 * 60 * 1000),
      completedAt: new Date(now - 1 * 60 * 60 * 1000 + 1000),
      correctCount: 5,
      incorrectCount: 0,
      skippedCount: 0,
      scorePercent: 100,
      passed: null,
    });
    // Currently in_progress — must NOT count toward attemptsCount or "last".
    await TestSession.create({
      userId: user.id,
      mode: 'mock',
      mockExamId: mockExam.id,
      examCategory: 'NRE1',
      questionCount: 5,
      status: 'in_progress',
      startedAt: new Date(now),
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: 0,
    });

    const res = await agent.get('/api/v1/mock-exams');
    const row = res.body.data.find((m) => m.id === mockExam.id);
    expect(row.bestScore).toBe(80);
    expect(row.attemptsCount).toBe(3);
    expect(row.lastScorePercent).toBe(100);
    // The abandoned session's `passed` is null (not applicable — abandon is
    // never a real pass/fail outcome); mockExamService.js's
    // `mostRecent.passed ?? undefined` omits the key entirely for a null
    // value, same "omit rather than emit null" JSON convention
    // qbankService.js's own serializer uses for `passed` — so this is
    // absent, not `null`, on the wire.
    expect(row.lastPassed).toBeUndefined();
  });

  test('never attempted: bestScore/attemptsCount reflect zero attempts', async () => {
    const { agent } = await studentWithQbankAccess('list-never');
    const mockExam = await createMockExam({ examCategory: 'NRE1', isPublished: true });

    const res = await agent.get('/api/v1/mock-exams');
    const row = res.body.data.find((m) => m.id === mockExam.id);
    expect(row.bestScore).toBeUndefined();
    expect(row.attemptsCount).toBe(0);
  });

  test('auth failure: no session -> 401', async () => {
    const res = await request(app).get('/api/v1/mock-exams');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: admin session -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/mock-exams');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
