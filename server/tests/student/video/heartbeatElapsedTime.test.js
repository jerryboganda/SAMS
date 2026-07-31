// server/tests/student/video/heartbeatElapsedTime.test.js
// Security audit 2026-07-31, Finding 2 (Medium): PUT .../heartbeat's `delta`
// used to be clamped ONLY into [HEARTBEAT_DELTA_MIN_SECONDS,
// HEARTBEAT_DELTA_MAX_SECONDS] (0-60s), a purely client-claimed value with no
// cross-check against how much real wall-clock time had actually passed
// since the session's last heartbeat. A scripted client firing heartbeats
// far faster than the real ~15s player cadence could therefore claim the
// full 60s ceiling on every single call and inflate
// lecture_progress.watched_seconds / user_daily_stats.video_seconds far
// faster than real time allows. This file proves the fix: rapid-fire
// heartbeats (fired back-to-back with no artificial delay — real elapsed
// time between them is only whatever the HTTP/DB round trip itself takes)
// accumulate at most what real elapsed time allows, never anywhere near the
// naively-claimed total.
//
// Deliberately exercises the real, rate-limited HTTP route rather than
// calling videoService.heartbeat() directly — `heartbeatLimiter`
// (middleware/rateLimits.js) has its `max` raised sharply under
// NODE_ENV=test (the same established pattern as authLimiter/playLimiter in
// that file), so this suite's own rapid-fire calls can't trip a spurious 429
// unrelated to what this test is actually asserting.
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../../src/app.js';
import db from '../../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../../helpers/loginFlow.js';
import { HEARTBEAT_DELTA_MAX_SECONDS } from '../../../src/config/constants.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('PUT /api/v1/student/lectures/:id/heartbeat — elapsed-time cross-check (Finding 2)', () => {
  test('rapid-fire heartbeats each claiming the max delta accumulate only what real elapsed time allows, not N * max', async () => {
    const ROUNDS = 8;
    // What the OLD (delta-clamp-only) behavior would have credited: every
    // call claims the max, and every call used to be credited in full.
    const NAIVE_UNFIXED_TOTAL = ROUNDS * HEARTBEAT_DELTA_MAX_SECONDS; // 8 * 60 = 480

    const email = uniqueEmail('hb-elapsed');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    // Long duration so position growth never crosses the 95% completion
    // threshold and starts interacting with isCompleted-related fields.
    const lecture = await createLecture(course, section, { durationSeconds: 6000 });
    await createActiveEnrollment(user, course);

    const { agent } = await loginNewDeviceAndReverify(app, {
      email,
      password: DEFAULT_TEST_PASSWORD,
      userAgent: 'jest-hb-elapsed',
    });

    // Real wall-clock window measured by the test itself, starting BEFORE
    // /play is even called — the session's lastHeartbeatAt baseline is set
    // server-side partway through that call, so timing the window from
    // before it guarantees this is a safe (slightly generous, never tight)
    // upper bound on real elapsed time for every heartbeat call below.
    const wallClockStart = Date.now();

    const play = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    expect(play.status).toBe(200);
    const sessionKey = play.body.data.sessionKey;

    let lastRes;
    for (let i = 0; i < ROUNDS; i += 1) {
      // Intentionally sequential/rapid-fire (not concurrent via Promise.all)
      // to simulate a scripted client hammering the endpoint back-to-back.
      lastRes = await agent
        .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
        .send({ sessionKey, positionSeconds: (i + 1) * 5, deltaSeconds: HEARTBEAT_DELTA_MAX_SECONDS });
      expect(lastRes.status).toBe(200);
    }

    const wallClockElapsedSeconds = (Date.now() - wallClockStart) / 1000;
    const finalWatchedSeconds = lastRes.body.data.progress.watchedSeconds;

    // The core proof: nowhere near the naive claimed total (would be exactly
    // 480 under the pre-fix delta-clamp-only logic, since every call claims
    // the max and every call used to be credited in full).
    expect(finalWatchedSeconds).toBeLessThan(NAIVE_UNFIXED_TOTAL);

    // The precise formula being verified: credited seconds can never exceed
    // real elapsed wall-clock time since the session was opened (+ a small
    // fixed tolerance for HTTP/DB round-trip overhead inherent to measuring
    // "wall clock start" slightly after the session's own lastHeartbeatAt).
    expect(finalWatchedSeconds).toBeLessThanOrEqual(wallClockElapsedSeconds + 2);
  }, 20000);

  test('heartbeats spaced out normally (each after a real elapsed gap) still credit close to the claimed delta', async () => {
    const email = uniqueEmail('hb-elapsed-normal');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section, { durationSeconds: 6000 });
    await createActiveEnrollment(user, course);

    const { agent } = await loginNewDeviceAndReverify(app, {
      email,
      password: DEFAULT_TEST_PASSWORD,
      userAgent: 'jest-hb-elapsed-normal',
    });

    const play = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    const sessionKey = play.body.data.sessionKey;

    // Directly backdate lastHeartbeatAt to simulate a realistic ~15s
    // client cadence without an actual 15s test sleep — a legitimate client
    // claiming a modest, plausible delta (10s) after a real ~15s gap should
    // be credited in full, not clipped by the elapsed-time ceiling.
    await db.PlaybackSession.update({ lastHeartbeatAt: new Date(Date.now() - 15 * 1000) }, { where: { sessionKey } });

    const res = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: 10, deltaSeconds: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.watchedSeconds).toBe(10);
  });
});
