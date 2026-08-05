// server/tests/admin/dashboard.test.js
// GET /api/v1/admin/dashboard (docs/07_EXECUTION_PLAN.md 11.1,
// docs/04_API_SPEC.md §7). Structure mirrors tests/admin/orders.test.js's
// established supertest style.
//
// TESTING-STRATEGY NOTE (judgment call, documented per this task's own
// instruction): unlike most of this codebase's supertest specs (which scope
// every assertion to a freshly-created, uniquely-emailed user/entity — see
// e.g. tests/qbank/analytics.test.js's own header), this endpoint's revenue/
// pendingTransfersCount/newStudents30d/activeEnrollmentsCount/revenueTrend
// fields are GENUINELY GLOBAL aggregates over the entire orders/users/
// enrollments tables, which this shared jest --runInBand test DB (migrated
// fresh once per whole run, never truncated between files, per
// tests/globalSetup.cjs) accumulates across every other test file's own
// fixtures too. Asserting an absolute expected value for these fields would
// be flaky. Instead: capture a baseline via a real GET call BEFORE seeding
// this test's own fixtures, seed known deltas, GET again, and assert the
// (after - before) delta exactly matches the fixture's own known math — this
// still proves the endpoint's arithmetic is exactly right without depending
// on the rest of the suite's total row count. `topCourses`/`recentOrders`
// (ranked/limited lists, not sums) use a different, still-deterministic
// strategy: topCourses uses a deliberately large enrollment-count margin
// (15/10/5) that no other single test file's course fixture plausibly
// approaches (every `createCourse()` call makes a brand-new, never-shared
// course row, so cross-test contamination of ONE course's own enrollment
// count is not possible — the only real risk is being pushed out of the
// global top-5 by some OTHER course, which the large margin defends
// against); recentOrders relies on `--runInBand` sequential execution
// meaning the fixture order created last-in-this-test is genuinely the most
// recently-paid order in the whole DB at request time.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, Order, User } = db;

