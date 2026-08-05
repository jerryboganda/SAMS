// server/tests/admin/coupons.test.js
// Admin coupons CRUD (docs/07_EXECUTION_PLAN.md Phase 9.8,
// docs/04_API_SPEC.md §7 "Coupons"). Structure/rigor mirrors
// tests/admin/courses.test.js's established supertest style (including its
// audit_logs assertion pattern for every mutation).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, AuditLog, Coupon, Order } = db;

afterAll(async () => {
  await sequelize.close();
});

let codeCounter = 0;
function uniqueCode(prefix = 'TEST') {
  codeCounter += 1;
  return `${prefix}${Date.now()}${codeCounter}`.slice(0, 40);
}

describe('GET /api/v1/admin/coupons', () => {
  test('happy path: lists coupons with courseTitle joined when courseId is set', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const withCourse = await Coupon.create({ code: uniqueCode('WC'), type: 'percent', value: 10, courseId: course.id, isActive: true });
    const generic = await Coupon.create({ code: uniqueCode('GEN'), type: 'fixed', value: 500, isActive: true });

    const res = await agent.get('/api/v1/admin/coupons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const byId = new Map(res.body.data.map((c) => [c.id, c]));
    expect(byId.get(withCourse.id).courseTitle).toBe(course.title);
    expect(byId.get(withCourse.id).courseId).toBe(course.id);
    expect(byId.get(generic.id).courseId).toBeUndefined();
    expect(byId.get(generic.id).usedCount).toBe(0);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/coupons');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/coupons');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/coupons', () => {
  test('happy path: creates a percent coupon and writes an audit_logs row', async () => {
    const { agent, user } = await createAdminSession(app);
    const code = uniqueCode('NEW');
    const res = await agent.post('/api/v1/admin/coupons').send({ code, type: 'percent', value: 15, maxUses: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(code);
    expect(res.body.data.type).toBe('percent');
    expect(res.body.data.value).toBe(15);
    expect(res.body.data.maxUses).toBe(100);
    expect(res.body.data.usedCount).toBe(0);
    expect(res.body.data.isActive).toBe(true);

    const auditRow = await AuditLog.findOne({ where: { action: 'coupon.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('happy path: creates a fixed coupon scoped to a course', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const code = uniqueCode('FIX');
    const res = await agent.post('/api/v1/admin/coupons').send({ code, type: 'fixed', value: 2000, courseId: course.id });
    expect(res.status).toBe(201);
    expect(res.body.data.courseId).toBe(course.id);
    expect(res.body.data.courseTitle).toBe(course.title);
  });

  test('conflict: duplicate code → 409', async () => {
    const { agent } = await createAdminSession(app);
    const code = uniqueCode('DUP');
    const first = await agent.post('/api/v1/admin/coupons').send({ code, type: 'percent', value: 10 });
    expect(first.status).toBe(201);

    const second = await agent.post('/api/v1/admin/coupons').send({ code, type: 'fixed', value: 500 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  test('validation failure: invalid type → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/coupons').send({ code: uniqueCode('BAD'), type: 'bogus', value: 10 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation failure: negative value → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/coupons').send({ code: uniqueCode('NEG'), type: 'fixed', value: -50 });
    expect(res.status).toBe(422);
  });

  test('validation failure: percent value over 100 → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/coupons').send({ code: uniqueCode('OVER'), type: 'percent', value: 150 });
    expect(res.status).toBe(422);
  });

  test('validation failure: courseId referencing a nonexistent course → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent
      .post('/api/v1/admin/coupons')
      .send({ code: uniqueCode('NOCOURSE'), type: 'percent', value: 10, courseId: 9999999 });
    expect(res.status).toBe(422);
  });

  test('validation failure: validFrom after validUntil → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/coupons').send({
      code: uniqueCode('DATES'),
      type: 'percent',
      value: 10,
      validFrom: '2027-01-01T00:00:00.000Z',
      validUntil: '2026-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/coupons').send({ code: uniqueCode('NOAUTH'), type: 'percent', value: 10 });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/coupons').send({ code: uniqueCode('STU'), type: 'percent', value: 10 });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/coupons/:id', () => {
  test('happy path: partial update (value only) and audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('UPD'), type: 'percent', value: 10, isActive: true });

    const res = await agent.patch(`/api/v1/admin/coupons/${coupon.id}`).send({ value: 25 });
    expect(res.status).toBe(200);
    expect(res.body.data.value).toBe(25);

    const auditRow = await AuditLog.findOne({ where: { action: 'coupon.update', entityId: coupon.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('edge: rejects value>100 on an existing percent coupon even when the patch omits `type`', async () => {
    const { agent } = await createAdminSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('EXPCT'), type: 'percent', value: 10, isActive: true });
    const res = await agent.patch(`/api/v1/admin/coupons/${coupon.id}`).send({ value: 150 });
    expect(res.status).toBe(422);
  });

  test('conflict: renaming to an already-used code → 409', async () => {
    const { agent } = await createAdminSession(app);
    const existing = await Coupon.create({ code: uniqueCode('TAKEN'), type: 'percent', value: 10, isActive: true });
    const target = await Coupon.create({ code: uniqueCode('RENAME'), type: 'percent', value: 10, isActive: true });

    const res = await agent.patch(`/api/v1/admin/coupons/${target.id}`).send({ code: existing.code });
    expect(res.status).toBe(409);
  });

  test('validation failure: empty body → 422', async () => {
    const { agent } = await createAdminSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('EMPTY'), type: 'percent', value: 10, isActive: true });
    const res = await agent.patch(`/api/v1/admin/coupons/${coupon.id}`).send({});
    expect(res.status).toBe(422);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/coupons/9999999').send({ value: 5 });
    expect(res.status).toBe(404);
  });

  test('edge: usedCount is never writable via the request body (server-controlled only)', async () => {
    const { agent } = await createAdminSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('USEDCT'), type: 'percent', value: 10, usedCount: 3, isActive: true });
    const res = await agent.patch(`/api/v1/admin/coupons/${coupon.id}`).send({ value: 20, usedCount: 999 });
    expect(res.status).toBe(200);
    expect(res.body.data.usedCount).toBe(3);
  });

  test('auth failure: no session → 401', async () => {
    const coupon = await Coupon.create({ code: uniqueCode('AUTH'), type: 'percent', value: 10, isActive: true });
    const res = await request(app).patch(`/api/v1/admin/coupons/${coupon.id}`).send({ value: 5 });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('ROLE'), type: 'percent', value: 10, isActive: true });
    const res = await agent.patch(`/api/v1/admin/coupons/${coupon.id}`).send({ value: 5 });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/coupons/:id', () => {
  test('happy path: deletes a coupon and audit logs it', async () => {
    const { agent, user } = await createAdminSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('DEL'), type: 'percent', value: 10, isActive: true });

    const res = await agent.delete(`/api/v1/admin/coupons/${coupon.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const stillThere = await Coupon.findByPk(coupon.id);
    expect(stillThere).toBeNull();

    const auditRow = await AuditLog.findOne({ where: { action: 'coupon.delete', entityId: coupon.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('edge: a coupon already referenced by an existing order is still hard-deletable (orders.coupon_id ON DELETE SET NULL)', async () => {
    const { agent } = await createAdminSession(app);
    const course = await createCourse();
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('coupon-order-owner') });
    const coupon = await Coupon.create({ code: uniqueCode('REF'), type: 'percent', value: 10, usedCount: 1, isActive: true });
    const order = await Order.create({
      invoiceNo: `INV-COUPON-DEL-${Date.now()}`,
      userId: student.id,
      courseId: course.id,
      amount: 10000,
      discountAmount: 1000,
      finalAmount: 9000,
      gateway: 'jazzcash',
      status: 'paid',
      couponId: coupon.id,
    });

    const res = await agent.delete(`/api/v1/admin/coupons/${coupon.id}`);
    expect(res.status).toBe(200);

    const orderAfter = await Order.findByPk(order.id);
    expect(orderAfter.couponId).toBeNull();
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.delete('/api/v1/admin/coupons/9999999');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const coupon = await Coupon.create({ code: uniqueCode('NOAUTH2'), type: 'percent', value: 10, isActive: true });
    const res = await request(app).delete(`/api/v1/admin/coupons/${coupon.id}`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('NOROLE'), type: 'percent', value: 10, isActive: true });
    const res = await agent.delete(`/api/v1/admin/coupons/${coupon.id}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/coupons/:id/toggle', () => {
  test('happy path: flips isActive both directions, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('TOG'), type: 'percent', value: 10, isActive: true });

    const res = await agent.post(`/api/v1/admin/coupons/${coupon.id}/toggle`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const second = await agent.post(`/api/v1/admin/coupons/${coupon.id}/toggle`);
    expect(second.status).toBe(200);
    expect(second.body.data.isActive).toBe(true);

    const auditRow = await AuditLog.findOne({ where: { action: 'coupon.toggle', entityId: coupon.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/coupons/9999999/toggle');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const coupon = await Coupon.create({ code: uniqueCode('TOGAUTH'), type: 'percent', value: 10, isActive: true });
    const res = await request(app).post(`/api/v1/admin/coupons/${coupon.id}/toggle`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const coupon = await Coupon.create({ code: uniqueCode('TOGROLE'), type: 'percent', value: 10, isActive: true });
    const res = await agent.post(`/api/v1/admin/coupons/${coupon.id}/toggle`);
    expect(res.status).toBe(403);
  });
});
