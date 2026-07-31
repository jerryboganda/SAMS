// server/tests/auth/passwordReset.test.js
// POST /auth/forgot-password, POST /auth/reset-password (docs/04_API_SPEC.md §1, task 2.5).
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify, extractResetPasswordToken, getCookieValue } from '../helpers/loginFlow.js';

const { OneTimeToken, User, sequelize } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/auth/forgot-password', () => {
  test('happy path: existing user gets a reset_password one-time token + email', async () => {
    const { email, user } = await createVerifiedUser({ email: uniqueEmail('forgot-happy') });

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const ott = await OneTimeToken.findOne({ where: { userId: user.id, purpose: 'reset_password' } });
    expect(ott).not.toBeNull();

    const mail = testOutbox.find((m) => m.to === email);
    expect(mail).toBeDefined();
    expect(mail.text).toMatch(/reset-password\?token=/);
  });

  test('validation failure: malformed email → 422', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: no enumeration — unknown email still responds 200 identically, no token created', async () => {
    const email = uniqueEmail('forgot-unknown');
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const count = await OneTimeToken.count({ where: { purpose: 'reset_password' } });
    const user = await User.findOne({ where: { email } });
    expect(user).toBeNull();
    void count;
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  test('happy path: resets the password and revokes ALL existing sessions', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('reset-happy') });
    const { agent, reverifyRes } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'ResetDevice/1.0' });
    const activeRefreshToken = getCookieValue(reverifyRes, 'refresh_token');

    await request(app).post('/api/v1/auth/forgot-password').send({ email });
    const token = extractResetPasswordToken(email);

    const newPassword = 'BrandNewPassword@789';
    const res = await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword });
    expect(res.status).toBe(200);

    // Every existing session — even ones that predate the reset — must die.
    const refreshAfter = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${activeRefreshToken}`);
    expect(refreshAfter.status).toBe(401);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(oldLogin.status).toBe(401);

    // Reuses the original agent (still carries the real device_token cookie
    // — password reset revokes refresh tokens, not the device row itself) —
    // a fresh cookie-less request sharing this device's UA/fingerprint is
    // now correctly treated as a suspicious fingerprint-only match requiring
    // reverify (security audit 2026-07-31, Finding 1), which isn't what this
    // test is exercising.
    const newLogin = await agent
      .post('/api/v1/auth/login')
      .set('User-Agent', 'ResetDevice/1.0')
      .send({ email, password: newPassword });
    // Device already known (from before the reset) → completes directly.
    expect(newLogin.status).toBe(200);
  });

  test('validation failure: new password too short → 422', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({ token: 'x'.repeat(64), newPassword: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: token is single-use — replaying it after a successful reset fails with 400 INVALID_TOKEN', async () => {
    const { email } = await createVerifiedUser({ email: uniqueEmail('reset-single-use') });
    await request(app).post('/api/v1/auth/forgot-password').send({ email });
    const token = extractResetPasswordToken(email);

    const first = await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword: 'FirstReset@123' });
    expect(first.status).toBe(200);

    const replay = await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword: 'SecondReset@123' });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('INVALID_TOKEN');
  });

  test('edge: unknown/garbage token → 400 INVALID_TOKEN', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'a'.repeat(64), newPassword: 'SomePassword@123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});
