// server/tests/auth/login.test.js
// POST /auth/login, POST /auth/reverify (docs/04_API_SPEC.md §1, tasks 2.2-2.4).
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify, extractReverifyCode, getCookieValue } from '../helpers/loginFlow.js';

const { sequelize } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/auth/login', () => {
  test('happy path: a second login from an already-registered device completes directly with cookies', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('login-happy') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'HappyDevice/1.0' });

    const res = await agent.post('/api/v1/auth/login').set('User-Agent', 'HappyDevice/1.0').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);

    const setCookie = res.headers['set-cookie'].join(';');
    expect(setCookie).toMatch(/access_token=/);
    expect(setCookie).toMatch(/refresh_token=/);
  });

  test('auth failure: wrong password → 401 INVALID_CREDENTIALS', async () => {
    const { email } = await createVerifiedUser({ email: uniqueEmail('login-badpw') });

    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'WrongPassword@1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  // Security audit 2026-07-31, Finding 2: the "no such user" branch now pays
  // the same bcrypt cost as "wrong password" (services/authService.js's
  // LOGIN_TIMING_PLACEHOLDER_HASH) so response latency can't be used to
  // enumerate registered emails. This is a functional-correctness check only
  // (both branches return the identical 401 INVALID_CREDENTIALS) — asserting
  // on wall-clock timing here would be flaky/pointless in a unit test.
  test('auth failure: nonexistent email → 401 INVALID_CREDENTIALS, same code as wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('login-no-such-user'), password: 'WrongPassword@1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('validation failure: missing email → 422 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ password: DEFAULT_TEST_PASSWORD });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: unverified account → 403 EMAIL_NOT_VERIFIED', async () => {
    const email = uniqueEmail('login-unverified');
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Unverified', email, password: DEFAULT_TEST_PASSWORD });

    const res = await request(app).post('/api/v1/auth/login').send({ email, password: DEFAULT_TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('edge: a brand-new device is always suspicious → 401 REVERIFY_REQUIRED, and a code is emailed', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('login-newdevice') });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'NeverSeenBefore/1.0')
      .send({ email, password });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REVERIFY_REQUIRED');
    expect(() => extractReverifyCode(email)).not.toThrow();
  });

  test('edge: account lockout after 6 failed attempts within the window → 423 ACCOUNT_LOCKED even with the correct password', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('login-lockout') });

    // Sequential on purpose: each attempt writes a login_events row the next
    // attempt's lockout count depends on, so they can't run concurrently.
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'WrongPassword@1' });
      expect(res.status).toBe(401);
    }

    const lockedRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  test('edge: 3rd genuinely new device is rejected with 423 DEVICE_LIMIT_REACHED while the first 2 devices keep working', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('login-devicecap') });

    const deviceA = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'DeviceA/1.0' });
    const deviceB = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'DeviceB/1.0' });

    const thirdRes = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'DeviceC/1.0')
      .send({ email, password });
    expect(thirdRes.status).toBe(423);
    expect(thirdRes.body.error.code).toBe('DEVICE_LIMIT_REACHED');

    const stillA = await deviceA.agent.post('/api/v1/auth/login').set('User-Agent', 'DeviceA/1.0').send({ email, password });
    expect(stillA.status).toBe(200);

    const stillB = await deviceB.agent.post('/api/v1/auth/login').set('User-Agent', 'DeviceB/1.0').send({ email, password });
    expect(stillB.status).toBe(200);
  });

  // Security audit 2026-07-31, Finding 1 (HIGH): two logins presenting no
  // device_token cookie at all, but an IDENTICAL User-Agent (=> identical
  // fingerprint, since Accept-Language is unset on both) — simulating either
  // a cleared cookie OR two genuinely different machines colliding on a
  // common UA/OS/locale combo. Both must go through the suspicious-login
  // reverify gate (no silent share), and completing the second one must
  // revoke the first session's refresh token (slot takeover), leaving
  // exactly one active user_devices row for the pair.
  test('edge: two cookie-less logins with an identical UA fingerprint → second takes over the slot, revoking the first session', async () => {
    const { user, email, password } = await createVerifiedUser({ email: uniqueEmail('login-fpcollision') });

    const first = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'IdenticalFingerprint/1.0' });
    expect(first.reverifyRes.status).toBe(200);
    const firstRefreshToken = getCookieValue(first.reverifyRes, 'refresh_token');
    expect(firstRefreshToken).not.toBeNull();

    // Second "machine": a brand-new agent (no cookies carried over at all),
    // same User-Agent string. loginNewDeviceAndReverify itself asserts the
    // login step returns 401 REVERIFY_REQUIRED — proving the suspicious-login
    // gate fires for this fingerprint-only match, not a silent slot share.
    const second = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'IdenticalFingerprint/1.0' });
    expect(second.reverifyRes.status).toBe(200);
    expect(second.reverifyRes.body.success).toBe(true);

    // The FIRST session's refresh token must now be revoked.
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${firstRefreshToken}`);
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe('UNAUTHENTICATED');

    // Exactly one active user_devices row exists for this slot — reused via
    // takeover, not duplicated into a second row.
    const activeDeviceCount = await db.UserDevice.count({ where: { userId: user.id, isActive: true } });
    expect(activeDeviceCount).toBe(1);
  });
});

describe('POST /api/v1/auth/reverify', () => {
  test('happy path: completes the login and issues session cookies', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('reverify-happy') });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'ReverifyDevice/1.0')
      .send({ email, password });
    expect(loginRes.status).toBe(401);
    expect(loginRes.body.error.code).toBe('REVERIFY_REQUIRED');

    const code = extractReverifyCode(email);
    const res = await request(app).post('/api/v1/auth/reverify').send({ email, code });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.headers['set-cookie'].join(';')).toMatch(/device_token=/);
  });

  test('validation failure: missing code → 422', async () => {
    const res = await request(app).post('/api/v1/auth/reverify').send({ email: uniqueEmail('reverify-invalid') });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: wrong code → 400 INVALID_CODE and does not complete the login', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('reverify-wrongcode') });
    await request(app).post('/api/v1/auth/login').set('User-Agent', 'X/1.0').send({ email, password });

    const res = await request(app).post('/api/v1/auth/reverify').send({ email, code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CODE');
  });

  // Security audit 2026-07-31, Finding 3 (Medium): reverify now has its own
  // account-keyed lockout (REVERIFY_FAIL_THRESHOLD=5 within
  // REVERIFY_LOCKOUT_WINDOW_MINUTES=15), independent of the per-IP
  // authLimiter an attacker could evade by rotating source IPs. Proves
  // repeated wrong codes eventually get rejected/locked rather than being
  // infinitely retryable — even the CORRECT code is rejected once locked.
  test('edge: 5 wrong reverify codes within the window lock the account, even the correct code, until it clears', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('reverify-lockout') });
    await request(app).post('/api/v1/auth/login').set('User-Agent', 'LockoutDevice/1.0').send({ email, password });

    // Sequential on purpose: each attempt writes a login_events row the next
    // attempt's lockout count depends on.
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/v1/auth/reverify').send({ email, code: '000000' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CODE');
    }

    const code = extractReverifyCode(email);
    const lockedRes = await request(app).post('/api/v1/auth/reverify').send({ email, code });
    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});
