// server/tests/announcements/announcements.test.js
// GET /announcements (student-facing, docs/07_EXECUTION_PLAN.md 10.2). The
// explicit Phase 10.2 AC: "course-audience only reaches enrolled fixture
// users." Structure mirrors tests/admin/coupons.test.js's supertest style.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createActiveEnrollment, createAnnouncement } from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/announcements', () => {
  test('happy path: a student enrolled only in course A sees the "all" one + course A\'s one, not course B\'s', async () => {
    const courseA = await createCourse();
    const courseB = await createCourse();

    const email = uniqueEmail('announce-student');
    const { user } = await createVerifiedUser({ email });
    await createActiveEnrollment(user, courseA);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'announce-agent/1.0' });

    const allAnnouncement = await createAnnouncement({ title: 'Sitewide notice', audience: 'all' });
    const courseAAnnouncement = await createAnnouncement({ title: 'Course A notice', audience: 'course', courseId: courseA.id });
    const courseBAnnouncement = await createAnnouncement({ title: 'Course B notice', audience: 'course', courseId: courseB.id });

    const res = await agent.get('/api/v1/announcements');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((a) => a.id);

    expect(ids).toContain(allAnnouncement.id);
    expect(ids).toContain(courseAAnnouncement.id);
    expect(ids).not.toContain(courseBAnnouncement.id);
  });

  test('edge: a student with no enrollments still sees "all" announcements', async () => {
    const email = uniqueEmail('announce-noenroll');
    const { user: _user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'announce-noenroll-agent/1.0' });

    const allAnnouncement = await createAnnouncement({ title: 'Sitewide notice for everyone', audience: 'all' });

    const res = await agent.get('/api/v1/announcements');
    expect(res.status).toBe(200);
    expect(res.body.data.map((a) => a.id)).toContain(allAnnouncement.id);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/announcements');
    expect(res.status).toBe(401);
  });
});
