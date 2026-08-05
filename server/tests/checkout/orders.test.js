// server/tests/checkout/orders.test.js
// POST /checkout/orders (docs/04_API_SPEC.md §5, docs/07_EXECUTION_PLAN.md
// 9.2 AC minus the e2e/concurrency ACs, which have their own dedicated
// files — see mockFlow.e2e.test.js, invoiceNoConcurrency.test.js).
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createCoupon } from '../helpers/checkoutFixtures.js';
import { createActiveEnrollment, createExpiredEnrollment } from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentSession(prefix) {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return { agent, user };
}

describe('POST /api/v1/checkout/orders', () => {
  test('creates a pending order whose amounts EXACTLY match POST /checkout/quote for the same inputs (no coupon)', async () => {
    const { agent } = await studentSession('order-noCoupon');
    const course = await createCourse({ price: 15000 });

    const quoteRes = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id });
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data.order;
    expect(order.amount).toBe(quoteRes.body.data.originalPrice);
    expect(order.discountAmount).toBe(quoteRes.body.data.discountAmount);
    expect(order.finalAmount).toBe(quoteRes.body.data.finalAmount);
    expect(order.status).toBe('pending');
    expect(order.invoiceNo).toMatch(/^SAMS-\d{4}-\d{5}$/);
    expect(orderRes.body.data.redirectUrl).toContain('/checkout/return/mock');
  });

  test('creates a pending order whose amounts EXACTLY match POST /checkout/quote for the same inputs (with a percent coupon)', async () => {
    const { agent } = await studentSession('order-withCoupon');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ type: 'percent', value: 15 });

    const quoteRes = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, couponCode: coupon.code, gateway: 'mock' });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data.order;
    expect(order.amount).toBe(quoteRes.body.data.originalPrice);
    expect(order.discountAmount).toBe(quoteRes.body.data.discountAmount);
    expect(order.finalAmount).toBe(quoteRes.body.data.finalAmount);
    expect(order.couponCode).toBe(coupon.code);
  });

  test('409 ALREADY_ENROLLED when the user has a CURRENT active enrollment for the course', async () => {
    const { agent, user } = await studentSession('order-alreadyEnrolled');
    const course = await createCourse({ price: 15000 });
    await createActiveEnrollment(user, course);

    const res = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ENROLLED');
  });

  test('an EXPIRED enrollment does NOT block repurchase (only a currently-active one does)', async () => {
    const { agent, user } = await studentSession('order-expiredEnrollment');
    const course = await createCourse({ price: 15000 });
    await createExpiredEnrollment(user, course);

    const res = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });

    expect(res.status).toBe(201);
  });

  test('422 GATEWAY_NOT_CONFIGURED for a gateway with no registered driver yet (jazzcash — 9.3 follow-up task)', async () => {
    const { agent } = await studentSession('order-gatewayNotConfigured');
    const course = await createCourse({ price: 15000 });

    const res = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'jazzcash' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('GATEWAY_NOT_CONFIGURED');
  });

  test('422 GATEWAY_NOT_CONFIGURED for a PLACEHOLDER gateway (payfast — 9.5b follow-up task)', async () => {
    const { agent } = await studentSession('order-placeholderGateway');
    const course = await createCourse({ price: 15000 });

    const res = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'payfast' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('GATEWAY_NOT_CONFIGURED');
  });

  test('404 NOT_FOUND for a nonexistent/unpublished course', async () => {
    const { agent } = await studentSession('order-noCourse');
    const res = await agent.post('/api/v1/checkout/orders').send({ courseId: 999999999, gateway: 'mock' });
    expect(res.status).toBe(404);
  });

  test('401 without authentication', async () => {
    const request = (await import('supertest')).default;
    const course = await createCourse({ price: 15000 });
    const res = await request(app).post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
    expect(res.status).toBe(401);
  });
});
