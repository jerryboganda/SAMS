// server/tests/admin/students.test.js
// Admin students management (docs/07_EXECUTION_PLAN.md Phase 11.2,
// docs/04_API_SPEC.md §7 "Students"). Structure mirrors
// tests/admin/orders.test.js's established supertest style. The
// reset-devices block is THE Phase 11.2 acceptance criterion: "reset-devices
// logs audit + revokes tokens (test)".
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, User, UserDevice, RefreshToken, LoginEvent, Order, Enrollment, AuditLog } = db;

afterAll(async () => {
  await sequelize.close();
});

let deviceCounter = 0;
/** Creates an active user_devices row directly via the model layer (bypasses the real login flow — these tests exercise the ADMIN endpoints, not device registration itself). */
async function createTestDevice(userId, overrides = {}) {
  deviceCounter += 1;
  return UserDevice.create({
    userId,
    deviceTokenHash: overrides.deviceTokenHash || `test-device-token-hash-${deviceCounter}`.padEnd(64, '0'),
    fingerprintHash: overrides.fingerprintHash || `test-fingerprint-hash-${deviceCounter}`.padEnd(64, '0'),
    deviceName: overrides.deviceName || `Test Device ${deviceCounter}`,
    lastIp: overrides.lastIp || '203.0.113.1',
    lastSeenAt: overrides.lastSeenAt || new Date(),
    isActive: overrides.isActive ?? true,
  });
}

let tokenCounter = 0;
/** Creates a live (non-revoked) refresh_tokens row directly via the model layer. */
async function createTestRefreshToken(userId, overrides = {}) {
  tokenCounter += 1;
  return RefreshToken.create({
    userId,
    deviceId: overrides.deviceId ?? null,
    tokenHash: overrides.tokenHash || `test-refresh-token-hash-${Date.now()}-${tokenCounter}`.padEnd(64, '0').slice(0, 64),
    expiresAt: overrides.expiresAt || new Date(Date.now() + 30 * 86400000),
    revokedAt: overrides.revokedAt ?? null,
  });
}

let orderCounter = 0;
async function createTestOrder(user, course, overrides = {}) {
  orderCounter += 1;
  return Order.create({
    invoiceNo: overrides.invoiceNo || `INV-STU-TEST-${Date.now()}-${orderCounter}`,
    userId: user.id,
    courseId: course.id,
    amount: overrides.amount ?? 15000,
    discountAmount: overrides.discountAmount ?? 0,
    finalAmount: overrides.finalAmount ?? 15000,
    currency: overrides.currency ?? 'PKR',
    gateway: overrides.gateway ?? 'jazzcash',
    status: overrides.status ?? 'paid',
  });
}

async function createTestEnrollment(user, course, overrides = {}) {
  return Enrollment.create({
    userId: user.id,
    courseId: course.id,
    orderId: overrides.orderId ?? null,
    source: overrides.source || 'purchase',
    startsAt: overrides.startsAt || new Date(),
    expiresAt: overrides.expiresAt || new Date(Date.now() + 180 * 86400000),
    status: overrides.status || 'active',
  });
}

// ---------------------------------------------------------------------------
// GET /admin/students
// ---------------------------------------------------------------------------

