// server/tests/student/courseDetail.test.js
// GET /api/v1/student/courses/:courseId (docs/04_API_SPEC.md §3,
// docs/07_EXECUTION_PLAN.md 6.3) — full curriculum + bulk per-lecture
// progress/bookmark state, enrollment-gated (403 NOT_ENROLLED /
// ENROLLMENT_EXPIRED, distinguished — same convention as
// services/videoService.js's assertEnrolled).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import {
  createCourse,
  createSection,
  createLecture,
  createSubject,
  createBodySystem,
  createQuestionWithOptions,
} from '../helpers/publicFixtures.js';
import {
  createActiveEnrollment,
  createExpiredEnrollment,
  createLectureProgress,
  createLectureBookmark,
} from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

async function courseWithCurriculum(overrides = {}) {
  const course = await createCourse({ title: 'Curriculum Course', ...overrides });
  const section1 = await createSection(course, { title: 'Section One', sortOrder: 0 });
  const section2 = await createSection(course, { title: 'Section Two', sortOrder: 1 });
  const lec1 = await createLecture(course, section1, { title: 'Lecture 1', sortOrder: 0, durationSeconds: 500 });
  const lec2 = await createLecture(course, section1, { title: 'Lecture 2', sortOrder: 1, durationSeconds: 600 });
  const lecUnpublished = await createLecture(course, section1, { title: 'Hidden Lecture', isPublished: false, sortOrder: 2 });
  const lec3 = await createLecture(course, section2, { title: 'Lecture 3', sortOrder: 0, durationSeconds: 700 });
  return { course, section1, section2, lec1, lec2, lec3, lecUnpublished };
}

