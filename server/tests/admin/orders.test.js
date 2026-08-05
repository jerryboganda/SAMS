// server/tests/admin/orders.test.js
// Admin orders management (docs/07_EXECUTION_PLAN.md Phase 9.8,
// docs/04_API_SPEC.md §7 "Orders"). Structure mirrors
// tests/admin/courses.test.js's established supertest style; the mark-paid
// happy-path assertions mirror tests/checkout/mockFlow.e2e.test.js's own
// "enrollment + invoice + notification" e2e checks, since mark-paid reuses
// the SAME shared payment-success path.
import fs from 'node:fs';
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { INVOICES_DIR } from '../../src/services/invoiceService.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, Order, PaymentEvent, Enrollment, Notification, AuditLog } = db;

afterAll(async () => {
  await sequelize.close();
});

let orderCounter = 0;
/** Creates an order row directly via the model layer (bypasses the real checkout flow — these tests exercise the ADMIN endpoints, not order creation itself). */
async function createTestOrder(overrides = {}) {
  orderCounter += 1;
  const user = overrides.user || (await createVerifiedUser({ email: uniqueEmail('order-owner') })).user;
  const course = overrides.course || (await createCourse());
  const order = await Order.create({
    invoiceNo: overrides.invoiceNo || `INV-TEST-${Date.now()}-${orderCounter}`,
    userId: user.id,
    courseId: course.id,
    amount: overrides.amount ?? 15000,
    discountAmount: overrides.discountAmount ?? 0,
    finalAmount: overrides.finalAmount ?? 15000,
    currency: overrides.currency ?? 'PKR',
    gateway: overrides.gateway ?? 'jazzcash',
    status: overrides.status ?? 'pending',
  });
  return { order, user, course };
}

