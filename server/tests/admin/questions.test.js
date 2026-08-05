// server/tests/admin/questions.test.js
// Admin QBank question CRUD (docs/07_EXECUTION_PLAN.md Phase 11.3,
// docs/04_API_SPEC.md §7 "QBank"). Structure/rigor mirrors
// tests/admin/coupons.test.js's established supertest style. The two
// `PATCH .../:id` tests under "option reconciliation" are the critical
// acceptance-criteria tests for this phase's core integrity constraint —
// see adminQuestionService.js's file header for the full rationale.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createSubject, createBodySystem, createQuestionWithOptions } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, AuditLog, Question, QuestionOption, TestSession, TestAttemptQuestion } = db;

afterAll(async () => {
  await sequelize.close();
});

/** Directly creates a TestSession + one TestAttemptQuestion selecting `optionId` for `question` — bypassing the HTTP runner entirely, for precise control over historical-attempt fixtures. */
async function createAttemptSelecting(user, question, optionId) {
  const session = await TestSession.create({
    userId: user.id,
    mode: 'practice',
    mockExamId: null,
    examCategory: 'NRE1',
    filters: null,
    questionCount: 1,
    timeLimitSeconds: null,
    status: 'completed',
    startedAt: new Date(),
    completedAt: new Date(),
  });
  const attemptQuestion = await TestAttemptQuestion.create({
    testSessionId: session.id,
    questionId: question.id,
    sortOrder: 1,
    selectedOptionId: optionId,
    isCorrect: null,
    answeredAt: new Date(),
  });
  return { session, attemptQuestion };
}

