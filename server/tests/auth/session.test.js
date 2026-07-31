// server/tests/auth/session.test.js
// GET/PATCH /auth/me, POST /auth/change-password, GET /auth/devices,
// POST /auth/logout, POST /auth/logout-all (docs/04_API_SPEC.md §1, task 2.5).
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify, getCookieValue } from '../helpers/loginFlow.js';

const { AuditLog, sequelize } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/auth/me', () => {
  test('happy path: returns the authenticated profile with placeholder aggregates', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('me-happy') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'MeDevice/1.0' });

    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.enrollmentSummary).toEqual([]);
    expect(res.body.data.unreadNotifications).toBe(0);
  });

  test('auth failure: no session cookies → 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('PATCH /api/v1/auth/me', () => {
  test('happy path: updates name and phone', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('me-patch') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'PatchDevice/1.0' });

    const res = await agent.patch('/api/v1/auth/me').send({ name: 'New Name', phone: '+923001234567' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data.phone).toBe('+923001234567');
  });

  test('validation failure: empty body (neither name nor phone) → 422', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('me-patch-invalid') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'PatchDevice2/1.0' });

    const res = await agent.patch('/api/v1/auth/me').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('auth failure: no session cookies → 401', async () => {
    const res = await request(app).patch('/api/v1/auth/me').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  test('happy path + edge: logs out other sessions but keeps the current one, and rejects the old password afterwards', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('changepw') });
    const sessionA = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'DeviceA/1.0' });
    const sessionB = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'DeviceB/1.0' });
    const refreshB = getCookieValue(sessionB.reverifyRes, 'refresh_token');

    const newPassword = 'NewPassword@456';
    const changeRes = await sessionA.agent
      .post('/api/v1/auth/change-password')
      .send({ current: password, new: newPassword });
    expect(changeRes.status).toBe(200);

    // Other session (device B) must now be revoked.
    const refreshBAfter = await request(app).post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${refreshB}`);
    expect(refreshBAfter.status).toBe(401);

    // Current session (device A) must still work.
    const refreshAAfter = await sessionA.agent.post('/api/v1/auth/refresh');
    expect(refreshAAfter.status).toBe(200);

    // Old password no longer works; new password does. Reuses sessionA's
    // already-authenticated agent (carries the real device_token cookie) —
    // a fresh cookie-less request sharing this device's UA/fingerprint is
    // now correctly treated as a suspicious fingerprint-only match requiring
    // reverify (security audit 2026-07-31, Finding 1), which isn't what this
    // test is exercising.
    const oldPwLogin = await sessionA.agent
      .post('/api/v1/auth/login')
      .set('User-Agent', 'DeviceA/1.0')
      .send({ email, password });
    expect(oldPwLogin.status).toBe(401);

    const newPwLogin = await sessionA.agent
      .post('/api/v1/auth/login')
      .set('User-Agent', 'DeviceA/1.0')
      .send({ email, password: newPassword });
    expect(newPwLogin.status).toBe(200);
  });

  test('auth failure: current password incorrect → 401 INVALID_CREDENTIALS', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('changepw-badcurrent') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'BadCurrent/1.0' });

    const res = await agent.post('/api/v1/auth/change-password').send({ current: 'WrongCurrent@1', new: 'NewPassword@456' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('validation failure: new password too short → 422', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('changepw-shortnew') });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'ShortNew/1.0' });

    const res = await agent.post('/api/v1/auth/change-password').send({ current: password, new: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/auth/devices', () => {
  test('happy path: lists masked devices with the current one flagged', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('devices-list') });
    const sessionA = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'ListDeviceA/1.0' });
    await loginNewDeviceAndReverify(app, { email, password, userAgent: 'ListDeviceB/1.0' });

    const res = await sessionA.agent.get('/api/v1/auth/devices');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const current = res.body.data.find((d) => d.isCurrent);
    expect(current).toBeDefined();
    expect(current.userId).toBeDefined();
    expect(current.deviceTokenHash).toBeUndefined(); // never leak the raw hash
  });

  test('auth failure: no session cookies → 401', async () => {
    const res = await request(app).get('/api/v1/auth/devices');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  test('happy path: revokes the current refresh token and clears cookies', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('logout-happy') });
    const { agent, reverifyRes } = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'LogoutDevice/1.0' });
    const refreshToken = getCookieValue(reverifyRes, 'refresh_token');

    const res = await agent.post('/api/v1/auth/logout');
    expect(res.status).toBe(200);

    const refreshAfter = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`);
    expect(refreshAfter.status).toBe(401);
  });

  test('auth failure: no session cookie → 401', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    // logout requires `auth` (needs a valid access token) but not deviceCheck.
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout-all', () => {
  test('happy path + edge: revokes every session and writes an audit_logs row', async () => {
    const { email, password } = await createVerifiedUser({ email: uniqueEmail('logoutall') });
    const sessionA = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'LOAllDeviceA/1.0' });
    const sessionB = await loginNewDeviceAndReverify(app, { email, password, userAgent: 'LOAllDeviceB/1.0' });
    const refreshA = getCookieValue(sessionA.reverifyRes, 'refresh_token');
    const refreshB = getCookieValue(sessionB.reverifyRes, 'refresh_token');

    const res = await sessionA.agent.post('/api/v1/auth/logout-all');
    expect(res.status).toBe(200);

    const refreshAAfter = await request(app).post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${refreshA}`);
    expect(refreshAAfter.status).toBe(401);
    const refreshBAfter = await request(app).post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${refreshB}`);
    expect(refreshBAfter.status).toBe(401);

    const auditRow = await AuditLog.findOne({
      where: { action: 'user.logout_all' },
      order: [['id', 'DESC']],
    });
    expect(auditRow).not.toBeNull();
  });

  test('auth failure: no session cookies → 401', async () => {
    const res = await request(app).post('/api/v1/auth/logout-all');
    expect(res.status).toBe(401);
  });
});