describe('GET /api/v1/student/courses/:courseId', () => {
  test('happy path: full curriculum with per-lecture progress (isCompleted/watchedSeconds/lastPositionSeconds) + bookmark state merged in bulk', async () => {
    const email = uniqueEmail('coursedetail-happy');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-happy' });
    const { course, lec1, lec2, lec3 } = await courseWithCurriculum();
    const now = new Date();
    const expectedRemainingDays = 47;
    await createActiveEnrollment(user, course, {
      expiresAt: new Date(now.getTime() + expectedRemainingDays * 24 * 60 * 60 * 1000),
    });

    await createLectureProgress(user, lec1, { isCompleted: true, completedAt: new Date(), watchedSeconds: 500, lastPositionSeconds: 500 });
    await createLectureProgress(user, lec2, { isCompleted: false, watchedSeconds: 120, lastPositionSeconds: 120 });
    await createLectureBookmark(user, lec2);
    // lec3: no progress row at all, no bookmark — must default cleanly.

    const res = await agent.get(`/api/v1/student/courses/${course.id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;

    expect(data.course.id).toBe(course.id);
    expect(data.course.title).toBe('Curriculum Course');
    expect(data.sections).toHaveLength(2);

    // Section 1: lec1 (completed), lec2 (in-progress+bookmarked); the
    // unpublished lecture must be excluded entirely.
    const section1 = data.sections.find((s) => s.title === 'Section One');
    expect(section1.lectures.map((l) => l.title)).toEqual(['Lecture 1', 'Lecture 2']);

    const l1 = section1.lectures.find((l) => l.id === lec1.id);
    expect(l1.isCompleted).toBe(true);
    expect(l1.watchedSeconds).toBe(500);
    expect(l1.lastPositionSeconds).toBe(500);
    expect(l1.isBookmarked).toBe(false);

    const l2 = section1.lectures.find((l) => l.id === lec2.id);
    expect(l2.isCompleted).toBe(false);
    expect(l2.watchedSeconds).toBe(120);
    expect(l2.lastPositionSeconds).toBe(120);
    expect(l2.isBookmarked).toBe(true);

    // Section 2: lec3, no progress/bookmark rows at all -> clean defaults.
    const section2 = data.sections.find((s) => s.title === 'Section Two');
    const l3 = section2.lectures.find((l) => l.id === lec3.id);
    expect(l3.isCompleted).toBe(false);
    expect(l3.watchedSeconds).toBe(0);
    expect(l3.lastPositionSeconds).toBe(0);
    expect(l3.isBookmarked).toBe(false);

    // Top-level progressPercent: 1 of 3 published lectures completed.
    expect(data.progressPercent).toBe(33);

    // Phase 13.3: real per-course validity days remaining — sourced from
    // THIS SPECIFIC enrollment's `expiresAt` (47 days out, set above), not a
    // hardcoded "140 Days Validity Remaining" badge
    // (client/src/pages/student/CourseHomePage.tsx previously fabricated
    // this). Proves it's a real computation, not a coincidental constant.
    expect(data.enrollment).toBeTruthy();
    expect(data.enrollment.remainingDays).toBe(expectedRemainingDays);
    expect(data.enrollment.status).toBe('active');

    // Phase 13.3: real total watched time for this course = sum of every
    // lecture's watchedSeconds for this user (500 + 120 + 0 = 620), not a
    // hardcoded "18.5 / 20.0 Hours" stat.
    expect(data.totalWatchedSeconds).toBe(620);
  });

  test('Phase 13.3 edge: enrollment.remainingDays reflects the EXACT enrollment expiresAt, not a fixed/rounded constant (a second, differently-dated enrollment proves it is not coincidental)', async () => {
    const email = uniqueEmail('coursedetail-validity');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-validity' });
    const { course } = await courseWithCurriculum();
    const now = new Date();
    await createActiveEnrollment(user, course, { expiresAt: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000) });

    const res = await agent.get(`/api/v1/student/courses/${course.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.enrollment.remainingDays).toBe(9);
  });

  test('Phase 13.3: qbankQuestionsCount is a real count of active questions sharing the course\'s examCategory (not a hardcoded "60+ Vignettes"), and is 0 for a course with includesQbank=false', async () => {
    const email = uniqueEmail('coursedetail-qbankcount');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-qbankcount' });

    const subject = await createSubject();
    const system = await createBodySystem();
    const { course } = await courseWithCurriculum({ examCategory: 'NRE1', includesQbank: true });
    await createActiveEnrollment(user, course);

    // Baseline BEFORE adding fixtures — the `questions` table is shared
    // across this whole test run (server/tests/globalSetup.cjs migrates
    // once, never wipes between files; many other suites also create
    // active NRE1 questions), so this proves a real, LIVE count (delta of
    // exactly +3 from whatever already existed) rather than assuming
    // exclusive ownership of the table.
    const baseline = await db.Question.count({ where: { examCategory: 'NRE1', isActive: true } });

    // 3 active NRE1 questions (must count), 1 inactive NRE1 question (must
    // NOT count), 1 active question in a DIFFERENT exam category (must NOT
    // count either — no direct course<->question FK, examCategory is the
    // real scoping proxy).
    await createQuestionWithOptions({ subject, system, overrides: { examCategory: 'NRE1' } });
    await createQuestionWithOptions({ subject, system, overrides: { examCategory: 'NRE1' } });
    await createQuestionWithOptions({ subject, system, overrides: { examCategory: 'NRE1' } });
    await createQuestionWithOptions({ subject, system, overrides: { examCategory: 'NRE1', isActive: false } });
    await createQuestionWithOptions({ subject, system, overrides: { examCategory: 'SMLE' } });

    const res = await agent.get(`/api/v1/student/courses/${course.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.qbankQuestionsCount).toBe(baseline + 3);

    // A second, video-only course (includesQbank=false) in the SAME exam
    // category must report 0 — never a plausible-looking nonzero guess.
    const email2 = uniqueEmail('coursedetail-qbankcount-novideo');
    const { user: user2 } = await createVerifiedUser({ email: email2 });
    const { agent: agent2 } = await loginNewDeviceAndReverify(app, {
      email: email2,
      password: DEFAULT_TEST_PASSWORD,
      userAgent: 'jest-coursedetail-qbankcount-novideo',
    });
    const { course: videoOnlyCourse } = await courseWithCurriculum({ examCategory: 'NRE1', includesQbank: false });
    await createActiveEnrollment(user2, videoOnlyCourse);

    const res2 = await agent2.get(`/api/v1/student/courses/${videoOnlyCourse.id}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.qbankQuestionsCount).toBe(0);
  });

  test('not enrolled at all -> 403 NOT_ENROLLED', async () => {
    const email = uniqueEmail('coursedetail-notenrolled');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-notenrolled' });
    const { course } = await courseWithCurriculum();

    const res = await agent.get(`/api/v1/student/courses/${course.id}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  test('enrollment exists but is expired -> 403 ENROLLMENT_EXPIRED (distinct from NOT_ENROLLED)', async () => {
    const email = uniqueEmail('coursedetail-expired');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-expired' });
    const { course } = await courseWithCurriculum();
    await createExpiredEnrollment(user, course);

    const res = await agent.get(`/api/v1/student/courses/${course.id}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ENROLLMENT_EXPIRED');
    expect(res.body.error.code).not.toBe('NOT_ENROLLED');
  });

  test('nonexistent course id -> 404 NOT_FOUND', async () => {
    const email = uniqueEmail('coursedetail-missing');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-missing' });

    const res = await agent.get('/api/v1/student/courses/999999999');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('unpublished course -> 404 NOT_FOUND, even for an enrolled student (does not leak existence)', async () => {
    const email = uniqueEmail('coursedetail-unpublished');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-unpublished' });
    const { course } = await courseWithCurriculum({ isPublished: false });
    await createActiveEnrollment(user, course);

    const res = await agent.get(`/api/v1/student/courses/${course.id}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('validation: a non-numeric courseId is rejected with 422 before hitting the DB', async () => {
    const email = uniqueEmail('coursedetail-badid');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coursedetail-badid' });

    const res = await agent.get('/api/v1/student/courses/not-a-number');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('no auth at all -> 401 UNAUTHENTICATED', async () => {
    const { course } = await courseWithCurriculum();
    const res = await request(app).get(`/api/v1/student/courses/${course.id}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const { course } = await courseWithCurriculum();
    const res = await agent.get(`/api/v1/student/courses/${course.id}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
