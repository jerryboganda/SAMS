// server/tests/checkout/quote.test.js
// POST /checkout/quote (docs/04_API_SPEC.md §5, docs/07_EXECUTION_PLAN.md
// 9.1 AC: "tests per code; percent vs fixed math; expiry windows").
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createCoupon } from '../helpers/checkoutFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentAgent(prefix) {
  const email = uniqueEmail(prefix);
  await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return agent;
}

describe('POST /api/v1/checkout/quote', () => {
  test('no coupon: discount=0, final=price', async () => {
    const agent = await studentAgent('quote-none');
    const course = await createCourse({ price: 15000 });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ courseId: course.id, originalPrice: 15000, discountAmount: 0, finalAmount: 15000, currency: 'PKR' });
  });

  test('percent coupon: discount = round(price * value/100, 2)', async () => {
    const agent = await studentAgent('quote-percent');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ type: 'percent', value: 10 });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ originalPrice: 15000, discountAmount: 1500, finalAmount: 13500, couponCode: coupon.code });
  });

  test('fixed coupon: discount = min(value, price)', async () => {
    const agent = await studentAgent('quote-fixed');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ type: 'fixed', value: 2000 });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ discountAmount: 2000, finalAmount: 13000 });
  });

  test('fixed coupon larger than price never discounts below zero', async () => {
    const agent = await studentAgent('quote-fixed-big');
    const course = await createCourse({ price: 500 });
    const coupon = await createCoupon({ type: 'fixed', value: 2000 });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ discountAmount: 500, finalAmount: 0 });
  });

  test('COUPON_INVALID: coupon code does not exist', async () => {
    const agent = await studentAgent('quote-invalid');
    const course = await createCourse({ price: 15000 });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: 'DOES-NOT-EXIST' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_INVALID');
  });

  test('COUPON_INVALID: coupon exists but is_active=false', async () => {
    const agent = await studentAgent('quote-inactive');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ isActive: false });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_INVALID');
  });

  test('COUPON_EXPIRED: now is before valid_from (not yet valid)', async () => {
    const agent = await studentAgent('quote-not-yet');
    const course = await createCourse({ price: 15000 });
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const coupon = await createCoupon({ validFrom: future });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_EXPIRED');
  });

  test('COUPON_EXPIRED: now is after valid_until (no longer valid)', async () => {
    const agent = await studentAgent('quote-past');
    const course = await createCourse({ price: 15000 });
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const coupon = await createCoupon({ validUntil: past });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_EXPIRED');
  });

  test('COUPON_EXHAUSTED: used_count >= max_uses', async () => {
    const agent = await studentAgent('quote-exhausted');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ maxUses: 2, usedCount: 2 });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_EXHAUSTED');
  });

  test('max_uses NULL means unlimited — never exhausted regardless of used_count', async () => {
    const agent = await studentAgent('quote-unlimited');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ maxUses: null, usedCount: 999 });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(200);
  });

  test('COUPON_NOT_APPLICABLE: coupon.course_id is set and does not match the requested course', async () => {
    const agent = await studentAgent('quote-not-applicable');
    const courseA = await createCourse({ price: 15000 });
    const courseB = await createCourse({ price: 20000 });
    const coupon = await createCoupon({ courseId: courseA.id });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: courseB.id, couponCode: coupon.code });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_NOT_APPLICABLE');
  });

  test('coupon.course_id NULL is valid for any course', async () => {
    const agent = await studentAgent('quote-any-course');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ courseId: null });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(200);
  });

  test('coupon.course_id set AND matching the requested course is applicable', async () => {
    const agent = await studentAgent('quote-matching-course');
    const course = await createCourse({ price: 15000 });
    const coupon = await createCoupon({ courseId: course.id });

    const res = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id, couponCode: coupon.code });

    expect(res.status).toBe(200);
  });
});
