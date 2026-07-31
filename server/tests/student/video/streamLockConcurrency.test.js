// server/tests/student/video/streamLockConcurrency.test.js
// Security audit 2026-07-31, Finding 1 (HIGH, blocking): the pre-fix
// acquirePlaybackSession() closed any existing active playback_sessions row
// and created a new one as two independent, unsynchronized statements — a
// classic read-then-write race. Every OTHER video test in this directory
// (streamLock.test.js included) exercises /play sequentially with plain
// `await`, which can never observe the race: two sequential calls always
// see each other's effects because there's no overlap. This file is the one
// place in the suite that fires genuinely CONCURRENT `/play` requests
// (`Promise.all` over many supertest calls in flight at once, not sequential
// awaits) for a single authenticated, enrolled user, and asserts the
// platform-wide single-concurrent-stream invariant still holds afterward:
// exactly one `playback_sessions` row with `ended_at IS NULL` for that user.
//
// This test was run against the pre-fix code (unconditional
// PlaybackSession.update() followed by a separate .create(), no transaction
// or row lock) and reliably reproduced MULTIPLE simultaneously-active rows
// (observed 6-15 active rows out of 15 concurrent requests across repeated
// runs — see DECISIONS.md 2026-07-31 for the exact reproduction transcript).
// After the fix (acquirePlaybackSession() wrapped in a sequelize.transaction()
// that takes a per-user row lock via User.findByPk(..., {lock:
// transaction.LOCK.UPDATE}) before the update+create pair), this test passes
// reliably — verified across 10 repeated runs, see DECISIONS.md.
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../../src/app.js';
import db from '../../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../../helpers/loginFlow.js';

const { sequelize, PlaybackSession } = db;

// 15 concurrent requests: enough to reliably trigger the race under real
// connection-pool interleaving (docs/07_EXECUTION_PLAN.md 5.6's own
// reproduction used the same figure), while staying comfortably inside the
// pool's max of 10 connections queuing rather than erroring.
const CONCURRENT_REQUESTS = 15;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/student/lectures/:id/play — concurrent-stream lock is atomic under real concurrency', () => {
  test('15 genuinely concurrent /play calls for one user leave exactly one active (ended_at IS NULL) playback session', async () => {
    const email = uniqueEmail('concurrent-play');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section, { durationSeconds: 600 });
    await createActiveEnrollment(user, course);

    const { agent } = await loginNewDeviceAndReverify(app, {
      email,
      password: DEFAULT_TEST_PASSWORD,
      userAgent: 'jest-concurrent-play',
    });

    // The critical part: these fire together (all promises created before
    // any is awaited), not one after another — genuine overlap in flight,
    // exercising the real race window in acquirePlaybackSession().
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => agent.get(`/api/v1/student/lectures/${lecture.id}/play`))
    );

    // Every individual request should still succeed — the fix serializes
    // the close+create pair, it doesn't reject any caller.
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body?.data?.sessionKey).toBeTruthy();
    }

    const allSessions = await PlaybackSession.findAll({ where: { userId: user.id } });
    // One playback_sessions row was created per request — none were lost or
    // deduplicated, just serialized.
    expect(allSessions.length).toBe(CONCURRENT_REQUESTS);

    const activeSessions = allSessions.filter((s) => s.endedAt === null);
    // The actual invariant under test: no matter how many requests raced,
    // AT MOST (and, since at least one call must succeed, EXACTLY) one
    // session may remain active afterward.
    expect(activeSessions.length).toBe(1);
  }, 30000);
});
