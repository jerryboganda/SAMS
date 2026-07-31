// server/tests/helpers/studentFixtures.js
// Shared fixture builders for Phase 5.2/5.3 student video/playback and Phase
// 6.1-6.3 dashboard/courses supertest specs — mirrors
// tests/helpers/publicFixtures.js's pattern (rows created directly via the
// model layer; server/tests/globalSetup.cjs migrates the test DB fresh per
// run but never seeds it, so every spec builds its own minimal fixtures
// rather than depending on the demo seeders — see DECISIONS.md 2026-07-31
// Phase 6.1-6.3 entry for why this established pattern was kept, not
// switched to the seeded `student@samsacademy.com` demo account).
import db from '../../src/models/index.js';

const { Enrollment, LectureProgress, LectureBookmark, UserDailyStat, Announcement, Notification } = db;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** An active, not-yet-expired enrollment for `user` in `course` (default: expires in 180 days). */
export async function createActiveEnrollment(user, course, overrides = {}) {
  const now = new Date();
  return Enrollment.create({
    userId: user.id,
    courseId: course.id,
    source: 'manual',
    status: 'active',
    startsAt: now,
    expiresAt: new Date(now.getTime() + 180 * ONE_DAY_MS),
    ...overrides,
  });
}

/** An enrollment that exists but is no longer usable — expired in the past (still `status: 'active'`). */
export async function createExpiredEnrollment(user, course, overrides = {}) {
  const now = new Date();
  return Enrollment.create({
    userId: user.id,
    courseId: course.id,
    source: 'manual',
    status: 'active',
    startsAt: new Date(now.getTime() - 200 * ONE_DAY_MS),
    expiresAt: new Date(now.getTime() - 20 * ONE_DAY_MS),
    ...overrides,
  });
}

/** An enrollment still flagged `status: 'active'` but expiring soon (default: 5 days out — inside the 14-day window). */
export async function createExpiringSoonEnrollment(user, course, overrides = {}) {
  const now = new Date();
  return Enrollment.create({
    userId: user.id,
    courseId: course.id,
    source: 'purchase',
    status: 'active',
    startsAt: new Date(now.getTime() - 30 * ONE_DAY_MS),
    expiresAt: new Date(now.getTime() + 5 * ONE_DAY_MS),
    ...overrides,
  });
}

export async function createLectureProgress(user, lecture, overrides = {}) {
  return LectureProgress.create({
    userId: user.id,
    lectureId: lecture.id,
    watchedSeconds: 0,
    lastPositionSeconds: 0,
    isCompleted: false,
    ...overrides,
  });
}

export async function createLectureBookmark(user, lecture) {
  return LectureBookmark.create({ userId: user.id, lectureId: lecture.id });
}

/** `statDate` defaults to today (UTC, `YYYY-MM-DD`). */
export async function createUserDailyStat(user, overrides = {}) {
  return UserDailyStat.create({
    userId: user.id,
    statDate: new Date().toISOString().slice(0, 10),
    questionsAttempted: 0,
    questionsCorrect: 0,
    qbankSeconds: 0,
    videoSeconds: 0,
    ...overrides,
  });
}

export async function createAnnouncement(overrides = {}) {
  return Announcement.create({
    title: 'Test Announcement',
    body: 'Announcement body.',
    audience: 'all',
    sendEmail: false,
    ...overrides,
  });
}

export async function createNotification(user, overrides = {}) {
  return Notification.create({
    userId: user.id,
    type: 'test',
    title: 'Test Notification',
    isRead: false,
    ...overrides,
  });
}
