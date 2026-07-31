// server/tests/helpers/studentFixtures.js
// Shared fixture builders for Phase 5.2/5.3 student video/playback supertest
// specs — mirrors tests/helpers/publicFixtures.js's pattern (rows created
// directly via the model layer; server/tests/globalSetup.cjs migrates the
// test DB fresh per run but never seeds it).
import db from '../../src/models/index.js';

const { Enrollment } = db;

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
