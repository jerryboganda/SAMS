// server/tests/admin/courses.test.js
// Full CRUD + publish/unpublish + delete-guard for /admin/courses
// (docs/07_EXECUTION_PLAN.md Phase 4.1, docs/04_API_SPEC.md §7).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, Order, Enrollment, User } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/courses', () => {
  test('happy path: lists courses including drafts (unpublished)', async () => {
    const { agent } = await createAdminSession(app);
    await createCourse({ isPublished: true });
    await createCourse({ isPublished: false });

    const res = await agent.get('/api/v1/admin/courses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.some((c) => c.isPublished === false)).toBe(true);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/courses');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: student session → 403 FORBIDDEN', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/courses');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/v1/admin/courses', () => {
  test('happy path: creates a course and writes an audit_logs row', async () => {
    const { agent, user } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/courses').send({
      title: 'NRE Step 1 Admin-Created Course',
      slug: `admin-created-${Date.now()}`,
      examCategory: 'NRE1',
      price: 12000,
      validityDays: 180,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('NRE Step 1 Admin-Created Course');
    expect(res.body.data.isPublished).toBe(false);
    expect(res.body.data.sectionsCount).toBe(0);

    const auditRow = await AuditLog.findOne({ where: { action: 'course.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('validation failure: bad slug (uppercase/spaces) → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/courses').send({
      title: 'Bad Slug Course',
      slug: 'Not A Valid Slug!',
      examCategory: 'NRE1',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('conflict: duplicate slug → 409', async () => {
    const { agent } = await createAdminSession(app);
    const slug = `dup-slug-${Date.now()}`;
    const first = await agent.post('/api/v1/admin/courses').send({ title: 'First', slug, examCategory: 'NRE1' });
    expect(first.status).toBe(201);

    const second = await agent.post('/api/v1/admin/courses').send({ title: 'Second', slug, examCategory: 'NRE1' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/courses').send({ title: 'X', slug: 'x', examCategory: 'NRE1' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/courses').send({ title: 'X', slug: `x-${Date.now()}`, examCategory: 'NRE1' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/courses/:id', () => {
  test('happy path: partial update (price only)', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse({ price: 5000 });

    const res = await agent.patch(`/api/v1/admin/courses/${course.id}`).send({ price: 9999 });
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(9999);
  });

  test('happy path: toggling isPublished (matches CoursesManagementPage.tsx quick-publish-toggle usage)', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse({ isPublished: false });

    const res = await agent.patch(`/api/v1/admin/courses/${course.id}`).send({ isPublished: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isPublished).toBe(true);
  });

  test('validation failure: empty body → 422', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const res = await agent.patch(`/api/v1/admin/courses/${course.id}`).send({});
    expect(res.status).toBe(422);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/courses/9999999').send({ price: 1 });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const course = await createCourse();
    const res = await request(app).patch(`/api/v1/admin/courses/${course.id}`).send({ price: 1 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/admin/courses/:id/publish and /unpublish', () => {
  test('happy path: publish then unpublish', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse({ isPublished: false });

    const publishRes = await agent.post(`/api/v1/admin/courses/${course.id}/publish`);
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.isPublished).toBe(true);

    const unpublishRes = await agent.post(`/api/v1/admin/courses/${course.id}/unpublish`);
    expect(unpublishRes.status).toBe(200);
    expect(unpublishRes.body.data.isPublished).toBe(false);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const course = await createCourse();
    const res = await agent.post(`/api/v1/admin/courses/${course.id}/publish`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/courses/:id', () => {
  test('happy path: a fresh draft course with no orders/enrollments is hard-deletable, and audit-logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const course = await createCourse();

    const res = await agent.delete(`/api/v1/admin/courses/${course.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const stillThere = await agent.get(`/api/v1/admin/courses/${course.id}`);
    expect(stillThere.status).toBe(404);

    const auditRow = await AuditLog.findOne({ where: { action: 'course.delete', entityId: course.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('edge (delete guard): a course with an existing enrollment cannot be hard-deleted → 409', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const student = await User.create({
      name: 'Enrolled Student',
      email: `enrolled-${Date.now()}@example.test`,
      passwordHash: 'x',
      role: 'student',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    await Enrollment.create({
      userId: student.id,
      courseId: course.id,
      source: 'manual',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      status: 'active',
    });

    const res = await agent.delete(`/api/v1/admin/courses/${course.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    const stillThere = await agent.get(`/api/v1/admin/courses/${course.id}`);
    expect(stillThere.status).toBe(200);
  });

  test('edge (delete guard): a course with an existing order cannot be hard-deleted → 409', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const student = await User.create({
      name: 'Ordering Student',
      email: `ordering-${Date.now()}@example.test`,
      passwordHash: 'x',
      role: 'student',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    await Order.create({
      invoiceNo: `INV-${Date.now()}`,
      userId: student.id,
      courseId: course.id,
      amount: 1000,
      finalAmount: 1000,
      gateway: 'mock',
      status: 'pending',
    });

    const res = await agent.delete(`/api/v1/admin/courses/${course.id}`);
    expect(res.status).toBe(409);
  });

  test('auth failure: no session → 401', async () => {
    const course = await createCourse();
    const res = await request(app).delete(`/api/v1/admin/courses/${course.id}`);
    expect(res.status).toBe(401);
  });
});