describe('GET /api/v1/admin/questions', () => {
  test('happy path: flat array, isCorrect always included, subjectName/systemName joined', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: `Anatomy-${Date.now()}` });
    const system = await createBodySystem({ name: `Cardio-${Date.now()}` });
    const { question } = await createQuestionWithOptions({ subject, system, correctIndex: 1 });

    const res = await agent.get('/api/v1/admin/questions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const row = res.body.data.find((q) => q.id === question.id);
    expect(row).toBeTruthy();
    expect(row.subjectName).toBe(subject.name);
    expect(row.systemName).toBe(system.name);
    expect(row.options).toHaveLength(4);
    // Unconditionally present, unlike the student-facing runner.
    expect(row.options.every((o) => typeof o.isCorrect === 'boolean')).toBe(true);
    expect(row.options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/questions');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/questions');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/questions', () => {
  function validPayload(subject, system, overrides = {}) {
    return {
      examCategory: 'NRE1',
      subjectId: subject.id,
      systemId: system.id,
      stem: 'A patient presents with acute chest pain.',
      explanation: 'Explanation text.',
      difficulty: 'medium',
      options: [
        { optionText: 'Option A', isCorrect: true, sortOrder: 0 },
        { optionText: 'Option B', isCorrect: false, sortOrder: 1 },
      ],
      ...overrides,
    };
  }

  test('happy path: creates a question + options in one transaction, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();

    const res = await agent.post('/api/v1/admin/questions').send(validPayload(subject, system));
    expect(res.status).toBe(201);
    expect(res.body.data.subjectId).toBe(subject.id);
    expect(res.body.data.systemId).toBe(system.id);
    expect(res.body.data.options).toHaveLength(2);
    expect(res.body.data.isActive).toBe(true);

    const auditRow = await AuditLog.findOne({ where: { action: 'question.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('not found: unknown subjectId → 404', async () => {
    const { agent } = await createAdminSession(app);
    const system = await createBodySystem();
    const res = await agent.post('/api/v1/admin/questions').send(validPayload({ id: 9999999 }, system));
    expect(res.status).toBe(404);
  });

  test('not found: unknown systemId → 404', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const res = await agent.post('/api/v1/admin/questions').send(validPayload(subject, { id: 9999999 }));
    expect(res.status).toBe(404);
  });

  test('validation failure: fewer than 2 options → 422', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const res = await agent.post('/api/v1/admin/questions').send(
      validPayload(subject, system, { options: [{ optionText: 'Only one', isCorrect: true, sortOrder: 0 }] })
    );
    expect(res.status).toBe(422);
  });

  test('validation failure: zero options marked correct → 422', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const res = await agent.post('/api/v1/admin/questions').send(
      validPayload(subject, system, {
        options: [
          { optionText: 'A', isCorrect: false, sortOrder: 0 },
          { optionText: 'B', isCorrect: false, sortOrder: 1 },
        ],
      })
    );
    expect(res.status).toBe(422);
  });

  test('validation failure: two options marked correct → 422', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const res = await agent.post('/api/v1/admin/questions').send(
      validPayload(subject, system, {
        options: [
          { optionText: 'A', isCorrect: true, sortOrder: 0 },
          { optionText: 'B', isCorrect: true, sortOrder: 1 },
        ],
      })
    );
    expect(res.status).toBe(422);
  });

  test('validation failure: missing required fields → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/questions').send({ stem: 'Too short a payload' });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const subject = await createSubject();
    const system = await createBodySystem();
    const res = await request(app).post('/api/v1/admin/questions').send(validPayload(subject, system));
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const res = await agent.post('/api/v1/admin/questions').send(validPayload(subject, system));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/questions/:id — scalar fields', () => {
  test('happy path: partial update (stem only), other fields untouched, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });

    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({ stem: 'Updated stem text.' });
    expect(res.status).toBe(200);
    expect(res.body.data.stem).toBe('Updated stem text.');
    expect(res.body.data.options).toHaveLength(4); // untouched

    const auditRow = await AuditLog.findOne({ where: { action: 'question.update', entityId: question.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/questions/9999999').send({ stem: 'Whatever' });
    expect(res.status).toBe(404);
  });

  test('not found: subjectId in patch references a nonexistent subject → 404', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({ subjectId: 9999999 });
    expect(res.status).toBe(404);
  });

  test('validation failure: empty body → 422', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({});
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await request(app).patch(`/api/v1/admin/questions/${question.id}`).send({ stem: 'x' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({ stem: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/questions/:id — option reconciliation (the critical integrity AC)', () => {
  test('edit-in-place is safe: keeps B by its real id, deletes unused C, inserts new E, and a PAST attempt live-reads the corrected stem + still resolves its selectedOptionId', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('attempt-owner') });

    // correctIndex 0 => option A (index 0) is correct; B/C/D are options[1..3].
    const { question, options } = await createQuestionWithOptions({ subject, system, correctIndex: 0 });
    const [optA, optB, optC, optD] = options;

    // A real historical attempt that selected B (not the correct answer).
    const { attemptQuestion } = await createAttemptSelecting(student, question, optB.id);

    const originalBCreatedAt = (await QuestionOption.findByPk(optB.id)).createdAt;

    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({
      stem: 'CORRECTED: the real diagnosis is X, not Y.',
      options: [
        { id: optA.id, optionText: 'Option A', isCorrect: true, sortOrder: 0 },
        { id: optB.id, optionText: 'Option B (kept)', isCorrect: false, sortOrder: 1 },
        { id: optD.id, optionText: 'Option D', isCorrect: false, sortOrder: 2 },
        { optionText: 'Option E (new)', isCorrect: false, sortOrder: 3 }, // no id => new
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.stem).toBe('CORRECTED: the real diagnosis is X, not Y.');
    expect(res.body.data.options).toHaveLength(4);

    // (a) live-read reflects the edit — the historical attempt's displayed
    // question now shows the NEW stem, proven via a direct query mirroring
    // qbankService.js#loadAttemptQuestionsForDisplay's JOIN-live pattern.
    const reloadedAttempt = await TestAttemptQuestion.findByPk(attemptQuestion.id, {
      include: [{ model: Question, as: 'question' }],
    });
    expect(reloadedAttempt.question.stem).toBe('CORRECTED: the real diagnosis is X, not Y.');

    // (b) option B's row still exists with its ORIGINAL id — update in
    // place, not delete+recreate (same createdAt proves the same row).
    const reloadedB = await QuestionOption.findByPk(optB.id);
    expect(reloadedB).not.toBeNull();
    expect(reloadedB.optionText).toBe('Option B (kept)');
    expect(new Date(reloadedB.createdAt).getTime()).toBe(new Date(originalBCreatedAt).getTime());

    // (c) the attempt's selectedOptionId still resolves correctly.
    expect(reloadedAttempt.selectedOptionId).toBe(optB.id);
    const resolvedSelected = await QuestionOption.findByPk(reloadedAttempt.selectedOptionId);
    expect(resolvedSelected).not.toBeNull();
    expect(resolvedSelected.id).toBe(optB.id);

    // (d) C was genuinely deleted (no attempts referenced it); E was inserted as new.
    const reloadedC = await QuestionOption.findByPk(optC.id);
    expect(reloadedC).toBeNull();
    const newOption = res.body.data.options.find((o) => o.optionText === 'Option E (new)');
    expect(newOption).toBeTruthy();
    expect([optA.id, optB.id, optC.id, optD.id]).not.toContain(newOption.id);
  });

  test('OPTION_IN_USE: removing an option with real attempt history is rejected with 409 and nothing is applied', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('option-in-use-owner') });

    const { question, options } = await createQuestionWithOptions({ subject, system, correctIndex: 0 });
    const [optA, optB, optC, optD] = options;
    await createAttemptSelecting(student, question, optC.id);

    const originalStem = question.stem;

    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({
      stem: 'This edit must NOT be applied.',
      options: [
        { id: optA.id, optionText: 'Option A', isCorrect: true, sortOrder: 0 },
        { id: optB.id, optionText: 'Option B', isCorrect: false, sortOrder: 1 },
        { id: optD.id, optionText: 'Option D', isCorrect: false, sortOrder: 2 },
        // optC intentionally omitted — has attempt history, must be rejected.
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OPTION_IN_USE');

    // Rejected, not partially applied: option C still exists, AND the
    // unrelated stem edit bundled in the same request was rolled back too
    // (same transaction).
    const stillThere = await QuestionOption.findByPk(optC.id);
    expect(stillThere).not.toBeNull();
    const reloadedQuestion = await Question.findByPk(question.id);
    expect(reloadedQuestion.stem).toBe(originalStem);
  });

  test('validation failure: an update that would leave < 2 options → 422', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question, options } = await createQuestionWithOptions({ subject, system, correctIndex: 0 });

    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({
      options: [{ id: options[0].id, optionText: 'Only one left', isCorrect: true, sortOrder: 0 }],
    });
    expect(res.status).toBe(422);
  });

  test('validation failure: an update resulting in zero correct options → 422', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question, options } = await createQuestionWithOptions({ subject, system, correctIndex: 0 });

    const res = await agent.patch(`/api/v1/admin/questions/${question.id}`).send({
      options: options.map((o, idx) => ({ id: o.id, optionText: o.optionText, isCorrect: false, sortOrder: idx })),
    });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/admin/questions/:id', () => {
  test('happy path: no attempts → hard delete (cascade removes its options), audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question, options } = await createQuestionWithOptions({ subject, system });

    const res = await agent.delete(`/api/v1/admin/questions/${question.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.softDeleted).toBe(false);

    const gone = await Question.findByPk(question.id);
    expect(gone).toBeNull();
    const orphanOptions = await QuestionOption.findAll({ where: { id: options.map((o) => o.id) } });
    expect(orphanOptions).toHaveLength(0);

    const auditRow = await AuditLog.findOne({ where: { action: 'question.delete', entityId: question.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('edge: has attempt history → soft delete (isActive=false), score history intact', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('delete-attempt-owner') });
    const { question, options } = await createQuestionWithOptions({ subject, system });
    const { attemptQuestion } = await createAttemptSelecting(student, question, options[0].id);

    const res = await agent.delete(`/api/v1/admin/questions/${question.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.softDeleted).toBe(true);

    const stillThere = await Question.findByPk(question.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere.isActive).toBe(false);

    const stillAttempted = await TestAttemptQuestion.findByPk(attemptQuestion.id);
    expect(stillAttempted).not.toBeNull();
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.delete('/api/v1/admin/questions/9999999');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await request(app).delete(`/api/v1/admin/questions/${question.id}`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await agent.delete(`/api/v1/admin/questions/${question.id}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/questions/:id/toggle-active', () => {
  test('happy path: flips isActive both directions, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });

    const res = await agent.post(`/api/v1/admin/questions/${question.id}/toggle-active`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const second = await agent.post(`/api/v1/admin/questions/${question.id}/toggle-active`);
    expect(second.status).toBe(200);
    expect(second.body.data.isActive).toBe(true);

    const auditRow = await AuditLog.findOne({ where: { action: 'question.toggle_active', entityId: question.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/questions/9999999/toggle-active');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await request(app).post(`/api/v1/admin/questions/${question.id}/toggle-active`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question } = await createQuestionWithOptions({ subject, system });
    const res = await agent.post(`/api/v1/admin/questions/${question.id}/toggle-active`);
    expect(res.status).toBe(403);
  });
});
