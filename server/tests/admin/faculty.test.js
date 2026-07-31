// server/tests/admin/faculty.test.js
// Full CRUD + reorder for /admin/faculty (docs/07_EXECUTION_PLAN.md Phase 4.1/4.4).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createFaculty } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, Faculty } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/faculty', () => {
  test('happy path: includes inactive members (unlike the public route)', async () => {
    const { agent } = await createAdminSession(app);
    await createFaculty({ isActive: false });

    const res = await agent.get('/api/v1/admin/faculty');
    expect(res.status).toBe(200);
    expect(res.body.data.some((f) => f.isActive === false)).toBe(true);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/faculty');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/faculty');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/faculty', () => {
  test('happy path: creates a faculty member, audit-logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/faculty').send({
      name: 'Dr. Zabih Ullah',
      title: 'Founder & Lead Instructor',
      bio: 'MBBS, FCPS Medicine.',
      photoUrl: 'https://example.test/photo.jpg',
      isActive: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Dr. Zabih Ullah');

    const auditRow = await AuditLog.findOne({ where: { action: 'faculty.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('validation failure: missing name/title → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/faculty').send({ bio: 'no name' });
    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/v1/admin/faculty/:id and DELETE', () => {
  test('happy path: update then delete', async () => {
    const { agent } = await createAdminSession(app);
    const member = await createFaculty();

    const patchRes = await agent.patch(`/api/v1/admin/faculty/${member.id}`).send({ isActive: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.isActive).toBe(false);

    const deleteRes = await agent.delete(`/api/v1/admin/faculty/${member.id}`);
    expect(deleteRes.status).toBe(200);

    const gone = await Faculty.findByPk(member.id);
    expect(gone).toBeNull();
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/faculty/9999999').send({ isActive: false });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/admin/faculty/reorder', () => {
  // NOTE: the `faculty` table is shared/not reset between test files in this
  // suite (server/tests/globalSetup.cjs migrates once, doesn't re-seed/wipe
  // per file), and reorder requires the FULL current id set (see
  // server/src/utils/reorder.js) — so this test reads the real current
  // roster first and reorders relative to it, rather than assuming only its
  // own 2 fixtures exist.
  test('happy path: reorders the full roster (matches admin.ts reorderFaculty(items) contract)', async () => {
    const { agent } = await createAdminSession(app);
    const before = await agent.get('/api/v1/admin/faculty');
    const existingIds = before.body.data.map((f) => f.id);

    const f1 = await createFaculty({ sortOrder: 1000 });
    const f2 = await createFaculty({ sortOrder: 1001 });

    const orderedIds = [f2.id, f1.id, ...existingIds];
    const items = orderedIds.map((id, index) => ({ id, sortOrder: index }));

    const res = await agent.put('/api/v1/admin/faculty/reorder').send({ items });
    expect(res.status).toBe(200);

    const reloadedF1 = await Faculty.findByPk(f1.id);
    const reloadedF2 = await Faculty.findByPk(f2.id);
    expect(reloadedF2.sortOrder).toBeLessThan(reloadedF1.sortOrder);
  });

  test('edge (reorder-integrity): submitting a subset (missing an existing member) → 422', async () => {
    const { agent } = await createAdminSession(app);
    const f1 = await createFaculty({ sortOrder: 0 });
    await createFaculty({ sortOrder: 1 });

    const res = await agent.put('/api/v1/admin/faculty/reorder').send({ items: [{ id: f1.id, sortOrder: 0 }] });
    expect(res.status).toBe(422);
  });
});
