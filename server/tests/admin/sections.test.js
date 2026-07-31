// server/tests/admin/sections.test.js
// CRUD + transactional reorder-integrity for /admin/courses/:id/sections,
// /admin/sections/:id (docs/07_EXECUTION_PLAN.md Phase 4.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse, createSection } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, CourseSection } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/courses/:courseId/sections', () => {
  test('happy path: lists sections with nested lectures', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    await createSection(course, { title: 'Section A', sortOrder: 0 });

    const res = await agent.get(`/api/v1/admin/courses/${course.id}/sections`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('lectures');
  });

  test('auth failure: no session → 401', async () => {
    const course = await createCourse();
    const res = await request(app).get(`/api/v1/admin/courses/${course.id}/sections`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const course = await createCourse();
    const res = await agent.get(`/api/v1/admin/courses/${course.id}/sections`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/courses/:courseId/sections', () => {
  test('happy path: creates a section, default sortOrder appended', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();

    const res = await agent.post(`/api/v1/admin/courses/${course.id}/sections`).send({ title: 'Cardiology' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Cardiology');
    expect(res.body.data.courseId).toBe(course.id);
  });

  test('validation failure: missing title → 422', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const res = await agent.post(`/api/v1/admin/courses/${course.id}/sections`).send({});
    expect(res.status).toBe(422);
  });

  test('not found: unknown course → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/courses/9999999/sections').send({ title: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/admin/sections/:id and DELETE', () => {
  test('happy path: update title', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course, { title: 'Old Title' });

    const res = await agent.patch(`/api/v1/admin/sections/${section.id}`).send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New Title');
  });

  test('happy path: delete an empty section, audit-logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);

    const res = await agent.delete(`/api/v1/admin/sections/${section.id}`);
    expect(res.status).toBe(200);

    const auditRow = await AuditLog.findOne({ where: { action: 'section.delete', entityId: section.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('auth failure: no session → 401', async () => {
    const course = await createCourse();
    const section = await createSection(course);
    const res = await request(app).patch(`/api/v1/admin/sections/${section.id}`).send({ title: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/admin/courses/:courseId/sections/reorder', () => {
  test('happy path: reorders sections and persists new sortOrder', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const s1 = await createSection(course, { sortOrder: 0 });
    const s2 = await createSection(course, { sortOrder: 1 });
    const s3 = await createSection(course, { sortOrder: 2 });

    const res = await agent
      .patch(`/api/v1/admin/courses/${course.id}/sections/reorder`)
      .send({ orderedIds: [s3.id, s1.id, s2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.id)).toEqual([s3.id, s1.id, s2.id]);

    const reloaded = await CourseSection.findByPk(s3.id);
    expect(reloaded.sortOrder).toBe(0);
  });

  test('edge (reorder-integrity): missing one id from the current set → 422, nothing changed', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const s1 = await createSection(course, { sortOrder: 0 });
    const s2 = await createSection(course, { sortOrder: 1 });

    const res = await agent.patch(`/api/v1/admin/courses/${course.id}/sections/reorder`).send({ orderedIds: [s1.id] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const reloaded = await CourseSection.findByPk(s2.id);
    expect(reloaded.sortOrder).toBe(1); // untouched
  });

  test('edge (reorder-integrity): an id from a DIFFERENT course is rejected, not silently applied → 422', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const otherCourse = await createCourse();
    const s1 = await createSection(course, { sortOrder: 0 });
    const foreign = await createSection(otherCourse, { sortOrder: 0 });

    const res = await agent
      .patch(`/api/v1/admin/courses/${course.id}/sections/reorder`)
      .send({ orderedIds: [foreign.id, s1.id] });

    expect(res.status).toBe(422);
    expect(res.body.error.details.extra).toContain(foreign.id);
  });

  test('edge (reorder-integrity): duplicate ids in the list → 422', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const s1 = await createSection(course, { sortOrder: 0 });

    const res = await agent.patch(`/api/v1/admin/courses/${course.id}/sections/reorder`).send({ orderedIds: [s1.id, s1.id] });
    expect(res.status).toBe(422);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const course = await createCourse();
    const res = await agent.patch(`/api/v1/admin/courses/${course.id}/sections/reorder`).send({ orderedIds: [1] });
    expect(res.status).toBe(403);
  });
});
