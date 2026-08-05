// server/tests/jobs/enrollmentLifecycleCron.test.js
// Unit tests for services/enrollmentLifecycleService.js's
// {expireStaleEnrollments, sendExpiringReminders} -- the LOGIC behind
// jobs/enrollmentLifecycleCron.js, called directly (per this codebase's
// established convention, statsReconciliationCron.test.js: don't try to
// test actual node-cron scheduling). Real, genuinely past/future-dated
// fixture rows stand in for "time travel" -- a one-shot batch sweep over
// `expires_at <= NOW()` is naturally proven this way (seed a real past
// timestamp, assert it gets swept; seed a real future one, assert it
// doesn't) without needing jest.useFakeTimers()/setSystemTime(), matching
// the codebase's existing fixture-based testing style.
//
// Also contains the dedicated regression test for the 20260101000035
// migration's `uq_enr_active` generated-column fix: two FULL
// purchase-expire cycles for the SAME (user, course), which -- before that
// migration -- would throw `SequelizeUniqueConstraintError` on the second
// expiry (see that migration's own header + DECISIONS.md 2026-08-05).
import { afterAll, describe, expect, test } from '@jest/globals';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';
import { expireStaleEnrollments, sendExpiringReminders } from '../../src/services/enrollmentLifecycleService.js';
import { createEnrollmentFromOrder } from '../../src/services/enrollmentService.js';
import { testOutbox } from '../../src/utils/mailer.js';

const { sequelize, Enrollment, Order, Notification } = db;

afterAll(async () => {
  await sequelize.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;

let invoiceCounter = 0;
function uniqueInvoiceNo() {
  invoiceCounter += 1;
  // orders.invoice_no is VARCHAR(30) -- stay well under that.
  return `INV${Date.now().toString(36)}${invoiceCounter}`;
}

async function createOrderRow(user, course, overrides = {}) {
  return Order.create({
    invoiceNo: uniqueInvoiceNo(),
    userId: user.id,
    courseId: course.id,
    amount: course.price,
    discountAmount: 0,
    finalAmount: course.price,
    currency: course.currency,
    gateway: 'mock',
    status: 'paid',
    paidAt: new Date(),
    ...overrides,
  });
}

describe('enrollmentLifecycleService.expireStaleEnrollments', () => {
  test('flips a past-expiresAt active enrollment to expired; leaves a future-expiresAt one untouched', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('expire-a') });
    const coursePast = await createCourse();
    const courseFuture = await createCourse();

    const pastEnrollment = await Enrollment.create({
      userId: user.id,
      courseId: coursePast.id,
      orderId: null,
      source: 'manual',
      startsAt: new Date(Date.now() - 40 * DAY_MS),
      expiresAt: new Date(Date.now() - DAY_MS), // already in the past
      status: 'active',
    });
    const futureEnrollment = await Enrollment.create({
      userId: user.id,
      courseId: courseFuture.id,
      orderId: null,
      source: 'manual',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * DAY_MS), // control: not yet due
      status: 'active',
    });

    const result = await expireStaleEnrollments();
    expect(result.expired).toBeGreaterThanOrEqual(1); // global sweep -- at least this row

    await pastEnrollment.reload();
    await futureEnrollment.reload();
    expect(pastEnrollment.status).toBe('expired');
    expect(futureEnrollment.status).toBe('active'); // control row untouched
  });

  test('idempotent: re-running finds nothing left to do for an already-expired row', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('expire-b') });
    const course = await createCourse();
    const enrollment = await Enrollment.create({
      userId: user.id,
      courseId: course.id,
      orderId: null,
      source: 'manual',
      startsAt: new Date(Date.now() - 40 * DAY_MS),
      expiresAt: new Date(Date.now() - DAY_MS),
      status: 'active',
    });

    await expireStaleEnrollments();
    await enrollment.reload();
    expect(enrollment.status).toBe('expired');

    // Second, immediate run -- this specific row is no longer 'active', so
    // it's outside the sweep's WHERE clause on any subsequent run.
    await expireStaleEnrollments();
    await enrollment.reload();
    expect(enrollment.status).toBe('expired');
  });
});

