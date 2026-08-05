// server/tests/checkout/idempotentReplay.test.js
// docs/04_API_SPEC.md §8: "Idempotency: payment success path keyed on
// (gateway, external_ref) — replayed IPNs are no-ops." docs/07_EXECUTION_PLAN.md
// 9.2 AC: "fire the same successful callback twice, assert only one
// enrollment/one notification/one coupon-increment".
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createCoupon } from '../helpers/checkoutFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Order, Enrollment, Notification, PaymentEvent, Coupon } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('A replayed successful gateway callback is a safe no-op', () => {
  test('calling the exact same GET /checkout/return/mock twice: order paid once, exactly 1 enrollment, exactly 1 notification, coupon incremented exactly once', async () => {
    const email = uniqueEmail('idempotent-replay');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-idempotent-replay' });
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ type: 'fixed', value: 1000, maxUses: 5, usedCount: 0 });

    const orderRes = await agent
      .post('/api/v1/checkout/orders')
      .send({ courseId: course.id, couponCode: coupon.code, gateway: 'mock' });
    expect(orderRes.status).toBe(201);
    const { order, redirectUrl } = orderRes.body.data;
    const returnPath = `/api/v1/checkout/return/mock${new URL(redirectUrl).search}`;

    // First callback: real success path runs.
    const firstReturn = await agent.get(returnPath);
    expect(firstReturn.status).toBe(302);

    const paidOnce = await Order.findByPk(order.id);
    expect(paidOnce.status).toBe('paid');
    const paidAtFirst = paidOnce.paidAt.getTime();

    // Second, IDENTICAL callback (same orderId+token) — must be a no-op.
    const secondReturn = await agent.get(returnPath);
    expect(secondReturn.status).toBe(302); // still redirects gracefully, no error surfaced

    const paidTwice = await Order.findByPk(order.id);
    expect(paidTwice.status).toBe('paid');
    expect(paidTwice.paidAt.getTime()).toBe(paidAtFirst); // unchanged — the update never re-ran

    const enrollments = await Enrollment.findAll({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
    expect(enrollments.length).toBe(1);

    const notifications = await Notification.findAll({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(notifications.length).toBe(1);

    const reloadedCoupon = await Coupon.findByPk(coupon.id);
    expect(reloadedCoupon.usedCount).toBe(1); // incremented exactly once, not twice

    // Every callback IS still logged (audit trail) — 2 rows, both verified —
    // even though only the first one drove any side effects.
    const events = await PaymentEvent.findAll({ where: { orderId: order.id, gateway: 'mock', eventType: 'payment.success' } });
    expect(events.length).toBe(2);
    expect(events.every((e) => e.signatureValid === true)).toBe(true);
  });
});
