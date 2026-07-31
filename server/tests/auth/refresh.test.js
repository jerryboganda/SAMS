// server/tests/auth/refresh.test.js
// POST /auth/refresh: rotation + reuse-detection-revokes-family
// (docs/04_API_SPEC.md §1, task 2.2).
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify, getCookieValue } from '../helpers/loginFlow.js';

const { sequelize } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/auth/refresh', () => {
  test('happy path: rotates the refresh token and re-issues an access token', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('refresh-happy') });
    const { agent, reverifyRes } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'RefreshDevice/1.0' });

    const before = getCookieValue(reverifyRes, 'refresh_token');
    expect(before).not.toBeNull();

    const res = await agent.post('/api/v1/auth/refresh');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);

    const after = getCookieValue(res, 'refresh_token');
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  test('auth failure: no refresh cookie → 401 UNAUTHENTICATED', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('edge: unknown refresh token value → 401 UNAUTHENTICATED', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', 'refresh_token=' + 'f'.repeat(128));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('edge: reuse of an already-rotated-away-from token revokes the whole family, including the currently-valid token', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('refresh-reuse') });
    const { agent, reverifyRes } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'ReuseDevice/1.0' });

    const oldRefresh = getCookieValue(reverifyRes, 'refresh_token');

    const rotateRes = await agent.post('/api/v1/auth/refresh');
    expect(rotateRes.status).toBe(200);
    const newRefresh = getCookieValue(rotateRes, 'refresh_token');
    expect(newRefresh).not.toBe(oldRefresh);

    // Replay the OLD (already rotated-away-from) token — this is the
    // "stolen/replayed token" signal.
    const replayRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${oldRefresh}`);
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe('UNAUTHENTICATED');

    // The entire family — including the token that WAS still valid a moment
    // ago — must now be revoked too, forcing full re-login.
    const afterFamilyRevokeRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${newRefresh}`);
    expect(afterFamilyRevokeRes.status).toBe(401);
    expect(afterFamilyRevokeRes.body.error.code).toBe('UNAUTHENTICATED');
  });
});
