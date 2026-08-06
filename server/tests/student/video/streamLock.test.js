// server/tests/student/video/streamLock.test.js
// PUT /api/v1/student/lectures/:id/heartbeat (docs/04_API_SPEC.md §3,
// docs/02_ARCHITECTURE.md §4 "Concurrent stream lock", docs/07_EXECUTION_PLAN.md
// 5.3) — the one-active-session-per-user-platform-wide lock, the IDOR guard
// on sessionKey, and server-side delta/position clamping.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import db from '../../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../../helpers/loginFlow.js';
import { LECTURE_COMPLETE_THRESHOLD_RATIO } from '../../../src/config/constants.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('PUT /api/v1/student/lectures/:id/heartbeat — concurrent stream lock', () => {
  test('second stream (another device) steals the first: old session 409s, new session heartbeats fine', async () => {
    const email = uniqueEmail('steal');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lectureA = await createLecture(course, section, { durationSeconds: 600 });
    const lectureB = await createLecture(course, section, { durationSeconds: 600 });
    await createActiveEnrollment(user, course);

    // Two distinct devices for the SAME user (distinct User-Agent -> distinct
    // fingerprint, both within the 2-device cap) — see DECISIONS.md's Phase 2
    // entry: two logins on one simulated device would invalidate each
    // other's device_token, which isn't the scenario being tested here.
    const { agent: agentA } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-device-A' });
    const { agent: agentB } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-device-B' });

    const playA = await agentA.get(`/api/v1/student/lectures/${lectureA.id}/play`);
    expect(playA.status).toBe(200);
    const sessionKeyA = playA.body.data.sessionKey;

    // Device A's stream is confirmed alive before B steals it.
    const hbA1 = await agentA
      .put(`/api/v1/student/lectures/${lectureA.id}/heartbeat`)
      .send({ sessionKey: sessionKeyA, positionSeconds: 10, deltaSeconds: 10 });
    expect(hbA1.status).toBe(200);

    // Device B starts playback (a different lecture) — this must steal A's slot.
    const playB = await agentB.get(`/api/v1/student/lectures/${lectureB.id}/play`);
    expect(playB.status).toBe(200);
    const sessionKeyB = playB.body.data.sessionKey;
    expect(sessionKeyB).not.toBe(sessionKeyA);

    // Old session's next heartbeat is rejected — its player must stop.
    const hbA2 = await agentA
      .put(`/api/v1/student/lectures/${lectureA.id}/heartbeat`)
      .send({ sessionKey: sessionKeyA, positionSeconds: 20, deltaSeconds: 10 });
    expect(hbA2.status).toBe(409);
    expect(hbA2.body.error.code).toBe('STREAM_TAKEN_OVER');

    // New session's heartbeat succeeds normally.
    const hbB1 = await agentB
      .put(`/api/v1/student/lectures/${lectureB.id}/heartbeat`)
      .send({ sessionKey: sessionKeyB, positionSeconds: 15, deltaSeconds: 15 });
    expect(hbB1.status).toBe(200);
    expect(hbB1.body.data.status).toBe('ok');
  });

  test('heartbeat with someone else\'s sessionKey fails (IDOR guard)', async () => {
    const emailVictim = uniqueEmail('idor-victim');
    const emailAttacker = uniqueEmail('idor-attacker');
    const { user: victim } = await createVerifiedUser({ email: emailVictim });
    await createVerifiedUser({ email: emailAttacker });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section, { durationSeconds: 600 });
    await createActiveEnrollment(victim, course);

    const { agent: victimAgent } = await loginNewDeviceAndReverify(app, { email: emailVictim, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-idor-victim' });
    const { agent: attackerAgent } = await loginNewDeviceAndReverify(app, { email: emailAttacker, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-idor-attacker' });

    const play = await victimAgent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    expect(play.status).toBe(200);
    const victimSessionKey = play.body.data.sessionKey;

    const res = await attackerAgent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey: victimSessionKey, positionSeconds: 5, deltaSeconds: 5 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    // The victim's own session is completely unaffected by the attempt.
    const victimHb = await victimAgent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey: victimSessionKey, positionSeconds: 6, deltaSeconds: 6 });
    expect(victimHb.status).toBe(200);
  });

  test('heartbeat position/delta are clamped server-side, not trusted raw', async () => {
    const email = uniqueEmail('clamp');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section, { durationSeconds: 100 });
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-clamp' });

    const play = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    const sessionKey = play.body.data.sessionKey;

    // This test is specifically about the [MIN, MAX] delta/position clamp,
    // not the elapsed-wall-clock-time cross-check (Finding 2 fix) — so the
    // session's `lastHeartbeatAt` is backdated well past
    // HEARTBEAT_DELTA_MAX_SECONDS here to simulate a realistic gap since the
    // last heartbeat, keeping the elapsed-time ceiling from clipping the
    // very thing being asserted below (a real client's heartbeats are ~15s
    // apart, not milliseconds like this test's immediate play->heartbeat call).
    await db.PlaybackSession.update(
      { lastHeartbeatAt: new Date(Date.now() - 120 * 1000) },
      { where: { sessionKey } }
    );

    // Absurd delta (claiming 10000s watched in one heartbeat) and an
    // out-of-range position (beyond the lecture's 100s duration).
    const res = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: 999999, deltaSeconds: 10000 });

    expect(res.status).toBe(200);
    // Position clamped to the lecture's duration (100s).
    expect(res.body.data.progress.lastPositionSeconds).toBe(100);
    // Delta clamped to HEARTBEAT_DELTA_MAX_SECONDS (60), not the raw 10000.
    expect(res.body.data.progress.watchedSeconds).toBe(60);
    expect(res.body.data.progress.watchedSeconds).toBeLessThan(10000);

    // A negative delta/position is clamped up to the floor (0), not stored as negative.
    const res2 = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: -50, deltaSeconds: -50 });
    expect(res2.status).toBe(200);
    expect(res2.body.data.progress.lastPositionSeconds).toBe(0);
    // watchedSeconds only ever accumulates a non-negative clamped delta.
    expect(res2.body.data.progress.watchedSeconds).toBe(60);
  });

  test('an absurd position at/above the completion threshold marks the lecture complete', async () => {
    const email = uniqueEmail('clamp-complete');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section, { durationSeconds: 100 });
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-clamp-complete' });

    const play = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    const sessionKey = play.body.data.sessionKey;

    const res = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: 99999, deltaSeconds: 30 });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.lastPositionSeconds).toBe(100); // clamped to duration
    expect(res.body.data.progress.isCompleted).toBe(true);
    expect(res.body.data.progress.completedAt).toBeTruthy();
  });

  // docs/08_TESTING_QA.md's "≥90% marks completed" row — the REAL configured
  // ratio is LECTURE_COMPLETE_THRESHOLD_RATIO=0.95 (config/constants.js), not
  // 90% (stale matrix wording — the row itself needs no edit since "≥[the
  // configured threshold]" is still accurate, just imprecise). The existing
  // "clamp-complete" test above only ever proves an extreme 100%-of-duration
  // position completes; these two prove the REAL boundary is exercised, not
  // just an extreme value that would pass under almost any reasonable ratio.
  test('boundary: a position one second short of the real completion threshold ratio does NOT mark the lecture complete', async () => {
    const email = uniqueEmail('threshold-below');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    // duration=100 makes the real threshold position an exact integer
    // (0.95 * 100 === 95 with no floating-point rounding surprise).
    const lecture = await createLecture(course, section, { durationSeconds: 100 });
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-threshold-below' });

    const play = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    const sessionKey = play.body.data.sessionKey;

    const belowThresholdPosition = LECTURE_COMPLETE_THRESHOLD_RATIO * lecture.durationSeconds - 1; // 94
    const res = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: belowThresholdPosition, deltaSeconds: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.lastPositionSeconds).toBe(belowThresholdPosition);
    expect(res.body.data.progress.isCompleted).toBe(false);
    expect(res.body.data.progress.completedAt).toBeFalsy();
  });

  test('boundary: a position exactly at the real completion threshold ratio DOES mark the lecture complete', async () => {
    const email = uniqueEmail('threshold-at');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section, { durationSeconds: 100 });
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-threshold-at' });

    const play = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    const sessionKey = play.body.data.sessionKey;

    const atThresholdPosition = LECTURE_COMPLETE_THRESHOLD_RATIO * lecture.durationSeconds; // 95
    const res = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: atThresholdPosition, deltaSeconds: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.lastPositionSeconds).toBe(atThresholdPosition);
    expect(res.body.data.progress.isCompleted).toBe(true);
    expect(res.body.data.progress.completedAt).toBeTruthy();
  });

  // docs/08_TESTING_QA.md's "study seconds accumulate" half — every existing
  // reference to UserDailyStat elsewhere in this suite is a pre-seeded
  // fixture row, never a genuine live side-effect of a real heartbeat call
  // (server/src/services/videoService.js's heartbeat() increments
  // `dailyStat.videoSeconds` by the same server-computed `effectiveDelta` the
  // response's `progress.watchedSeconds` reflects). `lastHeartbeatAt` is
  // backdated first (same idiom the "clamp" test above uses) so the
  // elapsed-wall-clock cross-check doesn't clip the claimed delta down to
  // near-zero for this immediate play->heartbeat call.
  test("a real heartbeat call genuinely increases today's UserDailyStat.videoSeconds by the credited delta", async () => {
    const email = uniqueEmail('dailystat-live');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section, { durationSeconds: 600 });
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-dailystat-live' });

    const play = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    const sessionKey = play.body.data.sessionKey;

    const before = await db.UserDailyStat.findOne({ where: { userId: user.id } });
    expect(before).toBeNull();

    await db.PlaybackSession.update(
      { lastHeartbeatAt: new Date(Date.now() - 20 * 1000) },
      { where: { sessionKey } }
    );

    const res = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: 15, deltaSeconds: 15 });
    expect(res.status).toBe(200);
    expect(res.body.data.progress.watchedSeconds).toBe(15);

    const after = await db.UserDailyStat.findOne({ where: { userId: user.id } });
    expect(after).not.toBeNull();
    expect(after.videoSeconds).toBe(15);

    // A second heartbeat call genuinely ACCUMULATES on top, not overwrites.
    await db.PlaybackSession.update(
      { lastHeartbeatAt: new Date(Date.now() - 20 * 1000) },
      { where: { sessionKey } }
    );
    const res2 = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: 25, deltaSeconds: 10 });
    expect(res2.status).toBe(200);

    const afterSecond = await db.UserDailyStat.findOne({ where: { userId: user.id } });
    expect(afterSecond.videoSeconds).toBe(25);
  });

  test('validation: heartbeat requires sessionKey/positionSeconds/deltaSeconds -> 422', async () => {
    const email = uniqueEmail('hb-validation');
    await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-hb-validation' });

    const res = await agent.put(`/api/v1/student/lectures/${lecture.id}/heartbeat`).send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('auth: heartbeat with no session at all -> 401 UNAUTHENTICATED', async () => {
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);

    const res = await request(app)
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey: 'does-not-matter', positionSeconds: 1, deltaSeconds: 1 });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('a well-formed but unknown sessionKey for a real logged-in student -> 404 NOT_FOUND', async () => {
    const email = uniqueEmail('hb-unknown-key');
    await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-hb-unknown-key' });

    const res = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey: '00000000-0000-4000-8000-000000000000', positionSeconds: 1, deltaSeconds: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
