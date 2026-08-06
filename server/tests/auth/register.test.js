// server/tests/auth/register.test.js
// POST /auth/register, /auth/verify-email, /auth/resend-verification
// (docs/04_API_SPEC.md §1, task 2.1).
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { extractVerifyEmailToken } from '../helpers/loginFlow.js';

const { User, OneTimeToken, sequelize } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/auth/register', () => {
  test('happy path: creates a pending user, a verify_email token, and emails the raw link', async () => {
    const email = uniqueEmail('register');

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ada Lovelace', email, password: DEFAULT_TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/verification/i);

    const user = await User.findOne({ where: { email } });
    expect(user).not.toBeNull();
    expect(user.status).toBe('pending');
    expect(user.passwordHash).not.toBe(DEFAULT_TEST_PASSWORD);

    const ott = await OneTimeToken.findOne({ where: { userId: user.id, purpose: 'verify_email' } });
    expect(ott).not.toBeNull();
    expect(ott.usedAt).toBeNull();

    const mail = testOutbox.find((m) => m.to === email);
    expect(mail).toBeDefined();
    expect(mail.text).toMatch(/verify-email\?token=/);
  });

  test('validation failure: missing password → 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'No Password', email: uniqueEmail('register-invalid') });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // docs/08_TESTING_QA.md's "weak password 422" row — the real, actual rule
  // (server/src/controllers/authController.js's `passwordField`) is a plain
  // `z.string().min(8).max(72)`, no complexity requirement beyond length. A
  // *present-but-short* password (7 chars, one under the minimum) must be
  // rejected exactly like a missing one — previously only the missing-field
  // case above was ever exercised.
  test('validation failure: weak (too-short) password → 422 VALIDATION_ERROR, and no user is created', async () => {
    const email = uniqueEmail('register-weakpw');

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Weak Password', email, password: 'short1' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const user = await User.findOne({ where: { email } });
    expect(user).toBeNull();
  });

  test('edge: duplicate email responds identically (no user enumeration) and does not create a second user', async () => {
    const email = uniqueEmail('register-dupe');
    const firstRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'First', email, password: DEFAULT_TEST_PASSWORD });
    expect(firstRes.status).toBe(201);

    const secondRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Second Attempt', email, password: DEFAULT_TEST_PASSWORD });

    // Identical shape/status to the first (genuinely new) registration — an
    // attacker cannot distinguish "already registered" from "just registered".
    expect(secondRes.status).toBe(firstRes.status);
    expect(secondRes.body.success).toBe(true);
    expect(secondRes.body.data.message).toBe(firstRes.body.data.message);

    const count = await User.count({ where: { email } });
    expect(count).toBe(1);
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  test('happy path: valid token activates the user', async () => {
    const email = uniqueEmail('verify');
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Verify Me', email, password: DEFAULT_TEST_PASSWORD });

    const token = extractVerifyEmailToken(email);

    const res = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ where: { email } });
    expect(user.status).toBe('active');
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  test('validation failure: missing token → 422', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: token is single-use — replaying it after success fails with 400 INVALID_TOKEN', async () => {
    const email = uniqueEmail('verify-single-use');
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Single Use', email, password: DEFAULT_TEST_PASSWORD });

    const token = extractVerifyEmailToken(email);

    const first = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(first.status).toBe(200);

    const replay = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('INVALID_TOKEN');
  });

  test('edge: unknown/garbage token → 400 INVALID_TOKEN', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({ token: 'a'.repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('POST /api/v1/auth/resend-verification', () => {
  test('happy path: pending user gets a fresh verification email', async () => {
    const email = uniqueEmail('resend');
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Resend Me', email, password: DEFAULT_TEST_PASSWORD });
    testOutbox.length = 0;

    const res = await request(app).post('/api/v1/auth/resend-verification').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const mail = testOutbox.find((m) => m.to === email);
    expect(mail).toBeDefined();

    const ottCount = await OneTimeToken.count({
      where: { purpose: 'verify_email', userId: (await User.findOne({ where: { email } })).id },
    });
    expect(ottCount).toBe(2); // one from register, one from resend
  });

  test('validation failure: invalid email format → 422', async () => {
    const res = await request(app).post('/api/v1/auth/resend-verification').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('edge: no enumeration — unknown email still responds 200 with the identical message shape', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: uniqueEmail('never-registered') });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/pending account exists/i);
  });
});
