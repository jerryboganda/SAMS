// server/tests/admin/lectures.test.js
// CRUD + reorder-integrity + the delete-guard for lectures with recorded
// student progress/bookmarks (docs/07_EXECUTION_PLAN.md Phase 4.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse, createSection, createLecture } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, Lecture, LectureProgress, User } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/sections/:sectionId/lectures', () => {
  test('happy path', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    await createLecture(course, section, { title: 'Lecture 1' });

    const res = await agent.get(`/api/v1/admin/sections/${section.id}/lectures`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    const res = await agent.get(`/api/v1/admin/sections/${section.id}/lectures`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/sections/:sectionId/lectures', () => {
  test('happy path: creates a lecture under the section (courseId derived server-side)', async () => {
    const { agent, user } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);

    const res = await agent.post(`/api/v1/admin/sections/${section.id}/lectures`).send({
      title: 'RTA Types I, II, IV',
      durationSeconds: 1800,
      videoRef: 'bun_ren_01',
      isFreePreview: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.courseId).toBe(course.id);
    expect(res.body.data.sectionId).toBe(section.id);
    expect(res.body.data.isFreePreview).toBe(true);

    const auditRow = await AuditLog.findOne({ where: { action: 'lecture.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('validation failure: missing title → 422', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    const res = await agent.post(`/api/v1/admin/sections/${section.id}/lectures`).send({ durationSeconds: 100 });
    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/v1/admin/lectures/:id', () => {
  test('happy path: partial update', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    const lecture = await createLecture(course, section);

    const res = await agent.patch(`/api/v1/admin/lectures/${lecture.id}`).send({ isPublished: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isPublished).toBe(true);
  });

  test('auth failure: no session → 401', async () => {
    const course = await createCourse();
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    const res = await request(app).patch(`/api/v1/admin/lectures/${lecture.id}`).send({ isPublished: true });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/admin/lectures/:id', () => {
  test('happy path: a lecture with no student progress/bookmarks is deletable', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    const lecture = await createLecture(course, section);

    const res = await agent.delete(`/api/v1/admin/lectures/${lecture.id}`);
    expect(res.status).toBe(200);

    const gone = await Lecture.findByPk(lecture.id);
    expect(gone).toBeNull();
  });

  test('edge (delete guard): a lecture with recorded student progress cannot be deleted → 409', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    const student = await User.create({
      name: 'Watcher',
      email: `watcher-${Date.now()}@example.test`,
      passwordHash: 'x',
      role: 'student',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    await LectureProgress.create({ userId: student.id, lectureId: lecture.id, watchedSeconds: 120, isCompleted: false });

    const res = await agent.delete(`/api/v1/admin/lectures/${lecture.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('PATCH /api/v1/admin/sections/:sectionId/lectures/reorder', () => {
  test('happy path: reorders lectures within a section', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    const l1 = await createLecture(course, section, { sortOrder: 0 });
    const l2 = await createLecture(course, section, { sortOrder: 1 });

    const res = await agent
      .patch(`/api/v1/admin/sections/${section.id}/lectures/reorder`)
      .send({ orderedIds: [l2.id, l1.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.map((l) => l.id)).toEqual([l2.id, l1.id]);

    const auditRow = await AuditLog.findOne({ where: { action: 'lecture.reorder', entityId: section.id } });
    expect(auditRow).not.toBeNull();
  });

  test('edge (reorder-integrity): extra foreign id rejected → 422, order unchanged', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const section = await createSection(course);
    const otherSection = await createSection(course);
    const l1 = await createLecture(course, section, { sortOrder: 0 });
    const foreign = await createLecture(course, otherSection, { sortOrder: 0 });

    const res = await agent
      .patch(`/api/v1/admin/sections/${section.id}/lectures/reorder`)
      .send({ orderedIds: [l1.id, foreign.id] });

    expect(res.status).toBe(422);
    expect(res.body.error.details.extra).toContain(foreign.id);

    const reloaded = await Lecture.findByPk(l1.id);
    expect(reloaded.sortOrder).toBe(0);
  });
});
