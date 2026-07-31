// server/tests/student/coursesList.test.js
// GET /api/v1/student/courses (docs/04_API_SPEC.md §3,
// docs/07_EXECUTION_PLAN.md 6.2) — "my enrollments with progress + expiry".
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../helpers/publicFixtures.js';
import { createActiveEnrollment, createExpiredEnrollment, createLectureProgress } from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/student/courses', () => {
  test('happy path: returns every enrollment (active AND expired) with progress % + expiry, not just currently-active ones', async () => {
    const email = uniqueEmail('courses-happy');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-courses-happy' });

    const activeCourse = await createCourse({ title: 'Active Course' });
    const activeSection = await createSection(activeCourse);
    const lec1 = await createLecture(activeCourse, activeSection, { sortOrder: 0 });
    const lec2 = await createLecture(activeCourse, activeSection, { sortOrder: 1 });
    await createLecture(activeCourse, activeSection, { isPublished: false, sortOrder: 2 }); // must not count
    await createActiveEnrollment(user, activeCourse);
    await createLectureProgress(user, lec1, { isCompleted: true, completedAt: new Date() });
    await createLectureProgress(user, lec2, { isCompleted: false });

    const expiredCourse = await createCourse({ title: 'Expired Course' });
    await createExpiredEnrollment(user, expiredCourse);

    const res = await agent.get('/api/v1/student/courses');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);

    const active = res.body.data.find((e) => e.courseId === activeCourse.id);
    const expired = res.body.data.find((e) => e.courseId === expiredCourse.id);

    expect(active.status).toBe('active');
    expect(active.courseTitle).toBe('Active Course');
    expect(active.progressPercent).toBe(50); // 1 of 2 published lectures completed
    expect(active.remainingDays).toBeGreaterThan(14);

    expect(expired.status).toBe('active'); // still "active" in DB, just past expiresAt — see studentFixtures.js
    expect(expired.remainingDays).toBe(0);
    expect(expired.progressPercent).toBe(0);
  });

  test('no enrollments -> empty array, not an error', async () => {
    const email = uniqueEmail('courses-empty');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-courses-empty' });

    const res = await agent.get('/api/v1/student/courses');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('no auth at all -> 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/student/courses');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/student/courses');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
