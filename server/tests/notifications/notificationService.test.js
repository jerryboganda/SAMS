// server/tests/notifications/notificationService.test.js
// Unit-level coverage for services/notificationService.js's 5 trigger
// functions (docs/07_EXECUTION_PLAN.md 10.1) — calls the service functions
// directly against the test DB, asserting a Notification row was created
// with the right type/userId AND (where the user has an email) that
// testOutbox got an email with the right to/subject. Also covers
// getUnreadNotificationCount.
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import * as notificationService from '../../src/services/notificationService.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, Notification, Order } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

async function makeOrder(user, course, overrides = {}) {
  return Order.create({
    invoiceNo: `INV-NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id,
    courseId: course.id,
    amount: 15000,
    discountAmount: 0,
    finalAmount: 15000,
    currency: 'PKR',
    gateway: 'mock',
    status: 'paid',
    ...overrides,
  });
}

describe('notificationService.notifyPurchaseConfirmed', () => {
  test('creates a purchase_paid Notification row + a confirmation email', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('notifysvc-purchase') });
    const course = await createCourse();
    const order = await makeOrder(user, course);

    await notificationService.notifyPurchaseConfirmed({ order, course, user });

    const row = await Notification.findOne({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(row).not.toBeNull();
    expect(row.title).toBe('Purchase confirmed');
    expect(row.link).toBe(`/order/${order.id}/status`);

    const mail = testOutbox.find((m) => m.to === user.email);
    expect(mail).toBeTruthy();
    expect(mail.subject).toMatch(/purchase is confirmed/i);
  });
});

describe('notificationService.notifyPaymentRejected', () => {
  test('creates a purchase_rejected Notification row + a rejection email', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('notifysvc-rejected') });
    const course = await createCourse();
    const order = await makeOrder(user, course, { status: 'failed' });

    await notificationService.notifyPaymentRejected({ order, reason: 'Illegible receipt image', user });

    const row = await Notification.findOne({ where: { userId: user.id, type: 'purchase_rejected' } });
    expect(row).not.toBeNull();
    expect(row.body).toMatch(/Illegible receipt image/);

    const mail = testOutbox.find((m) => m.to === user.email);
    expect(mail).toBeTruthy();
    expect(mail.subject).toMatch(/could not be verified/i);
  });
});

describe('notificationService.notifyEnrollmentExpiringSoon', () => {
  test('creates an enrollment_expiring_soon Notification row + a reminder email', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('notifysvc-expiring') });
    const course = await createCourse();
    const enrollment = await createActiveEnrollment(user, course);

    await notificationService.notifyEnrollmentExpiringSoon({
      enrollment,
      user,
      courseTitle: course.title,
      daysRemaining: 7,
      expiryDateStr: '2026-08-12',
      courseLink: `/courses/${course.slug}`,
    });

    const row = await Notification.findOne({ where: { userId: user.id, type: 'enrollment_expiring_soon' } });
    expect(row).not.toBeNull();
    expect(row.link).toBe(`/courses/${course.slug}`);

    const mail = testOutbox.find((m) => m.to === user.email);
    expect(mail).toBeTruthy();
    expect(mail.subject).toMatch(/expires in 7 days/i);
  });
});

describe('notificationService.notifyNewDeviceLogin', () => {
  test('creates a new_device Notification row + an alert email', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('notifysvc-newdevice') });

    await notificationService.notifyNewDeviceLogin({ user, ip: '203.0.113.5', deviceName: 'Chrome on Windows' });

    const row = await Notification.findOne({ where: { userId: user.id, type: 'new_device' } });
    expect(row).not.toBeNull();
    expect(row.body).toMatch(/Chrome on Windows/);
    expect(row.link).toBe('/app/profile');

    const mail = testOutbox.find((m) => m.to === user.email);
    expect(mail).toBeTruthy();
    expect(mail.subject).toMatch(/new device signed in/i);
  });
});

describe('notificationService.notifyPasswordChanged', () => {
  test('creates a password_changed Notification row + an alert email', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('notifysvc-pwchanged') });

    await notificationService.notifyPasswordChanged({ user });

    const row = await Notification.findOne({ where: { userId: user.id, type: 'password_changed' } });
    expect(row).not.toBeNull();
    expect(row.link).toBe('/app/profile');

    const mail = testOutbox.find((m) => m.to === user.email);
    expect(mail).toBeTruthy();
    expect(mail.subject).toMatch(/password was changed/i);
  });
});

describe('notificationService.getUnreadNotificationCount', () => {
  test('counts only this user\'s unread rows', async () => {
    const { user } = await createVerifiedUser({ email: uniqueEmail('notifysvc-count') });
    const { user: other } = await createVerifiedUser({ email: uniqueEmail('notifysvc-count-other') });

    await Notification.create({ userId: user.id, type: 'test', title: 'Unread A', isRead: false });
    await Notification.create({ userId: user.id, type: 'test', title: 'Unread B', isRead: false });
    await Notification.create({ userId: user.id, type: 'test', title: 'Already read', isRead: true });
    await Notification.create({ userId: other.id, type: 'test', title: 'Someone else', isRead: false });

    const count = await notificationService.getUnreadNotificationCount(user.id);
    expect(count).toBe(2);
  });
});