describe('GET /api/v1/admin/students', () => {
  test('happy path: returns only students (never admins), newest-first', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student1 } = await createVerifiedUser({ email: uniqueEmail('roster-1'), role: 'student' });
    const { user: student2 } = await createVerifiedUser({ email: uniqueEmail('roster-2'), role: 'student' });
    const { user: otherAdmin } = await createVerifiedUser({ email: uniqueEmail('roster-admin'), role: 'admin' });

    const res = await agent.get('/api/v1/admin/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const ids = res.body.data.map((s) => s.id);
    expect(ids).toContain(student1.id);
    expect(ids).toContain(student2.id);
    expect(ids).not.toContain(otherAdmin.id);

    const idxFirst = ids.indexOf(student1.id);
    const idxSecond = ids.indexOf(student2.id);
    expect(idxSecond).toBeLessThan(idxFirst);
  });

  test('never leaks passwordHash/twofaSecret/twofaBackupCodes', async () => {
    const { agent } = await createAdminSession(app);
    await createVerifiedUser({ email: uniqueEmail('roster-secret'), role: 'student' });

    const res = await agent.get('/api/v1/admin/students');
    expect(res.status).toBe(200);
    for (const student of res.body.data) {
      expect(student.passwordHash).toBeUndefined();
      expect(student.twofaSecret).toBeUndefined();
      expect(student.twofaBackupCodes).toBeUndefined();
    }
  });

  test('auth failure: no session -> 401', async () => {
    const res = await request(app).get('/api/v1/admin/students');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/students');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// GET /admin/students/:id
// ---------------------------------------------------------------------------

describe('GET /api/v1/admin/students/:id', () => {
  test('happy path: returns the student profile', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('detail'), role: 'student', name: 'Detail Student' });

    const res = await agent.get(`/api/v1/admin/students/${student.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(student.id);
    expect(res.body.data.name).toBe('Detail Student');
    expect(res.body.data.email).toBe(student.email);
  });

  test('not found: unknown id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/students/9999999');
    expect(res.status).toBe(404);
  });

  test('not found: an admin id is never reachable via this student-only endpoint -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const { user: otherAdmin } = await createVerifiedUser({ email: uniqueEmail('not-a-student'), role: 'admin' });
    const res = await agent.get(`/api/v1/admin/students/${otherAdmin.id}`);
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('detail-401'), role: 'student' });
    const res = await request(app).get(`/api/v1/admin/students/${student.id}`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('detail-403'), role: 'student' });
    const res = await agent.get(`/api/v1/admin/students/${student.id}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/students/:id/status
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/admin/students/:id/status', () => {
  test('happy path: suspends a student and audit-logs the change', async () => {
    const { agent, user: admin } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('status'), role: 'student' });

    const res = await agent.patch(`/api/v1/admin/students/${student.id}/status`).send({ status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('suspended');

    const fresh = await User.findByPk(student.id);
    expect(fresh.status).toBe('suspended');

    const auditRow = await AuditLog.findOne({ where: { action: 'student.update_status', entityId: student.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(admin.id);
    expect(auditRow.summary).toMatch(/suspended/);
  });

  test('validation failure: invalid status value -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('status-invalid'), role: 'student' });

    const res = await agent.patch(`/api/v1/admin/students/${student.id}/status`).send({ status: 'banned' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('not found: unknown id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/students/9999999/status').send({ status: 'active' });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('status-401'), role: 'student' });
    const res = await request(app).patch(`/api/v1/admin/students/${student.id}/status`).send({ status: 'active' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('status-403'), role: 'student' });
    const res = await agent.patch(`/api/v1/admin/students/${student.id}/status`).send({ status: 'active' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/students/:id/devices
// ---------------------------------------------------------------------------

describe('GET /api/v1/admin/students/:id/devices', () => {
  test('happy path: lists the student devices, current-device always false for the admin viewer', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('devices'), role: 'student' });
    const device1 = await createTestDevice(student.id, { deviceName: 'iPhone 15' });
    await createTestDevice(student.id, { deviceName: 'Windows PC', isActive: false });

    const res = await agent.get(`/api/v1/admin/students/${student.id}/devices`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const active = res.body.data.find((d) => d.id === device1.id);
    expect(active.deviceName).toBe('iPhone 15');
    expect(active.isActive).toBe(true);
    expect(active.isCurrent).toBe(false);
  });

  test('not found: unknown student id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/students/9999999/devices');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('devices-401'), role: 'student' });
    const res = await request(app).get(`/api/v1/admin/students/${student.id}/devices`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('devices-403'), role: 'student' });
    const res = await agent.get(`/api/v1/admin/students/${student.id}/devices`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /admin/students/:id/reset-devices — THE Phase 11.2 acceptance criterion
// ---------------------------------------------------------------------------

describe('POST /api/v1/admin/students/:id/reset-devices', () => {
  test('AC: deactivates all devices, revokes all refresh tokens, and audit-logs the action', async () => {
    const { agent, user: admin } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('reset'), role: 'student' });

    const device1 = await createTestDevice(student.id);
    const device2 = await createTestDevice(student.id);
    const token1 = await createTestRefreshToken(student.id, { deviceId: device1.id });
    const token2 = await createTestRefreshToken(student.id, { deviceId: device2.id });

    const res = await agent.post(`/api/v1/admin/students/${student.id}/reset-devices`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(typeof res.body.data.message).toBe('string');

    const freshDevice1 = await UserDevice.findByPk(device1.id);
    const freshDevice2 = await UserDevice.findByPk(device2.id);
    expect(freshDevice1.isActive).toBe(false);
    expect(freshDevice2.isActive).toBe(false);

    const freshToken1 = await RefreshToken.findByPk(token1.id);
    const freshToken2 = await RefreshToken.findByPk(token2.id);
    expect(freshToken1.revokedAt).not.toBeNull();
    expect(freshToken2.revokedAt).not.toBeNull();

    const auditRow = await AuditLog.findOne({ where: { action: 'student.reset_devices', entityId: student.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(admin.id);
    expect(auditRow.entityType).toBe('User');
  });

  test('edge: an already-revoked token and an already-inactive device are left as-is (idempotent, no error)', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('reset-idempotent'), role: 'student' });
    const inactiveDevice = await createTestDevice(student.id, { isActive: false });
    const revokedToken = await createTestRefreshToken(student.id, { revokedAt: new Date('2026-01-01T00:00:00Z') });

    const res = await agent.post(`/api/v1/admin/students/${student.id}/reset-devices`);
    expect(res.status).toBe(200);

    const freshDevice = await UserDevice.findByPk(inactiveDevice.id);
    expect(freshDevice.isActive).toBe(false);

    const freshToken = await RefreshToken.findByPk(revokedToken.id);
    expect(freshToken.revokedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  test('does NOT touch session cookies (admin acting on a different user, not itself)', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('reset-cookies'), role: 'student' });

    const res = await agent.post(`/api/v1/admin/students/${student.id}/reset-devices`);
    expect(res.status).toBe(200);
    // No Set-Cookie clearing the admin's own session should be present.
    const setCookieHeader = res.headers['set-cookie'];
    if (setCookieHeader) {
      expect(setCookieHeader.join(';')).not.toMatch(/access_token=;|refresh_token=;/);
    }
  });

  test('not found: unknown student id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/students/9999999/reset-devices');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('reset-401'), role: 'student' });
    const res = await request(app).post(`/api/v1/admin/students/${student.id}/reset-devices`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('reset-403'), role: 'student' });
    const res = await agent.post(`/api/v1/admin/students/${student.id}/reset-devices`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/students/:id/login-events
// ---------------------------------------------------------------------------

describe('GET /api/v1/admin/students/:id/login-events', () => {
  test('happy path: rows round-trip as-is, including a suspicious-status row, newest-first', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('login-events'), role: 'student' });

    const successEvent = await LoginEvent.create({
      userId: student.id,
      emailTried: student.email,
      status: 'success',
      ip: '203.0.113.10',
      country: 'PK',
      userAgent: 'Mozilla/5.0 Test',
    });
    const suspiciousEvent = await LoginEvent.create({
      userId: student.id,
      emailTried: student.email,
      status: 'suspicious',
      reason: 'new_device,country_change',
      ip: '203.0.113.20',
      country: 'US',
      userAgent: 'Mozilla/5.0 Test 2',
    });

    const res = await agent.get(`/api/v1/admin/students/${student.id}/login-events`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].id).toBe(suspiciousEvent.id);
    expect(res.body.data[0].status).toBe('suspicious');
    expect(res.body.data[0].reason).toBe('new_device,country_change');
    expect(res.body.data[1].id).toBe(successEvent.id);
    expect(res.body.data[1].status).toBe('success');
  });

  test('not found: unknown student id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/students/9999999/login-events');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('login-events-401'), role: 'student' });
    const res = await request(app).get(`/api/v1/admin/students/${student.id}/login-events`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('login-events-403'), role: 'student' });
    const res = await agent.get(`/api/v1/admin/students/${student.id}/login-events`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/students/:id/orders
// ---------------------------------------------------------------------------

describe('GET /api/v1/admin/students/:id/orders', () => {
  test('happy path: only this student\'s orders, newest-first', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('orders-student'), role: 'student' });
    const { user: otherStudent } = await createVerifiedUser({ email: uniqueEmail('orders-other'), role: 'student' });
    const course = await createCourse();

    const order1 = await createTestOrder(student, course);
    const order2 = await createTestOrder(student, course);
    await createTestOrder(otherStudent, course);

    const res = await agent.get(`/api/v1/admin/students/${student.id}/orders`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.map((o) => o.id)).toEqual([order2.id, order1.id]);
    expect(res.body.data[0].courseTitle).toBe(course.title);
  });

  test('not found: unknown student id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/students/9999999/orders');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('orders-401'), role: 'student' });
    const res = await request(app).get(`/api/v1/admin/students/${student.id}/orders`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('orders-403'), role: 'student' });
    const res = await agent.get(`/api/v1/admin/students/${student.id}/orders`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/students/:id/enrollments
// ---------------------------------------------------------------------------

describe('GET /api/v1/admin/students/:id/enrollments', () => {
  test('happy path: every enrollment for this student, any status, with courseTitle', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('enroll-list'), role: 'student' });
    const course = await createCourse();
    const activeEnr = await createTestEnrollment(student, course, { status: 'active' });
    const expiredEnr = await createTestEnrollment(student, course, { status: 'expired', expiresAt: new Date(Date.now() - 86400000) });

    const res = await agent.get(`/api/v1/admin/students/${student.id}/enrollments`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((e) => e.id);
    expect(ids).toContain(activeEnr.id);
    expect(ids).toContain(expiredEnr.id);
    const activeRow = res.body.data.find((e) => e.id === activeEnr.id);
    expect(activeRow.courseTitle).toBe(course.title);
    expect(activeRow.status).toBe('active');
  });

  test('not found: unknown student id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/students/9999999/enrollments');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('enroll-list-401'), role: 'student' });
    const res = await request(app).get(`/api/v1/admin/students/${student.id}/enrollments`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('enroll-list-403'), role: 'student' });
    const res = await agent.get(`/api/v1/admin/students/${student.id}/enrollments`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /admin/students/:id/enrollments — manual grant
// ---------------------------------------------------------------------------

describe('POST /api/v1/admin/students/:id/enrollments', () => {
  test('happy path: grants a manual enrollment, audit-logged', async () => {
    const { agent, user: admin } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('grant'), role: 'student' });
    const course = await createCourse();

    const res = await agent.post(`/api/v1/admin/students/${student.id}/enrollments`).send({ courseId: course.id, days: 60 });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(student.id);
    expect(res.body.data.courseId).toBe(course.id);
    expect(res.body.data.source).toBe('manual');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.orderId).toBeUndefined();

    const daysMs = new Date(res.body.data.expiresAt).getTime() - new Date(res.body.data.startsAt).getTime();
    expect(Math.round(daysMs / 86400000)).toBe(60);

    const auditRow = await AuditLog.findOne({ where: { action: 'enrollment.grant', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(admin.id);
    expect(auditRow.summary).toMatch(/60-day/);
  });

  test('edge: re-granting after an existing active enrollment flips the old row to expired (unique-constraint-safe)', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('regrant'), role: 'student' });
    const course = await createCourse();

    const first = await createTestEnrollment(student, course, { status: 'active' });

    const res = await agent.post(`/api/v1/admin/students/${student.id}/enrollments`).send({ courseId: course.id, days: 30 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.id).not.toBe(first.id);

    const freshFirst = await Enrollment.findByPk(first.id);
    expect(freshFirst.status).toBe('expired');

    const all = await Enrollment.findAll({ where: { userId: student.id, courseId: course.id } });
    expect(all.length).toBe(2);
    expect(all.filter((e) => e.status === 'active').length).toBe(1);
  });

  test('not found: unknown course id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('grant-nocourse'), role: 'student' });
    const res = await agent.post(`/api/v1/admin/students/${student.id}/enrollments`).send({ courseId: 9999999, days: 30 });
    expect(res.status).toBe(404);
  });

  test('not found: unknown student id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const res = await agent.post('/api/v1/admin/students/9999999/enrollments').send({ courseId: course.id, days: 30 });
    expect(res.status).toBe(404);
  });

  test('validation failure: non-positive days -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('grant-baddays'), role: 'student' });
    const course = await createCourse();
    const res = await agent.post(`/api/v1/admin/students/${student.id}/enrollments`).send({ courseId: course.id, days: 0 });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('grant-401'), role: 'student' });
    const course = await createCourse();
    const res = await request(app).post(`/api/v1/admin/students/${student.id}/enrollments`).send({ courseId: course.id, days: 30 });
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('grant-403'), role: 'student' });
    const course = await createCourse();
    const res = await agent.post(`/api/v1/admin/students/${student.id}/enrollments`).send({ courseId: course.id, days: 30 });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/enrollments/:id — extend/revoke
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/admin/enrollments/:id', () => {
  test('happy path: extend pushes expiresAt forward from the CURRENT expiry, audit-logged', async () => {
    const { agent, user: admin } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('extend'), role: 'student' });
    const course = await createCourse();
    const originalExpiry = new Date(Date.now() + 10 * 86400000);
    const enrollment = await createTestEnrollment(student, course, { status: 'active', expiresAt: originalExpiry });

    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'extend', days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');

    const newExpiry = new Date(res.body.data.expiresAt);
    const expectedExpiry = new Date(originalExpiry.getTime() + 30 * 86400000);
    expect(Math.abs(newExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(2000);

    const auditRow = await AuditLog.findOne({ where: { action: 'enrollment.extend', entityId: enrollment.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(admin.id);
    expect(auditRow.entityType).toBe('Enrollment');
  });

  test('edge: extending an already-expired enrollment extends from NOW and reactivates status', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('extend-lapsed'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, {
      status: 'expired',
      expiresAt: new Date(Date.now() - 100 * 86400000),
    });

    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'extend', days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');

    const newExpiry = new Date(res.body.data.expiresAt);
    const expectedExpiry = new Date(Date.now() + 30 * 86400000);
    expect(Math.abs(newExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(5000);
  });

  test('edge: reactivating a lapsed enrollment flips a DIFFERENT currently-active row for the same (user, course) to expired', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('extend-conflict'), role: 'student' });
    const course = await createCourse();
    const lapsed = await createTestEnrollment(student, course, {
      status: 'expired',
      expiresAt: new Date(Date.now() - 100 * 86400000),
    });
    const currentlyActive = await createTestEnrollment(student, course, { status: 'active' });

    const res = await agent.patch(`/api/v1/admin/enrollments/${lapsed.id}`).send({ action: 'extend', days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');

    const freshOtherActive = await Enrollment.findByPk(currentlyActive.id);
    expect(freshOtherActive.status).toBe('expired');
  });

  test('happy path: revoke sets status to revoked (distinct from expired), audit-logged', async () => {
    const { agent, user: admin } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('revoke'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, { status: 'active' });

    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'revoke' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('revoked');

    const fresh = await Enrollment.findByPk(enrollment.id);
    expect(fresh.status).toBe('revoked');

    const auditRow = await AuditLog.findOne({ where: { action: 'enrollment.revoke', entityId: enrollment.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(admin.id);
  });

  test('edge: extending an already-revoked enrollment -> 409', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('extend-revoked'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, { status: 'revoked' });

    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'extend', days: 30 });
    expect(res.status).toBe(409);
  });

  test('edge: revoking an already-revoked enrollment -> 409', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('revoke-revoked'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, { status: 'revoked' });

    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'revoke' });
    expect(res.status).toBe(409);
  });

  test('validation failure: unknown action -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('bad-action'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, { status: 'active' });

    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'delete' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation failure: extend without days -> 422', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('extend-nodays'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, { status: 'active' });

    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'extend' });
    expect(res.status).toBe(422);
  });

  test('not found: unknown enrollment id -> 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/enrollments/9999999').send({ action: 'revoke' });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session -> 401', async () => {
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('enr-401'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, { status: 'active' });
    const res = await request(app).patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'revoke' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('enr-403'), role: 'student' });
    const course = await createCourse();
    const enrollment = await createTestEnrollment(student, course, { status: 'active' });
    const res = await agent.patch(`/api/v1/admin/enrollments/${enrollment.id}`).send({ action: 'revoke' });
    expect(res.status).toBe(403);
  });
});
