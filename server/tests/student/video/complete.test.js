// server/tests/student/video/complete.test.js
// POST /api/v1/student/lectures/:id/complete (docs/04_API_SPEC.md §3,
// docs/07_EXECUTION_PLAN.md 5.3) — manual mark-complete fallback, still
// gated by the same enrollment check as /play.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import db from '../../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../../helpers/loginFlow.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/student/lectures/:id/complete', () => {
  test('happy path: marks an enrolled lecture complete', async () => {
    const email = uniqueEmail('complete-happy');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-complete-happy' });

    const res = await agent.post(`/api/v1/student/lectures/${lecture.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isCompleted).toBe(true);
    expect(res.body.data.completedAt).toBeTruthy();
  });

  test('is idempotent: calling twice keeps isCompleted true without erroring', async () => {
    const email = uniqueEmail('complete-idempotent');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-complete-idempotent' });

    const first = await agent.post(`/api/v1/student/lectures/${lecture.id}/complete`);
    const second = await agent.post(`/api/v1/student/lectures/${lecture.id}/complete`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.isCompleted).toBe(true);
  });

  test('not enrolled -> 403 NOT_ENROLLED (same gate as /play)', async () => {
    const email = uniqueEmail('complete-notenrolled');
    await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-complete-notenrolled' });

    const res = await agent.post(`/api/v1/student/lectures/${lecture.id}/complete`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  test('no auth at all -> 401 UNAUTHENTICATED', async () => {
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);

    const res = await request(app).post(`/api/v1/student/lectures/${lecture.id}/complete`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('wrong role (admin) -> 403 FORBIDDEN — this route is student-only', async () => {
    const email = uniqueEmail('complete-adminrole');
    await createVerifiedUser({ email, role: 'admin' });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-complete-adminrole' });

    const res = await agent.post(`/api/v1/student/lectures/${lecture.id}/complete`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('validation: a non-numeric lecture id is rejected with 422', async () => {
    const email = uniqueEmail('complete-validation');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-complete-validation' });

    const res = await agent.post('/api/v1/student/lectures/not-a-number/complete');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
