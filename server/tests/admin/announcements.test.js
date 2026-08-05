// server/tests/admin/announcements.test.js
// Admin announcements CRUD (docs/07_EXECUTION_PLAN.md Phase 10.2,
// docs/04_API_SPEC.md §7 "Announcements"). Structure/rigor mirrors
// tests/admin/coupons.test.js's established supertest style (including its
// audit_logs assertion pattern for every mutation).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, Announcement } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/announcements', () => {
  test('happy path: empty list, then has items after create', async () => {
    const { agent } = await createAdminSession(app);

    const before = await agent.get('/api/v1/admin/announcements');
    expect(before.status).toBe(200);
    expect(Array.isArray(before.body.data)).toBe(true);
    const beforeCount = before.body.data.length;

    const createRes = await agent.post('/api/v1/admin/announcements').send({
      title: 'Site maintenance tonight',
      body: 'We will be performing maintenance at midnight.',
      audience: 'all',
    });
    expect(createRes.status).toBe(201);

    const after = await agent.get('/api/v1/admin/announcements');
    expect(after.status).toBe(200);
    expect(after.body.data.length).toBe(beforeCount + 1);
    expect(after.body.data.map((a) => a.id)).toContain(createRes.body.data.id);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/announcements');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/announcements');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/announcements', () => {
  test('happy path: audience=all creates an announcement and writes an audit_logs row', async () => {
    const { agent, user } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/announcements').send({
      title: 'New QBank questions added',
      body: '500 new questions have been added to the QBank.',
      audience: 'all',
      sendEmail: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('New QBank questions added');
    expect(res.body.data.audience).toBe('all');
    expect(res.body.data.courseId).toBeUndefined();
    expect(res.body.data.sendEmail).toBe(false);
    expect(res.body.data.createdBy).toBe(user.name);

    const auditRow = await AuditLog.findOne({ where: { action: 'announcement.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
    expect(auditRow.summary).toMatch(/all enrolled students/i);
  });

  test('happy path: audience=course + courseId creates a scoped announcement', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();

    const res = await agent.post('/api/v1/admin/announcements').send({
      title: 'New lecture uploaded',
      body: 'A new lecture is now available in this course.',
      audience: 'course',
      courseId: course.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.audience).toBe('course');
    expect(res.body.data.courseId).toBe(course.id);
    expect(res.body.data.courseTitle).toBe(course.title);
  });

  test('edge: createdBy is always derived from the session, never a client-supplied string', async () => {
    const { agent, user } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/announcements').send({
      title: 'Spoofed creator attempt',
      body: 'Body text.',
      audience: 'all',
      createdBy: 'Definitely Not A Real Admin',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.createdBy).toBe(user.name);

    const row = await Announcement.findByPk(res.body.data.id);
    expect(row.createdBy).toBe(user.id);
  });

  test('validation failure: audience=course without courseId → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/announcements').send({
      title: 'Missing course id',
      body: 'Body text.',
      audience: 'course',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('not found: audience=course with a non-existent courseId → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/announcements').send({
      title: 'Bogus course',
      body: 'Body text.',
      audience: 'course',
      courseId: 9999999,
    });
    expect(res.status).toBe(404);
  });

  test('validation failure: empty title → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/announcements').send({
      title: '',
      body: 'Body text.',
      audience: 'all',
    });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/announcements').send({ title: 'X', body: 'Y', audience: 'all' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/announcements').send({ title: 'X', body: 'Y', audience: 'all' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/announcements/:id', () => {
  test('happy path: deletes an announcement and audit logs it', async () => {
    const { agent, user } = await createAdminSession(app);
    const created = await agent.post('/api/v1/admin/announcements').send({
      title: 'To be deleted',
      body: 'Body text.',
      audience: 'all',
    });
    const id = created.body.data.id;

    const res = await agent.delete(`/api/v1/admin/announcements/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const stillThere = await Announcement.findByPk(id);
    expect(stillThere).toBeNull();

    const auditRow = await AuditLog.findOne({ where: { action: 'announcement.delete', entityId: id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.delete('/api/v1/admin/announcements/9999999');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).delete('/api/v1/admin/announcements/1');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.delete('/api/v1/admin/announcements/1');
    expect(res.status).toBe(403);
  });
});