describe('enrollmentLifecycleService.sendExpiringReminders', () => {
  test('reminds only enrollments inside the ~6-8-day window; skips too-soon/too-far/already-reminded rows; never double-sends on a re-run', async () => {
    const emailInWindow = uniqueEmail('remind-in-window');
    const { user: userInWindow } = await createVerifiedUser({ email: emailInWindow });
    const { user: userTooSoon } = await createVerifiedUser({ email: uniqueEmail('remind-too-soon') });
    const { user: userTooFar } = await createVerifiedUser({ email: uniqueEmail('remind-too-far') });
    const { user: userAlreadyReminded } = await createVerifiedUser({ email: uniqueEmail('remind-already') });

    const courseInWindow = await createCourse({ title: 'Reminder Window Course' });
    const courseTooSoon = await createCourse();
    const courseTooFar = await createCourse();
    const courseAlreadyReminded = await createCourse();

    const inWindow = await Enrollment.create({
      userId: userInWindow.id,
      courseId: courseInWindow.id,
      orderId: null,
      source: 'manual',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * DAY_MS), // dead center of the window
      status: 'active',
    });
    const tooSoon = await Enrollment.create({
      userId: userTooSoon.id,
      courseId: courseTooSoon.id,
      orderId: null,
      source: 'manual',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * DAY_MS), // well before the window
      status: 'active',
    });
    const tooFar = await Enrollment.create({
      userId: userTooFar.id,
      courseId: courseTooFar.id,
      orderId: null,
      source: 'manual',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 20 * DAY_MS), // well after the window
      status: 'active',
    });
    const alreadyReminded = await Enrollment.create({
      userId: userAlreadyReminded.id,
      courseId: courseAlreadyReminded.id,
      orderId: null,
      source: 'manual',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * DAY_MS), // inside the window...
      status: 'active',
      expiryReminderSentAt: new Date(), // ...but already reminded -- must be skipped
    });

    const result = await sendExpiringReminders();
    expect(result.sent).toBeGreaterThanOrEqual(1);

    await Promise.all([inWindow.reload(), tooSoon.reload(), tooFar.reload(), alreadyReminded.reload()]);

    expect(inWindow.expiryReminderSentAt).not.toBeNull();
    expect(tooSoon.expiryReminderSentAt).toBeNull();
    expect(tooFar.expiryReminderSentAt).toBeNull();

    const notification = await Notification.findOne({
      where: { userId: userInWindow.id, type: 'enrollment_expiring_soon' },
    });
    expect(notification).not.toBeNull();
    expect(notification.body).toContain('Reminder Window Course');
    expect(notification.body).toMatch(/7 days?/);

    const mail = [...testOutbox].reverse().find((m) => m.to === emailInWindow);
    expect(mail).toBeTruthy();
    expect(mail.subject).toContain('Reminder Window Course');

    // Never reminded twice for the already-reminded row, no matter how many
    // times the sweep runs.
    const tooSoonNotifications = await Notification.count({
      where: { userId: userTooSoon.id, type: 'enrollment_expiring_soon' },
    });
    expect(tooSoonNotifications).toBe(0);
    const tooFarNotifications = await Notification.count({
      where: { userId: userTooFar.id, type: 'enrollment_expiring_soon' },
    });
    expect(tooFarNotifications).toBe(0);
    const alreadyRemindedNotifications = await Notification.count({
      where: { userId: userAlreadyReminded.id, type: 'enrollment_expiring_soon' },
    });
    expect(alreadyRemindedNotifications).toBe(0); // the sweep skipped it -- it was already reminded before this run started

    // Re-run: the row this test just reminded must not be reminded again.
    await sendExpiringReminders();
    const notificationCountAfterSecondRun = await Notification.count({
      where: { userId: userInWindow.id, type: 'enrollment_expiring_soon' },
    });
    expect(notificationCountAfterSecondRun).toBe(1);
  });
});

describe('Two full purchase-expire cycles for the same (user, course) -- regression for the uq_enr_active generated-column fix (migration 20260101000035)', () => {
  test('a second expiry cycle for the same (user, course) no longer throws SequelizeUniqueConstraintError', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('two-cycle') });
    const course = await createCourse({ validityDays: 30 });

    // --- Cycle 1: purchase, then expire ---
    const order1 = await createOrderRow(user, course);
    const enrollment1 = await sequelize.transaction((transaction) =>
      createEnrollmentFromOrder({ order: order1, course, transaction })
    );
    expect(enrollment1.status).toBe('active');
    await Enrollment.update({ expiresAt: new Date(Date.now() - DAY_MS) }, { where: { id: enrollment1.id } });
    await expireStaleEnrollments();
    await enrollment1.reload();
    expect(enrollment1.status).toBe('expired');

    // --- Cycle 2: repurchase, then expire again ---
    // At this point (user_id, course_id, 'expired') is ALREADY occupied by
    // enrollment1. Before the migration fix, flipping enrollment2's status
    // to 'expired' below would collide with that row under the old plain
    // UNIQUE(user_id, course_id, status) key and throw
    // SequelizeUniqueConstraintError -- this is the exact bug this
    // migration fixes.
    const order2 = await createOrderRow(user, course);
    const enrollment2 = await sequelize.transaction((transaction) =>
      createEnrollmentFromOrder({ order: order2, course, transaction })
    );
    expect(enrollment2.status).toBe('active');
    await Enrollment.update({ expiresAt: new Date(Date.now() - DAY_MS) }, { where: { id: enrollment2.id } });

    await expect(expireStaleEnrollments()).resolves.toBeDefined(); // must not throw
    await enrollment2.reload();
    expect(enrollment2.status).toBe('expired');

    // --- Cycle 3: repurchase again, proving the pattern keeps working ---
    const order3 = await createOrderRow(user, course);
    const enrollment3 = await sequelize.transaction((transaction) =>
      createEnrollmentFromOrder({ order: order3, course, transaction })
    );
    expect(enrollment3.status).toBe('active');

    const all = await Enrollment.findAll({
      where: { userId: user.id, courseId: course.id },
      order: [['id', 'ASC']],
    });
    expect(all.length).toBe(3);
    expect(all.map((e) => e.status)).toEqual(['expired', 'expired', 'active']);
  }, 20000);
});
