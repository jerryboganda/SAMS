// server/tests/student/video/play.test.js
// GET /api/v1/student/lectures/:id/play (docs/04_API_SPEC.md §3,
// docs/07_EXECUTION_PLAN.md 5.2) — enrollment gating, free-preview
// anonymous/authenticated access, and resumeAtSeconds.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import db from '../../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../../helpers/publicFixtures.js';
import { createActiveEnrollment, createExpiredEnrollment } from '../../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../../helpers/loginFlow.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

async function courseWithLecture(overrides = {}) {
  const course = await createCourse({ isPublished: true });
  const section = await createSection(course);
  const lecture = await createLecture(course, section, { durationSeconds: 600, ...overrides });
  return { course, section, lecture };
}

describe('GET /api/v1/student/lectures/:id/play', () => {
  test('happy path: enrolled student gets a signed playback config + real watermark + sessionKey', async () => {
    const email = uniqueEmail('play-happy');
    const { user } = await createVerifiedUser({ email, name: 'Happy Student' });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-play-happy' });
    const { course, lecture } = await courseWithLecture();
    await createActiveEnrollment(user, course);

    const res = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.playback.type).toBe('video'); // mock adapter 'mp4' -> client 'video'
    expect(data.playback.url).toBeTruthy();
    expect(data.playback.expiresAt).toBeTruthy();
    expect(data.watermark.name).toBe('Happy Student');
    expect(data.watermark.email).toBe(email);
    expect(data.watermark.timestamp).toBeTruthy();
    expect(data.resumeAtSeconds).toBe(0);
    expect(typeof data.sessionKey).toBe('string');
    expect(data.sessionKey.length).toBeGreaterThan(0);
  });

  test('not enrolled at all -> 403 NOT_ENROLLED', async () => {
    const email = uniqueEmail('play-notenrolled');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-play-notenrolled' });
    const { lecture } = await courseWithLecture();

    const res = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  test('enrollment exists but is expired -> 403 ENROLLMENT_EXPIRED (distinct from NOT_ENROLLED)', async () => {
    const email = uniqueEmail('play-expired');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-play-expired' });
    const { course, lecture } = await courseWithLecture();
    await createExpiredEnrollment(user, course);

    const res = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ENROLLMENT_EXPIRED');
    expect(res.body.error.code).not.toBe('NOT_ENROLLED');
  });

  test('non-preview lecture with no auth at all -> 401 UNAUTHENTICATED', async () => {
    const { lecture } = await courseWithLecture();

    const res = await request(app).get(`/api/v1/student/lectures/${lecture.id}/play`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('free-preview lecture is playable with zero auth, and watermark is the literal "PREVIEW" marker', async () => {
    const { lecture } = await courseWithLecture({ isFreePreview: true });

    const res = await request(app).get(`/api/v1/student/lectures/${lecture.id}/play`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.watermark.name).toBe('PREVIEW');
    expect(res.body.data.watermark.email).toBe('PREVIEW');
    expect(res.body.data.resumeAtSeconds).toBe(0);
    expect(typeof res.body.data.sessionKey).toBe('string');
  });

  test('free-preview lecture works with no enrollment check even for an authenticated, non-enrolled student', async () => {
    const email = uniqueEmail('play-preview-auth');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-play-preview-auth' });
    const { lecture } = await courseWithLecture({ isFreePreview: true });

    const res = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);

    expect(res.status).toBe(200);
    // Authenticated (not anonymous) preview viewer gets the real watermark,
    // not the generic "PREVIEW" marker — see DECISIONS.md.
    expect(res.body.data.watermark.name).not.toBe('PREVIEW');
  });

  test('nonexistent lecture id -> 404 NOT_FOUND (no auth required to observe this)', async () => {
    const res = await request(app).get('/api/v1/student/lectures/999999999/play');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('unpublished lecture -> 404 NOT_FOUND (does not leak existence, even to the enrolled owner)', async () => {
    const email = uniqueEmail('play-unpublished');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-play-unpublished' });
    const { course, lecture } = await courseWithLecture({ isPublished: false });
    await createActiveEnrollment(user, course);

    const res = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('validation: a non-numeric lecture id is rejected with 422 before hitting the DB', async () => {
    const res = await request(app).get('/api/v1/student/lectures/not-a-number/play');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('resumeAtSeconds reflects a prior heartbeat-saved position on a fresh /play call', async () => {
    const email = uniqueEmail('play-resume');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-play-resume' });
    const { course, lecture } = await courseWithLecture({ durationSeconds: 600 });
    await createActiveEnrollment(user, course);

    const firstPlay = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    expect(firstPlay.status).toBe(200);
    const sessionKey = firstPlay.body.data.sessionKey;

    const hb = await agent
      .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
      .send({ sessionKey, positionSeconds: 123, deltaSeconds: 15 });
    expect(hb.status).toBe(200);

    const secondPlay = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
    expect(secondPlay.status).toBe(200);
    expect(secondPlay.body.data.resumeAtSeconds).toBe(123);
  });
});
