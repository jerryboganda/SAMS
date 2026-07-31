// server/tests/auth/requireRole.test.js
// requireRole middleware (task 2.7) — Phase 2 has no real /admin routes yet
// (Phase 4+), so this mounts a throwaway route on an isolated Express app,
// composed from the real `auth` + `requireRole` middleware, to prove the
// 403-for-wrong-role / 200-for-right-role / 401-for-unauthenticated behavior
// end-to-end without touching production route files.
import { afterAll, describe, expect, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { auth } from '../../src/middleware/auth.js';
import { requireRole } from '../../src/middleware/requireRole.js';
import errorHandler from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/utils/jwt.js';
import db from '../../src/models/index.js';

const { sequelize } = db;

function buildThrowawayApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/test/admin-only', auth, requireRole('admin'), (req, res) => {
    res.status(200).json({ success: true, data: { ok: true, role: req.user.role } });
  });
  app.use(errorHandler);
  return app;
}

afterAll(async () => {
  await sequelize.close();
});

describe('requireRole middleware (throwaway test route)', () => {
  const testApp = buildThrowawayApp();

  test('happy path: an admin-role token is allowed through → 200', async () => {
    const adminToken = signAccessToken({ id: 1, role: 'admin' });
    const res = await request(testApp).get('/test/admin-only').set('Cookie', `access_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  test('edge: a student-role token is rejected → 403 FORBIDDEN', async () => {
    const studentToken = signAccessToken({ id: 2, role: 'student' });
    const res = await request(testApp).get('/test/admin-only').set('Cookie', `access_token=${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('auth failure: no token at all → 401 UNAUTHENTICATED', async () => {
    const res = await request(testApp).get('/test/admin-only');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
