// server/tests/auth/twofa.test.js
// POST /auth/2fa/setup, /auth/2fa/enable, /auth/2fa/disable + the login-time
// 2FA gate (docs/04_API_SPEC.md §1, task 2.6).
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { authenticator } from 'otplib';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { AuditLog, sequelize } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

/** Sets up + enables 2FA on a fresh verified user/device, returning the raw secret + backup codes. */
async function setUpEnabledTwofaUser(emailPrefix) {
  const { email, password } = await createVerifiedUser({ email: uniqueEmail(emailPrefix) });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: `${emailPrefix}-device/1.0` });

  const setupRes = await agent.post('/api/v1/auth/2fa/setup');
  expect(setupRes.status).toBe(200);
  const { secret } = setupRes.body.data;

  const code = authenticator.generate(secret);
  const enableRes = await agent.post('/api/v1/auth/2fa/enable').send({ code });
  expect(enableRes.status).toBe(200);

  return { email, password, agent, secret, backupCodes: enableRes.body.data.backupCodes };
}

describe('POST /api/v1/auth/2fa/setup', () => {
  test('happy path: returns a pending secret + otpauth QR', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('2fa-setup') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'SetupDevice/1.0' });

    const res = await agent.post('/api/v1/auth/2fa/setup');
    expect(res.status).toBe(200);
    expect(res.body.data.secret).toMatch(/^[A-Z2-7]+$/); // base32
    expect(res.body.data.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  });

  test('auth failure: no session cookies → 401', async () => {
    const res = await request(app).post('/api/v1/auth/2fa/setup');
    expect(res.status).toBe(401);
  });

  test('edge: already-enabled 2FA → 409 CONFLICT', async () => {
    const { agent } = await setUpEnabledTwofaUser('2fa-setup-conflict');
    const res = await agent.post('/api/v1/auth/2fa/setup');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /api/v1/auth/2fa/enable', () => {
  test('happy path: flips twofaEnabled on and returns backup codes once', async () => {
    const { email, agent, backupCodes } = await setUpEnabledTwofaUser('2fa-enable');
    expect(backupCodes).toHaveLength(10);

    const db2 = await import('../../src/models/index.js');
    const user = await db2.default.User.findOne({ where: { email } });
    expect(user.twofaEnabled).toBe(true);
    // Backup codes are hashed at rest, never stored raw.
    expect(user.twofaBackupCodes.every((h) => !backupCodes.includes(h))).toBe(true);

    void agent; // agent already exercised inside the helper
  });

  test('validation failure: code too short → 422', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('2fa-enable-invalid') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'EnableInvalid/1.0' });
    await agent.post('/api/v1/auth/2fa/setup');

    const res = await agent.post('/api/v1/auth/2fa/enable').send({ code: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: wrong TOTP code → 400 INVALID_2FA_CODE', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('2fa-enable-wrong') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'EnableWrong/1.0' });
    await agent.post('/api/v1/auth/2fa/setup');

    const res = await agent.post('/api/v1/auth/2fa/enable').send({ code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_2FA_CODE');
  });
});

describe('login with 2FA enabled', () => {
  test('edge: missing 2FA code on an otherwise-valid login → 401 TWOFA_REQUIRED', async () => {
    const { email, password } = await setUpEnabledTwofaUser('2fa-login-required');

    const res = await request(app).post('/api/v1/auth/login').set('User-Agent', '2fa-login-required-device/1.0').send({ email, password });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TWOFA_REQUIRED');
  });

  test('happy path: valid TOTP code completes the login', async () => {
    const { email, password, secret, agent } = await setUpEnabledTwofaUser('2fa-login-happy');

    // Reuse the already-authenticated agent (carries the real device_token
    // cookie from setup) — a fresh cookie-less request sharing this device's
    // UA/fingerprint is now correctly treated as a suspicious fingerprint-
    // only match requiring reverify (security audit 2026-07-31, Finding 1),
    // which isn't what this test is exercising.
    const code = authenticator.generate(secret);
    const res = await agent
      .post('/api/v1/auth/login')
      .set('User-Agent', '2fa-login-happy-device/1.0')
      .send({ email, password, twofaCode: code });
    expect(res.status).toBe(200);
  });

  test('edge: a backup code is single-use as a 2nd factor', async () => {
    const { email, password, agent, backupCodes } = await setUpEnabledTwofaUser('2fa-login-backup');
    const backupCode = backupCodes[0];

    // Reuse the already-authenticated agent (carries the real device_token
    // cookie from setup) rather than a fresh cookie-less request — a
    // cookie-less request sharing this device's UA/fingerprint is now
    // correctly treated as a suspicious fingerprint-only match requiring
    // reverify (security audit 2026-07-31, Finding 1), which isn't what this
    // test is exercising.
    const first = await agent
      .post('/api/v1/auth/login')
      .set('User-Agent', '2fa-login-backup-device/1.0')
      .send({ email, password, twofaCode: backupCode });
    expect(first.status).toBe(200);

    const second = await agent
      .post('/api/v1/auth/login')
      .set('User-Agent', '2fa-login-backup-device/1.0')
      .send({ email, password, twofaCode: backupCode });
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('TWOFA_INVALID');
  });
});

describe('POST /api/v1/auth/2fa/disable', () => {
  test('happy path: disables 2FA with a valid TOTP code and writes an audit_logs row', async () => {
    const { email, agent, secret } = await setUpEnabledTwofaUser('2fa-disable');

    const code = authenticator.generate(secret);
    const res = await agent.post('/api/v1/auth/2fa/disable').send({ code });
    expect(res.status).toBe(200);

    const db2 = await import('../../src/models/index.js');
    const user = await db2.default.User.findOne({ where: { email } });
    expect(user.twofaEnabled).toBe(false);
    expect(user.twofaSecret).toBeNull();

    const auditRow = await AuditLog.findOne({ where: { action: 'user.2fa_disable' }, order: [['id', 'DESC']] });
    expect(auditRow).not.toBeNull();
  });

  test('happy path: disables 2FA with a valid backup code', async () => {
    const { agent, backupCodes } = await setUpEnabledTwofaUser('2fa-disable-backup');
    const res = await agent.post('/api/v1/auth/2fa/disable').send({ backupCode: backupCodes[1] });
    expect(res.status).toBe(200);
  });

  test('validation failure: neither code nor backupCode provided → 422', async () => {
    const { agent } = await setUpEnabledTwofaUser('2fa-disable-invalid');
    const res = await agent.post('/api/v1/auth/2fa/disable').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: wrong code → 400 INVALID_2FA_CODE', async () => {
    const { agent } = await setUpEnabledTwofaUser('2fa-disable-wrong');
    const res = await agent.post('/api/v1/auth/2fa/disable').send({ code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_2FA_CODE');
  });

  test('auth failure: no session cookies → 401', async () => {
    const res = await request(app).post('/api/v1/auth/2fa/disable').send({ code: '123456' });
    expect(res.status).toBe(401);
  });
});
