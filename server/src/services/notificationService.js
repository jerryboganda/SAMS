// server/src/services/notificationService.js
// Phase 10.1 + 10.3 backend: central place for BOTH (a) the "create a
// Notification row + optionally email" trigger functions Phase 10.1 asks
// for, and (b) the student-facing list/mark-read/count functions Phase
// 10.3's backend needs. Layering: routes -> controllers -> services ->
// models (CLAUDE.md §4).
//
// This consolidates what used to be duplicated ad hoc
// `Notification.create()` + `sendMail()` call sites scattered across:
//   - services/orderService.js (sendPurchaseConfirmation)
//   - services/manualPaymentService.js (notifyRejection)
//   - services/enrollmentLifecycleService.js (sendExpiringReminders)
//   - services/authService.js (maybeSendNewDeviceAlert, changePassword)
// Two of those (new-device alert, password-changed) previously sent ONLY an
// email — there was no in-app Notification row at all for them. As of this
// service, every trigger below creates BOTH an in-app row and (best-effort)
// an email.
import db from '../models/index.js';
import logger from '../utils/logger.js';
import {
  sendMail,
  purchaseConfirmedTemplate,
  paymentRejectedTemplate,
  enrollmentExpiringReminderTemplate,
  newDeviceAlertTemplate,
  passwordChangedTemplate,
} from '../utils/mailer.js';

const { Notification } = db;

// ---------------------------------------------------------------------------
// Shared private helper
// ---------------------------------------------------------------------------

/**
 * Always creates the in-app Notification row first; `mail` (a
 * `{to,subject,text,html}` object from one of utils/mailer.js's templates,
 * or falsy to skip email entirely — e.g. the user has no email on file) is
 * sent best-effort afterwards. sendMail() itself never throws (see its own
 * doc comment), so the try/catch here is defensive-only, guarding against
 * something upstream of sendMail (e.g. a template function throwing on a
 * malformed input) rather than a realistic sendMail failure mode.
 */
async function notify({ userId, type, title, body, link, mail }) {
  await Notification.create({
    userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
    isRead: false,
  });

  if (mail) {
    try {
      await sendMail(mail);
    } catch (err) {
      logger.error(`[notificationService] sendMail failed for type=${type} userId=${userId}: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Trigger functions (Phase 10.1)
// ---------------------------------------------------------------------------

/** Fired from orderService.js's shared payment-success path once an order is marked 'paid'. */
export async function notifyPurchaseConfirmed({ order, course, user }) {
  const courseTitle = course?.title ?? `course #${order.courseId}`;
  await notify({
    userId: order.userId,
    type: 'purchase_paid',
    title: 'Purchase confirmed',
    body: `Your enrollment in "${courseTitle}" is now active. Invoice ${order.invoiceNo}.`,
    link: `/order/${order.id}/status`,
    mail: user?.email ? purchaseConfirmedTemplate({ user, order, courseTitle }) : null,
  });
}

/** Fired from manualPaymentService.js's admin-reject flow (raast/bank_transfer proof review). */
export async function notifyPaymentRejected({ order, reason, user }) {
  await notify({
    userId: order.userId,
    type: 'purchase_rejected',
    title: 'Payment verification failed',
    body: `Your payment proof for invoice ${order.invoiceNo} could not be verified. Reason: ${reason}. Please place a new order to try again.`,
    link: `/order/${order.id}/status`,
    mail: user?.email ? paymentRejectedTemplate({ user, order, reason }) : null,
  });
}

/** Fired from enrollmentLifecycleService.js's daily 7-day-expiring reminder sweep. Keeps the `'enrollment_expiring_soon'` type string exactly as-is — already used/tested from Phase 9.9. */
export async function notifyEnrollmentExpiringSoon({ enrollment, user, courseTitle, daysRemaining, expiryDateStr, courseLink }) {
  await notify({
    userId: enrollment.userId,
    type: 'enrollment_expiring_soon',
    title: 'Your enrollment is expiring soon',
    body: `Your access to "${courseTitle}" expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (on ${expiryDateStr}). Renew to keep your access.`,
    link: courseLink,
    mail: user?.email ? enrollmentExpiringReminderTemplate({ user, courseTitle, daysRemaining, expiryDateStr }) : null,
  });
}

/** Fired from authService.js's maybeSendNewDeviceAlert. Previously email-only — this is the first time a new-device sign-in also gets an in-app Notification row. */
export async function notifyNewDeviceLogin({ user, ip, deviceName }) {
  await notify({
    userId: user.id,
    type: 'new_device',
    title: 'New device signed in',
    body: `A new device (${deviceName || 'unknown device'}) from IP ${ip || 'unknown'} just signed in to your account.`,
    link: '/app/profile',
    mail: user?.email ? newDeviceAlertTemplate({ user, ip, deviceName }) : null,
  });
}

/** Fired from authService.js's changePassword. Previously email-only — this is the first time a password change also gets an in-app Notification row. */
export async function notifyPasswordChanged({ user }) {
  await notify({
    userId: user.id,
    type: 'password_changed',
    title: 'Your password was changed',
    body: 'Your password was just changed. All other active sessions have been signed out for your security.',
    link: '/app/profile',
    mail: user?.email ? passwordChangedTemplate({ user }) : null,
  });
}

// ---------------------------------------------------------------------------
// Student-facing list/mark-read/count (Phase 10.3 backend)
// ---------------------------------------------------------------------------

/** Matches client/src/types/index.ts's `NotificationItem` interface exactly. */
export function serializeNotification(n) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body ?? undefined,
    link: n.link ?? undefined,
    isRead: n.isRead,
    createdAt: n.createdAt,
  };
}

/**
 * GET /notifications. FLAT ARRAY, no pagination envelope — the frontend
 * calls `apiFetch<NotificationItem[]>("/notifications")` with zero query
 * params, same "flat non-paginated list" precedent as Phase 9.8's admin
 * orders `listAllOrders`.
 */
export async function listNotificationsForUser(userId, { unread = false } = {}) {
  const notifications = await Notification.findAll({
    where: { userId, ...(unread ? { isRead: false } : {}) },
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  return notifications.map(serializeNotification);
}

/**
 * POST /notifications/read. ALWAYS scoped by `userId`, even when `ids[]` is
 * given, so a caller can never mark another user's notification as read
 * (IDOR safety) — a foreign/nonexistent id is silently a no-op, not an
 * error.
 */
export async function markNotificationsRead(userId, { ids, all } = {}) {
  await Notification.update({ isRead: true }, { where: { userId, ...(all ? {} : { id: ids }) } });
  return { success: true };
}

export async function getUnreadNotificationCount(userId) {
  return Notification.count({ where: { userId, isRead: false } });
}

export default {
  notifyPurchaseConfirmed,
  notifyPaymentRejected,
  notifyEnrollmentExpiringSoon,
  notifyNewDeviceLogin,
  notifyPasswordChanged,
  serializeNotification,
  listNotificationsForUser,
  markNotificationsRead,
  getUnreadNotificationCount,
};