describe('GET /api/v1/admin/orders', () => {
  test('happy path: returns ALL orders across statuses/gateways, no server-side filtering', async () => {
    const { agent } = await createAdminSession(app);
    const { order: pendingOrder } = await createTestOrder({ status: 'pending', gateway: 'jazzcash' });
    const { order: paidOrder } = await createTestOrder({ status: 'paid', gateway: 'bank_transfer' });
    const { order: refundedOrder } = await createTestOrder({ status: 'refunded', gateway: 'easypaisa' });

    const res = await agent.get('/api/v1/admin/orders');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const byId = new Map(res.body.data.map((o) => [o.id, o]));
    expect(byId.get(pendingOrder.id).status).toBe('pending');
    expect(byId.get(pendingOrder.id).gateway).toBe('jazzcash');
    expect(byId.get(paidOrder.id).status).toBe('paid');
    expect(byId.get(paidOrder.id).gateway).toBe('bank_transfer');
    expect(byId.get(refundedOrder.id).status).toBe('refunded');
    expect(byId.get(refundedOrder.id).gateway).toBe('easypaisa');
  });

  test('newest-first ordering', async () => {
    const { agent } = await createAdminSession(app);
    const { order: first } = await createTestOrder();
    const { order: second } = await createTestOrder();

    const res = await agent.get('/api/v1/admin/orders');
    const idxFirst = res.body.data.findIndex((o) => o.id === first.id);
    const idxSecond = res.body.data.findIndex((o) => o.id === second.id);
    expect(idxSecond).toBeLessThan(idxFirst);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/orders');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/orders');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/v1/admin/orders/:id', () => {
  test('happy path: admin can view any order regardless of owner (no IDOR check)', async () => {
    const { agent } = await createAdminSession(app);
    const { order, user, course } = await createTestOrder();

    const res = await agent.get(`/api/v1/admin/orders/${order.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(order.id);
    expect(res.body.data.userId).toBe(user.id);
    expect(res.body.data.userEmail).toBe(user.email);
    expect(res.body.data.courseId).toBe(course.id);
    expect(res.body.data.courseTitle).toBe(course.title);
    expect(res.body.data.invoiceNo).toBe(order.invoiceNo);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/orders/9999999');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const { order } = await createTestOrder();
    const res = await request(app).get(`/api/v1/admin/orders/${order.id}`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const { order } = await createTestOrder();
    const res = await agent.get(`/api/v1/admin/orders/${order.id}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/orders/:id/payment-events', () => {
  test('happy path: chronological (oldest-first) timeline', async () => {
    const { agent } = await createAdminSession(app);
    const { order } = await createTestOrder();
    const first = await PaymentEvent.create({
      orderId: order.id,
      gateway: 'jazzcash',
      eventType: 'payment.initiated',
      externalRef: 'ext-1',
      payload: { step: 1 },
      signatureValid: false,
    });
    const second = await PaymentEvent.create({
      orderId: order.id,
      gateway: 'jazzcash',
      eventType: 'payment.success',
      externalRef: 'ext-2',
      payload: { step: 2 },
      signatureValid: true,
    });

    const res = await agent.get(`/api/v1/admin/orders/${order.id}/payment-events`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.id)).toEqual([first.id, second.id]);
    expect(res.body.data[0].orderId).toBe(order.id);
    expect(res.body.data[0].signatureValid).toBe(false);
    expect(res.body.data[1].eventType).toBe('payment.success');
    expect(res.body.data[1].signatureValid).toBe(true);
    expect(res.body.data[1].payload).toMatchObject({ step: 2 });
  });

  test('not found: unknown order id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/orders/9999999/payment-events');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const { order } = await createTestOrder();
    const res = await request(app).get(`/api/v1/admin/orders/${order.id}/payment-events`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const { order } = await createTestOrder();
    const res = await agent.get(`/api/v1/admin/orders/${order.id}/payment-events`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/orders/:id/mark-paid', () => {
  test('happy path: order->paid, real enrollment, real invoice PDF, real notification, audit logged', async () => {
    const { agent, user: admin } = await createAdminSession(app);
    const { order, user, course } = await createTestOrder({ status: 'pending', gateway: 'bank_transfer' });

    const res = await agent
      .post(`/api/v1/admin/orders/${order.id}/mark-paid`)
      .send({ reason: 'Bank transfer verified via phone call with branch manager.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');
    expect(res.body.data.gateway).toBe('manual');
    expect(res.body.data.paidAt).toBeTruthy();

    const paidOrder = await Order.findByPk(order.id);
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.gateway).toBe('manual');
    expect(paidOrder.paidAt).not.toBeNull();

    const enrollment = await Enrollment.findOne({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('active');
    expect(enrollment.source).toBe('purchase');

    const invoicePath = `${INVOICES_DIR}/${paidOrder.invoiceNo}.pdf`;
    expect(fs.existsSync(invoicePath)).toBe(true);

    const notification = await Notification.findOne({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(notification).not.toBeNull();

    const auditRow = await AuditLog.findOne({ where: { action: 'order.mark_paid', entityId: order.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(admin.id);
    expect(auditRow.summary).toMatch(/Bank transfer verified/);
  });

  test('edge: mark-paid on an already-paid order → 409', async () => {
    const { agent } = await createAdminSession(app);
    const { order } = await createTestOrder({ status: 'paid' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/mark-paid`).send({ reason: 'Should not work.' });
    expect(res.status).toBe(409);
  });

  test('edge: mark-paid on a failed order → 409', async () => {
    const { agent } = await createAdminSession(app);
    const { order } = await createTestOrder({ status: 'failed' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/mark-paid`).send({ reason: 'Should not work.' });
    expect(res.status).toBe(409);
  });

  test('validation failure: missing reason → 422', async () => {
    const { agent } = await createAdminSession(app);
    const { order } = await createTestOrder({ status: 'pending' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/mark-paid`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation failure: whitespace-only reason → 422', async () => {
    const { agent } = await createAdminSession(app);
    const { order } = await createTestOrder({ status: 'pending' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/mark-paid`).send({ reason: '   ' });
    expect(res.status).toBe(422);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/orders/9999999/mark-paid').send({ reason: 'x' });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const { order } = await createTestOrder({ status: 'pending' });
    const res = await request(app).post(`/api/v1/admin/orders/${order.id}/mark-paid`).send({ reason: 'x' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const { order } = await createTestOrder({ status: 'pending' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/mark-paid`).send({ reason: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/orders/:id/refund-flag', () => {
  test('happy path: paid order -> refunded, enrollment left untouched (judgment call), audit logged', async () => {
    const { agent, user: admin } = await createAdminSession(app);
    const { order, user, course } = await createTestOrder({ status: 'paid' });
    const enrollment = await Enrollment.create({
      userId: user.id,
      courseId: course.id,
      orderId: order.id,
      source: 'purchase',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 180 * 86400000),
      status: 'active',
    });

    const res = await agent
      .post(`/api/v1/admin/orders/${order.id}/refund-flag`)
      .send({ reason: 'Candidate requested refund per policy.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('refunded');

    const refundedOrder = await Order.findByPk(order.id);
    expect(refundedOrder.status).toBe('refunded');

    // Judgment call (DECISIONS.md 2026-08-05): refund-flag does NOT auto-revoke the enrollment.
    const stillActiveEnrollment = await Enrollment.findByPk(enrollment.id);
    expect(stillActiveEnrollment.status).toBe('active');

    const auditRow = await AuditLog.findOne({ where: { action: 'order.refund_flag', entityId: order.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(admin.id);
    expect(auditRow.summary).toMatch(/Candidate requested refund/);
  });

  test('edge: refund-flag on a non-paid order → 409', async () => {
    const { agent } = await createAdminSession(app);
    const { order } = await createTestOrder({ status: 'pending' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/refund-flag`).send({ reason: 'x' });
    expect(res.status).toBe(409);
  });

  test('validation failure: missing reason → 422', async () => {
    const { agent } = await createAdminSession(app);
    const { order } = await createTestOrder({ status: 'paid' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/refund-flag`).send({});
    expect(res.status).toBe(422);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/orders/9999999/refund-flag').send({ reason: 'x' });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const { order } = await createTestOrder({ status: 'paid' });
    const res = await request(app).post(`/api/v1/admin/orders/${order.id}/refund-flag`).send({ reason: 'x' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const { order } = await createTestOrder({ status: 'paid' });
    const res = await agent.post(`/api/v1/admin/orders/${order.id}/refund-flag`).send({ reason: 'x' });
    expect(res.status).toBe(403);
  });
});
