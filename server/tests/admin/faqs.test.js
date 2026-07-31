// server/tests/admin/faqs.test.js
// Full CRUD + reorder for /admin/faqs (docs/07_EXECUTION_PLAN.md Phase 4.1/4.4).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createFaq } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, Faq } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/faqs', () => {
  test('happy path: includes inactive FAQs (unlike the public route)', async () => {
    const { agent } = await createAdminSession(app);
    await createFaq({ isActive: false });

    const res = await agent.get('/api/v1/admin/faqs');
    expect(res.status).toBe(200);
    expect(res.body.data.some((f) => f.isActive === false)).toBe(true);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/faqs');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/faqs', () => {
  test('happy path: creates a FAQ, audit-logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/faqs').send({
      question: 'How do I access my course after purchase?',
      answer: 'Instantly for JazzCash/EasyPaisa; within 1-3 hours for manual proof review.',
    });
    expect(res.status).toBe(201);

    const auditRow = await AuditLog.findOne({ where: { action: 'faq.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('validation failure: missing answer → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/faqs').send({ question: 'Q?' });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/faqs').send({ question: 'Q?', answer: 'A.' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/admin/faqs/:id and DELETE', () => {
  test('happy path: update then delete', async () => {
    const { agent } = await createAdminSession(app);
    const faq = await createFaq();

    const patchRes = await agent.patch(`/api/v1/admin/faqs/${faq.id}`).send({ isActive: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.isActive).toBe(false);

    const deleteRes = await agent.delete(`/api/v1/admin/faqs/${faq.id}`);
    expect(deleteRes.status).toBe(200);

    const gone = await Faq.findByPk(faq.id);
    expect(gone).toBeNull();
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.delete('/api/v1/admin/faqs/9999999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/admin/faqs/reorder', () => {
  // See faculty.test.js's comment: `faqs` is a shared, non-reset-between-
  // files table, so this reads the real current set first.
  test('happy path: reorders the full FAQ list', async () => {
    const { agent } = await createAdminSession(app);
    const before = await agent.get('/api/v1/admin/faqs');
    const existingIds = before.body.data.map((f) => f.id);

    const f1 = await createFaq({ sortOrder: 1000 });
    const f2 = await createFaq({ sortOrder: 1001 });

    const orderedIds = [f2.id, f1.id, ...existingIds];
    const items = orderedIds.map((id, index) => ({ id, sortOrder: index }));

    const res = await agent.put('/api/v1/admin/faqs/reorder').send({ items });
    expect(res.status).toBe(200);

    const reloadedF1 = await Faq.findByPk(f1.id);
    const reloadedF2 = await Faq.findByPk(f2.id);
    expect(reloadedF2.sortOrder).toBeLessThan(reloadedF1.sortOrder);
  });

  test('edge (reorder-integrity): submitting a subset (missing an existing FAQ) → 422', async () => {
    const { agent } = await createAdminSession(app);
    const f1 = await createFaq({ sortOrder: 0 });
    await createFaq({ sortOrder: 1 });

    const res = await agent.put('/api/v1/admin/faqs/reorder').send({ items: [{ id: f1.id, sortOrder: 0 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
