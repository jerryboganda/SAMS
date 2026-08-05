// server/tests/checkout/couponRedemptionRace.test.js
// docs/07_EXECUTION_PLAN.md 9.2 AC: "coupon-redemption race safety
// (concurrent orders using a coupon with max_uses=1, assert only one
// succeeds — this prefigures 9.9's fuller race test but the underlying lock
// needs to exist now)". Exercises orderService.js's completeOrderPayment()
// row-locked coupon re-check under REAL concurrency (Promise.all, not
// sequential awaits) — same rigor as
// tests/student/video/streamLockConcurrency.test.js.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createCoupon } from '../helpers/checkoutFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Order, Enrollment, Coupon } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('Concurrent successful payments racing to redeem a max_uses=1 coupon', () => {
  test('exactly one order is completed (paid + enrolled); the coupon is redeemed exactly once', async () => {
    const coupon = await createCoupon({ type: 'fixed', value: 500, courseId: null, maxUses: 1, usedCount: 0 });

    // Two DIFFERENT users + courses so the only thing genuinely contended is
    // the shared coupon row — nothing about ALREADY_ENROLLED or per-order
    // locking should interfere with this test's actual subject.
    const emailA = uniqueEmail('coupon-race-a');
    const emailB = uniqueEmail('coupon-race-b');
    await createVerifiedUser({ email: emailA });
    await createVerifiedUser({ email: emailB });
    const { agent: agentA } = await loginNewDeviceAndReverify(app, { email: emailA, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coupon-race-a' });
    const { agent: agentB } = await loginNewDeviceAndReverify(app, { email: emailB, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-coupon-race-b' });
    const courseA = await createCourse({ price: 5000 });
    const courseB = await createCourse({ price: 5000 });

    const orderResA = await agentA.post('/api/v1/checkout/orders').send({ courseId: courseA.id, couponCode: coupon.code, gateway: 'mock' });
    const orderResB = await agentB.post('/api/v1/checkout/orders').send({ courseId: courseB.id, couponCode: coupon.code, gateway: 'mock' });
    expect(orderResA.status).toBe(201);
    expect(orderResB.status).toBe(201);

    // GET /checkout/return/:gateway is role P (no auth needed) — a plain
    // (unauthenticated) request is exactly what a real gateway's browser
    // bounce-back would look like anyway.
    const returnPathA = `/api/v1/checkout/return/mock${new URL(orderResA.body.data.redirectUrl).search}`;
    const returnPathB = `/api/v1/checkout/return/mock${new URL(orderResB.body.data.redirectUrl).search}`;

    // The critical part: both fire together (both promises created before
    // either is awaited), not one after another.
    const [resA, resB] = await Promise.all([request(app).get(returnPathA), request(app).get(returnPathB)]);

    // Both return requests still get a graceful redirect either way — a
    // losing coupon race must never surface as a raw error to the browser.
    expect(resA.status).toBe(302);
    expect(resB.status).toBe(302);

    const [finalOrderA, finalOrderB] = await Promise.all([Order.findByPk(orderResA.body.data.order.id), Order.findByPk(orderResB.body.data.order.id)]);
    const statuses = [finalOrderA.status, finalOrderB.status];

    // Exactly one succeeded.
    expect(statuses.filter((s) => s === 'paid').length).toBe(1);
    // The loser was never marked paid — it's simply left as it was (still
    // 'pending'), NOT silently paid-and-unenrolled or corrupted.
    expect(statuses.filter((s) => s === 'pending').length).toBe(1);

    const reloadedCoupon = await Coupon.findByPk(coupon.id);
    expect(reloadedCoupon.usedCount).toBe(1); // redeemed exactly once, never 2

    const enrollments = await Enrollment.findAll({ where: { orderId: [finalOrderA.id, finalOrderB.id] } });
    expect(enrollments.length).toBe(1); // only the winner got enrolled
  }, 30000);
});
