// server/tests/student/dashboard.test.js
// GET /api/v1/student/dashboard (docs/04_API_SPEC.md §3,
// docs/07_EXECUTION_PLAN.md 6.1) — aggregate shape, auth/role gating, and the
// hard <=8-DB-query budget acceptance criterion (proven via a temporary
// `sequelize.options.logging` counter around the real HTTP request, not
// eyeballed).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../helpers/publicFixtures.js';
import {
  createActiveEnrollment,
  createExpiringSoonEnrollment,
  createLectureProgress,
  createUserDailyStat,
  createAnnouncement,
  createNotification,
} from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

/** Counts every SQL statement Sequelize executes while `fn` is in flight. */
async function countQueriesDuring(fn) {
  const original = sequelize.options.logging;
  let count = 0;
  sequelize.options.logging = () => {
    count += 1;
  };
  try {
    const result = await fn();
    return { result, count };
  } finally {
    sequelize.options.logging = original;
  }
}

describe('GET /api/v1/student/dashboard', () => {
  test('happy path: full aggregate shape (enrollments+progress, continue-watching, study hours, announcements, notifications)', async () => {
    const email = uniqueEmail('dash-happy');
    const { user } = await createVerifiedUser({ email, name: 'Dash Student' });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-dash-happy' });

    // Course 1: 2 published lectures + 1 unpublished (must not count), 1
    // completed + 1 incomplete progress row (the incomplete one is the ONLY
    // incomplete row in this test, so it's unambiguously "continue watching").
    const course1 = await createCourse({ title: 'Dashboard Course One' });
    const section1 = await createSection(course1);
    const lecCompleted = await createLecture(course1, section1, { title: 'Completed Lecture', durationSeconds: 300, sortOrder: 0 });
    const lecInProgress = await createLecture(course1, section1, { title: 'In-Progress Lecture', durationSeconds: 400, sortOrder: 1 });
    await createLecture(course1, section1, { title: 'Unpublished Lecture', isPublished: false, sortOrder: 2 });
    await createActiveEnrollment(user, course1);
    await createLectureProgress(user, lecCompleted, { isCompleted: true, completedAt: new Date(), watchedSeconds: 300, lastPositionSeconds: 300 });
    await createLectureProgress(user, lecInProgress, { watchedSeconds: 150, lastPositionSeconds: 150 });

    // Course 2: expiring soon (5 days out), zero lectures/progress.
    const course2 = await createCourse({ title: 'Dashboard Course Two (Expiring)' });
    await createExpiringSoonEnrollment(user, course2);

    // A third, unrelated published course this student is NOT enrolled in —
    // its course-scoped announcement must never appear in the response.
    const otherCourse = await createCourse({ title: 'Not My Course' });

    // Study hours: one stat row today (within 7d) totalling 3600s = 1.0h,
    // one stat row 20 days ago (outside 7d) totalling another 3600s = 1.0h —
    // so studyHours7d should be 1.0 and studyHoursTotal 2.0.
    await createUserDailyStat(user, { qbankSeconds: 600, videoSeconds: 3000 });
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await createUserDailyStat(user, { statDate: twentyDaysAgo, qbankSeconds: 1800, videoSeconds: 1800 });

    // Announcements: 'all' (visible), this-course (visible, enrolled),
    // other-course (NOT visible, not enrolled).
    await createAnnouncement({ title: 'Global Announcement', audience: 'all' });
    await createAnnouncement({ title: 'My Course Announcement', audience: 'course', courseId: course1.id });
    await createAnnouncement({ title: 'Other Course Announcement', audience: 'course', courseId: otherCourse.id });

    // Notifications: 2 unread, 1 read.
    await createNotification(user, { isRead: false });
    await createNotification(user, { isRead: false });
    await createNotification(user, { isRead: true });

    const { result: res, count: queryCount } = await countQueriesDuring(() => agent.get('/api/v1/student/dashboard'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;

    // --- Query budget (hard AC: <=8 total DB queries for this endpoint) ---
    console.log(`[dashboard.test] total DB queries for one GET /student/dashboard request: ${queryCount}`);
    expect(queryCount).toBeLessThanOrEqual(8);

    // --- activeEnrollments + progress % + expiry ---
    expect(data.activeEnrollments).toHaveLength(2);
    const c1 = data.activeEnrollments.find((e) => e.courseId === course1.id);
    const c2 = data.activeEnrollments.find((e) => e.courseId === course2.id);
    expect(c1).toBeTruthy();
    expect(c1.courseTitle).toBe('Dashboard Course One');
    expect(c1.progressPercent).toBe(50); // 1 of 2 published lectures completed
    expect(c1.status).toBe('active');
    expect(c2).toBeTruthy();
    expect(c2.progressPercent).toBe(0);
    // "Expiring soon" window = 14 days (client/src/components/student/CourseCard.tsx's own threshold) — see DECISIONS.md.
    expect(c2.remainingDays).toBeLessThanOrEqual(14);
    expect(c2.remainingDays).toBeGreaterThanOrEqual(4);

    // --- continue-watching ---
    expect(data.continueWatching).toBeTruthy();
    expect(data.continueWatching.lecture.id).toBe(lecInProgress.id);
    expect(data.continueWatching.courseId).toBe(course1.id);
    expect(data.continueWatching.courseTitle).toBe('Dashboard Course One');
    expect(data.continueWatching.watchedSeconds).toBe(150);
    expect(data.continueWatching.durationSeconds).toBe(400);

    // --- study hours (7d / total) ---
    expect(data.studyHours7d).toBe(1);
    expect(data.studyHoursTotal).toBe(2);

    // --- qbankStats: always present and zeroed (Phase 7/8 domain — see
    // services/studentDashboardService.js's doc comment) so the already-built
    // dashboard UI's unconditional `stats?.qbankStats.correctPercent` never
    // throws.
    expect(data.qbankStats).toEqual({
      totalAttempted: 0,
      correctPercent: 0,
      activeStreakDays: 0,
      testsTakenCount: 0,
    });

    // --- announcements: top 5, 'all' + own-course only, ordered by recency ---
    const titles = data.announcements.map((a) => a.title);
    expect(titles).toContain('Global Announcement');
    expect(titles).toContain('My Course Announcement');
    expect(titles).not.toContain('Other Course Announcement');
    expect(data.announcements.length).toBeLessThanOrEqual(5);

    // --- unread notification count ---
    expect(data.unreadNotificationsCount).toBe(2);
  });

  test('continue-watching picks the most-recently-updated incomplete lecture, not just any incomplete one', async () => {
    const email = uniqueEmail('dash-continue');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-dash-continue' });

    const course = await createCourse({ title: 'Continue-Watching Course' });
    const section = await createSection(course);
    const olderLecture = await createLecture(course, section, { title: 'Older Incomplete', sortOrder: 0 });
    const newerLecture = await createLecture(course, section, { title: 'Newer Incomplete', sortOrder: 1 });
    await createActiveEnrollment(user, course);

    const olderProgress = await createLectureProgress(user, olderLecture, { watchedSeconds: 10, lastPositionSeconds: 10 });
    const newerProgress = await createLectureProgress(user, newerLecture, { watchedSeconds: 20, lastPositionSeconds: 20 });

    // Force an unambiguous updatedAt ordering regardless of same-millisecond
    // test-execution timing: backdate the older row (`silent: true` stops
    // Sequelize's own auto-touch hook from overwriting the explicit value).
    await olderProgress.update({ updatedAt: new Date(Date.now() - 60 * 1000) }, { silent: true });
    await newerProgress.update({ updatedAt: new Date() }, { silent: true });

    const res = await agent.get('/api/v1/student/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.continueWatching.lecture.id).toBe(newerLecture.id);
  });

  test('no enrollments / no activity yet: still returns a valid, empty-shaped payload (no 500s from missing data)', async () => {
    const email = uniqueEmail('dash-empty');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-dash-empty' });

    const res = await agent.get('/api/v1/student/dashboard');

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.activeEnrollments).toEqual([]);
    expect(data.continueWatching).toBeUndefined();
    expect(data.studyHours7d).toBe(0);
    expect(data.studyHoursTotal).toBe(0);
    expect(data.unreadNotificationsCount).toBe(0);
    expect(Array.isArray(data.announcements)).toBe(true);
  });

  test('no auth at all -> 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/student/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/student/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