afterAll(async () => {
  await sequelize.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let invoiceCounter = 0;
function uniqueInvoiceNo() {
  invoiceCounter += 1;
  return `INVDB${Date.now().toString(36)}${invoiceCounter}`;
}

/** Creates an order row directly via the model layer (bypasses the real checkout flow — these tests exercise the ADMIN dashboard endpoint, not order creation itself). */
async function createOrder(user, course, overrides = {}) {
  const finalAmount = overrides.finalAmount ?? Number(course.price);
  return Order.create({
    invoiceNo: uniqueInvoiceNo(),
    userId: user.id,
    courseId: course.id,
    amount: finalAmount,
    discountAmount: 0,
    finalAmount,
    currency: course.currency,
    gateway: 'mock',
    status: 'pending',
    paidAt: null,
    ...overrides,
  });
}

function dayLabel(d) {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

describe('GET /api/v1/admin/dashboard', () => {
  test('happy path: revenueToday/7d/30d/Total, pendingTransfersCount, newStudents30d, activeEnrollmentsCount all match seeded-fixture math exactly (delta-based, see file header)', async () => {
    const { agent } = await createAdminSession(app);
    const before = await agent.get('/api/v1/admin/dashboard');
    expect(before.status).toBe(200);

    const { user } = await createVerifiedUser({ email: uniqueEmail('dash-buyer') });
    const course = await createCourse();

    // Paid "today" -> counts toward today/7d/30d/total.
    await createOrder(user, course, { finalAmount: 11000, status: 'paid', paidAt: new Date() });
    // Paid 3 days ago -> counts toward 7d/30d/total, NOT today.
    await createOrder(user, course, { finalAmount: 5500, status: 'paid', paidAt: new Date(Date.now() - 3 * DAY_MS) });
    // Paid 40 days ago -> counts toward total ONLY.
    await createOrder(user, course, { finalAmount: 2200, status: 'paid', paidAt: new Date(Date.now() - 40 * DAY_MS) });
    // Never paid -> must not count anywhere.
    await createOrder(user, course, { finalAmount: 9999, status: 'pending' });
    await createOrder(user, course, { finalAmount: 9999, status: 'failed' });

    // Pending manual-payment queue: 2 that DO count (raast/bank_transfer +
    // awaiting_verification), 2 that must NOT (wrong gateway / wrong status).
    await createOrder(user, course, { finalAmount: 1000, gateway: 'raast', status: 'awaiting_verification' });
    await createOrder(user, course, { finalAmount: 1000, gateway: 'bank_transfer', status: 'awaiting_verification' });
    await createOrder(user, course, { finalAmount: 1000, gateway: 'jazzcash', status: 'awaiting_verification' });
    await createOrder(user, course, { finalAmount: 1000, gateway: 'bank_transfer', status: 'pending' });

    // New students (within 30d) vs one deliberately backdated (must not count).
    await createVerifiedUser({ email: uniqueEmail('dash-new-1') });
    await createVerifiedUser({ email: uniqueEmail('dash-new-2') });
    const { user: oldStudent } = await createVerifiedUser({ email: uniqueEmail('dash-old') });
    await User.update({ createdAt: new Date(Date.now() - 40 * DAY_MS) }, { where: { id: oldStudent.id }, silent: true });

    // Active enrollments (2), + 1 revoked that must not count.
    await createActiveEnrollment(user, course);
    await createActiveEnrollment(user, await createCourse());
    await createActiveEnrollment(user, await createCourse(), { status: 'revoked' });

    const after = await agent.get('/api/v1/admin/dashboard');
    expect(after.status).toBe(200);
    const b = before.body.data;
    const a = after.body.data;

    expect(a.revenueToday - b.revenueToday).toBeCloseTo(11000, 5);
    expect(a.revenue7d - b.revenue7d).toBeCloseTo(11000 + 5500, 5);
    expect(a.revenue30d - b.revenue30d).toBeCloseTo(11000 + 5500, 5);
    expect(a.revenueTotal - b.revenueTotal).toBeCloseTo(11000 + 5500 + 2200, 5);
    expect(a.pendingTransfersCount - b.pendingTransfersCount).toBe(2);
    // 3 new students this test: dash-buyer (created above, role defaults to
    // 'student') + dash-new-1 + dash-new-2. dash-old is backdated below and
    // must NOT count.
    expect(a.newStudents30d - b.newStudents30d).toBe(3);
    expect(a.activeEnrollmentsCount - b.activeEnrollmentsCount).toBe(2);

    // Full 9-field TS contract present regardless of what the page currently renders (task brief).
    expect(Object.keys(a).sort()).toEqual(
      [
        'revenueToday',
        'revenue7d',
        'revenue30d',
        'revenueTotal',
        'pendingTransfersCount',
        'newStudents30d',
        'activeEnrollmentsCount',
        'topCourses',
        'recentOrders',
        'revenueTrend',
      ].sort()
    );
  });

  test('topCourses: top 5 by ACTIVE enrollment count, each with the correct per-course paid-order revenue, ranked desc', async () => {
    const { agent } = await createAdminSession(app);
    const { user } = await createVerifiedUser({ email: uniqueEmail('dash-top') });
    const courseA = await createCourse();
    const courseB = await createCourse();
    const courseC = await createCourse();

    async function enrollN(course, n) {
      for (let i = 0; i < n; i += 1) {
        const student = (await createVerifiedUser({ email: uniqueEmail(`dash-top-enr-${course.id}-${i}`) })).user;
        await createActiveEnrollment(student, course);
      }
    }
    await enrollN(courseA, 15);
    await enrollN(courseB, 10);
    await enrollN(courseC, 5);

    await createOrder(user, courseA, { finalAmount: 3000, status: 'paid', paidAt: new Date() });
    await createOrder(user, courseA, { finalAmount: 2000, status: 'paid', paidAt: new Date() });
    await createOrder(user, courseB, { finalAmount: 4000, status: 'paid', paidAt: new Date() });
    // courseC has no paid order at all -> revenue must be 0, not undefined/null.
    await createOrder(user, courseC, { finalAmount: 9999, status: 'pending' });

    const res = await agent.get('/api/v1/admin/dashboard');
    expect(res.status).toBe(200);
    const { topCourses } = res.body.data;
    expect(topCourses.length).toBeLessThanOrEqual(5);

    const byId = new Map(topCourses.map((c) => [c.courseId, c]));
    expect(byId.get(courseA.id)).toMatchObject({ title: courseA.title, enrollmentsCount: 15, revenue: 5000 });
    expect(byId.get(courseB.id)).toMatchObject({ title: courseB.title, enrollmentsCount: 10, revenue: 4000 });
    expect(byId.get(courseC.id)).toMatchObject({ title: courseC.title, enrollmentsCount: 5, revenue: 0 });

    const idxA = topCourses.findIndex((c) => c.courseId === courseA.id);
    const idxB = topCourses.findIndex((c) => c.courseId === courseB.id);
    const idxC = topCourses.findIndex((c) => c.courseId === courseC.id);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  test('recentOrders: the most-recently-paid order in the whole DB appears first, correctly serialized via orderService.serializeOrder', async () => {
    const { agent } = await createAdminSession(app);
    const { user } = await createVerifiedUser({ email: uniqueEmail('dash-recent') });
    const course = await createCourse();
    // paidAt deliberately set a minute into the future — MySQL DATETIME has
    // whole-second precision, so a plain `new Date()` here can tie with
    // another order paid within the same wall-clock second by an earlier
    // test in this same file/run (ORDER BY paid_at DESC tie-breaking on an
    // exact-equal value is not guaranteed); a comfortably-later timestamp
    // sidesteps that instead of asserting on undefined tie behavior.
    const order = await createOrder(user, course, { finalAmount: 7500, status: 'paid', paidAt: new Date(Date.now() + 60_000) });

    const res = await agent.get('/api/v1/admin/dashboard');
    expect(res.status).toBe(200);
    const { recentOrders } = res.body.data;
    expect(recentOrders[0].id).toBe(order.id);
    expect(recentOrders[0].invoiceNo).toBe(order.invoiceNo);
    expect(recentOrders[0].status).toBe('paid');
    expect(recentOrders[0].finalAmount).toBe(7500);
    expect(recentOrders[0].userEmail).toBe(user.email);
    expect(recentOrders[0].courseTitle).toBe(course.title);
  });

  test('revenueTrend: exactly 30 zero-filled chronological entries ending in "today"; per-day totals match seeded fixture via delta', async () => {
    const { agent } = await createAdminSession(app);
    const before = await agent.get('/api/v1/admin/dashboard');
    expect(before.body.data.revenueTrend.length).toBe(30);
    const beforeTrend = new Map(before.body.data.revenueTrend.map((p) => [p.day, p.amount]));

    const { user } = await createVerifiedUser({ email: uniqueEmail('dash-trend') });
    const course = await createCourse();
    const today = new Date();
    const fiveDaysAgo = new Date(Date.now() - 5 * DAY_MS);

    await createOrder(user, course, { finalAmount: 1234, status: 'paid', paidAt: today });
    await createOrder(user, course, { finalAmount: 4321, status: 'paid', paidAt: fiveDaysAgo });

    const after = await agent.get('/api/v1/admin/dashboard');
    const trend = after.body.data.revenueTrend;
    expect(trend.length).toBe(30);
    expect(trend[29].day).toBe(dayLabel(today)); // chronological, last entry = today

    const todayLabel = dayLabel(today);
    const fiveDaysAgoLabel = dayLabel(fiveDaysAgo);
    const todayBucket = trend.find((p) => p.day === todayLabel);
    const fiveDaysAgoBucket = trend.find((p) => p.day === fiveDaysAgoLabel);
    expect(todayBucket.amount - (beforeTrend.get(todayLabel) || 0)).toBeCloseTo(1234, 5);
    expect(fiveDaysAgoBucket.amount - (beforeTrend.get(fiveDaysAgoLabel) || 0)).toBeCloseTo(4321, 5);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
