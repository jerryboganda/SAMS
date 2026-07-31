// server/tests/admin/mockExams.test.js
// Full CRUD + question-picker replace + publish/unpublish + delete-guard for
// /admin/mock-exams (docs/07_EXECUTION_PLAN.md Phase 8.3,
// docs/04_API_SPEC.md §7).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions } from '../helpers/qbankFixtures.js';
import { createMockExam, attachQuestionsToMockExam } from '../helpers/mockExamFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, AuditLog, MockExam, MockExamQuestion, TestSession } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/mock-exams', () => {
  test('happy path: lists mock exams including drafts (unpublished)', async () => {
    const { agent } = await createAdminSession(app);
    await createMockExam({ isPublished: true });
    await createMockExam({ isPublished: false });

    const res = await agent.get('/api/v1/admin/mock-exams');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.some((m) => m.isPublished === false)).toBe(true);
  });

  test('happy path: questionsCount reflects the real configured paper length', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 3);
    const mockExam = await createMockExam();
    await attachQuestionsToMockExam(mockExam, questions);

    const res = await agent.get('/api/v1/admin/mock-exams');
    expect(res.status).toBe(200);
    const row = res.body.data.find((m) => m.id === mockExam.id);
    expect(row.questionsCount).toBe(3);
  });

  test('auth failure: no session -> 401', async () => {
    const res = await request(app).get('/api/v1/admin/mock-exams');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: student session -> 403 FORBIDDEN', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/mock-exams');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/v1/admin/mock-exams/:id', () => {
  test('happy path: returns ordered questionIds matching the configured sequence', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 4);
    const mockExam = await createMockExam();
    await attachQuestionsToMockExam(mockExam, questions);

    const res = await agent.get(`/api/v1/admin/mock-exams/${mockExam.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.questionsCount).toBe(4);
    expect(res.body.data.questionIds).toEqual(questions.map((q) => q.id));
  });

  test('not found: nonexistent id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/mock-exams/999999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/admin/mock-exams', () => {
  test('happy path: creates a mock exam and writes an audit_logs row', async () => {
    const { agent, user } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/mock-exams').send({
      title: 'NRE Step 1 National Grand Mock 2026',
      examCategory: 'NRE1',
      durationMinutes: 90,
      passPercent: 65,
      isPublished: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('NRE Step 1 National Grand Mock 2026');
    expect(res.body.data.durationMinutes).toBe(90);
    expect(res.body.data.passPercent).toBe(65);
    expect(res.body.data.isPublished).toBe(false);
    expect(res.body.data.questionsCount).toBe(0);

    const auditRow = await AuditLog.findOne({ where: { action: 'mockExam.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('defaults: passPercent defaults to 60, isPublished defaults to false', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/mock-exams').send({
      title: 'Default Values Mock Exam',
      examCategory: 'NRE1',
      durationMinutes: 60,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.passPercent).toBe(60);
    expect(res.body.data.isPublished).toBe(false);
  });

  test('validation failure: missing required fields -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/mock-exams').send({ title: 'Missing Fields' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation failure: invalid examCategory -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/mock-exams').send({
      title: 'Bad Category',
      examCategory: 'NOT_A_REAL_CATEGORY',
      durationMinutes: 60,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('auth failure: no session -> 401', async () => {
    const res = await request(app)
      .post('/api/v1/admin/mock-exams')
      .send({ title: 'X', examCategory: 'NRE1', durationMinutes: 60 });
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent
      .post('/api/v1/admin/mock-exams')
      .send({ title: 'X', examCategory: 'NRE1', durationMinutes: 60 });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/mock-exams/:id', () => {
  test('happy path: partial update (passPercent only)', async () => {
    const { agent } = await createAdminSession(app);
    const mockExam = await createMockExam({ passPercent: 50 });

    const res = await agent.patch(`/api/v1/admin/mock-exams/${mockExam.id}`).send({ passPercent: 70 });
    expect(res.status).toBe(200);
    expect(res.body.data.passPercent).toBe(70);
  });

  test('happy path: toggling isPublished via PATCH', async () => {
    const { agent } = await createAdminSession(app);
    const mockExam = await createMockExam({ isPublished: false });

    const res = await agent.patch(`/api/v1/admin/mock-exams/${mockExam.id}`).send({ isPublished: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isPublished).toBe(true);
  });

  test('validation failure: empty body -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const mockExam = await createMockExam();
    const res = await agent.patch(`/api/v1/admin/mock-exams/${mockExam.id}`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('not found: nonexistent id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/mock-exams/999999999').send({ passPercent: 70 });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const mockExam = await createMockExam();
    const res = await request(app).patch(`/api/v1/admin/mock-exams/${mockExam.id}`).send({ passPercent: 70 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/admin/mock-exams/:id/publish and /unpublish', () => {
  test('happy path: publish then unpublish, each writes its own audit_logs row', async () => {
    const { agent, user } = await createAdminSession(app);
    const mockExam = await createMockExam({ isPublished: false });

    const publishRes = await agent.post(`/api/v1/admin/mock-exams/${mockExam.id}/publish`);
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.isPublished).toBe(true);
    const publishAudit = await AuditLog.findOne({ where: { action: 'mockExam.publish', entityId: mockExam.id } });
    expect(publishAudit).not.toBeNull();
    expect(publishAudit.actorUserId).toBe(user.id);

    const unpublishRes = await agent.post(`/api/v1/admin/mock-exams/${mockExam.id}/unpublish`);
    expect(unpublishRes.status).toBe(200);
    expect(unpublishRes.body.data.isPublished).toBe(false);
    const unpublishAudit = await AuditLog.findOne({ where: { action: 'mockExam.unpublish', entityId: mockExam.id } });
    expect(unpublishAudit).not.toBeNull();
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const mockExam = await createMockExam();
    const res = await agent.post(`/api/v1/admin/mock-exams/${mockExam.id}/publish`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/admin/mock-exams/:id/questions', () => {
  test('happy path: replaces the question set in the given order and writes an audit_logs row', async () => {
    const { agent, user } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 5);
    const mockExam = await createMockExam();

    const orderedIds = [questions[4].id, questions[0].id, questions[2].id, questions[1].id, questions[3].id];
    const res = await agent.put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`).send({ questionIds: orderedIds });

    expect(res.status).toBe(200);
    expect(res.body.data.questionIds).toEqual(orderedIds);
    expect(res.body.data.questionsCount).toBe(5);

    const rows = await MockExamQuestion.findAll({ where: { mockExamId: mockExam.id }, order: [['sortOrder', 'ASC']] });
    expect(rows.map((r) => r.questionId)).toEqual(orderedIds);

    const auditRow = await AuditLog.findOne({ where: { action: 'mockExam.questions.replace', entityId: mockExam.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('replace is a true replace, not an append: re-submitting a smaller set drops the old rows', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 6);
    const mockExam = await createMockExam();

    const first = await agent
      .put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`)
      .send({ questionIds: questions.map((q) => q.id) });
    expect(first.status).toBe(200);
    expect(first.body.data.questionsCount).toBe(6);

    const smallerSet = [questions[0].id, questions[1].id];
    const second = await agent.put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`).send({ questionIds: smallerSet });
    expect(second.status).toBe(200);
    expect(second.body.data.questionIds).toEqual(smallerSet);

    const rows = await MockExamQuestion.findAll({ where: { mockExamId: mockExam.id } });
    expect(rows).toHaveLength(2);
  });

  test('validation edge: an unknown questionId rejects the WHOLE request (422), not silently skipped', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const mockExam = await createMockExam();

    const res = await agent
      .put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`)
      .send({ questionIds: [questions[0].id, 999999999] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.missingIds).toEqual([999999999]);

    const rows = await MockExamQuestion.findAll({ where: { mockExamId: mockExam.id } });
    expect(rows).toHaveLength(0);
  });

  test('validation edge: an inactive questionId rejects the WHOLE request (422)', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const activeQuestions = await createQuestions(subject, system, 2);
    const [inactiveQuestion] = await createQuestions(subject, system, 1, { isActive: false });
    const mockExam = await createMockExam();

    const res = await agent
      .put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`)
      .send({ questionIds: [activeQuestions[0].id, inactiveQuestion.id] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.inactiveIds).toEqual([inactiveQuestion.id]);
  });

  test('validation edge: duplicate ids in the submitted list -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const mockExam = await createMockExam();

    const res = await agent
      .put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`)
      .send({ questionIds: [questions[0].id, questions[0].id] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation edge: empty array -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const mockExam = await createMockExam();
    const res = await agent.put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`).send({ questionIds: [] });
    expect(res.status).toBe(422);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const mockExam = await createMockExam();
    const res = await agent.put(`/api/v1/admin/mock-exams/${mockExam.id}/questions`).send({ questionIds: [1] });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/mock-exams/:id', () => {
  test('happy path: a fresh paper with zero attempts is hard-deletable (and its question rows cascade)', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const mockExam = await createMockExam();
    await attachQuestionsToMockExam(mockExam, questions);

    const res = await agent.delete(`/api/v1/admin/mock-exams/${mockExam.id}`);
    expect(res.status).toBe(200);

    expect(await MockExam.findByPk(mockExam.id)).toBeNull();
    const remainingQuestions = await MockExamQuestion.findAll({ where: { mockExamId: mockExam.id } });
    expect(remainingQuestions).toHaveLength(0);
  });

  test('delete-guard: a mock exam with recorded test_sessions attempts -> 409 CONFLICT, not deleted', async () => {
    const { agent } = await createAdminSession(app);
    const mockExam = await createMockExam();
    const email = uniqueEmail('mockexam-delete-guard');
    const { user } = await createVerifiedUser({ email });
    await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-mockexam-delete-guard' });

    await TestSession.create({
      userId: user.id,
      mode: 'mock',
      mockExamId: mockExam.id,
      examCategory: mockExam.examCategory,
      questionCount: 1,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      correctCount: 1,
      incorrectCount: 0,
      skippedCount: 0,
      scorePercent: 100,
      passed: true,
    });

    const res = await agent.delete(`/api/v1/admin/mock-exams/${mockExam.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    expect(await MockExam.findByPk(mockExam.id)).not.toBeNull();
  });

  test('not found: nonexistent id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.delete('/api/v1/admin/mock-exams/999999999');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const mockExam = await createMockExam();
    const res = await request(app).delete(`/api/v1/admin/mock-exams/${mockExam.id}`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const mockExam = await createMockExam();
    const res = await agent.delete(`/api/v1/admin/mock-exams/${mockExam.id}`);
    expect(res.status).toBe(403);
  });
});
