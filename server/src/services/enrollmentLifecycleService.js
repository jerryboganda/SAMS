// server/src/services/enrollmentLifecycleService.js
// Phase 9.9 enrollment LIFECYCLE — the follow-up
// enrollmentService.js#createEnrollmentFromOrder's own doc comment always
// pointed at ("the full enrollment LIFECYCLE ... is a SEPARATE follow-up
// task (9.9), not built here"). Kept in its own file rather than folded into
// enrollmentService.js: enrollmentService.js is the narrow "create one
// enrollment from a paid order" building block orderService.js's
// payment-success path depends on directly; this file is the daily
// batch-sweep lifecycle logic (expiry + reminders) that a cron job drives —
// different call shape, different callers, worth keeping separate per
// CLAUDE.md §4's "business logic lives in services" (still layered
// correctly; just two service files instead of one growing file).
//
// Both exports here are called DIRECTLY by unit tests
// (server/tests/jobs/enrollmentLifecycleCron.test.js) — the actual
// node-cron SCHEDULING lives in jobs/enrollmentLifecycleCron.js, which is a
// thin wrapper only (same "test the service function, not the cron
// scheduling" convention as jobs/statsReconciliationCron.js /
// services/statsService.js).
import { Op } from 'sequelize';
import db from '../models/index.js';
import logger from '../utils/logger.js';
import { sendMail, enrollmentExpiringReminderTemplate } from '../utils/mailer.js';

const { Enrollment, Course, User, Notification } = db;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Expiry sweep
// ---------------------------------------------------------------------------

/**
 * Flips every `status='active'` enrollment whose `expires_at` has already
 * passed to `status='expired'`. A single batch `UPDATE` — no per-row loop
 * needed for the flip itself (no side effects depend on iterating row by
 * row here; the reminder sweep below is the one that needs per-row work).
 * Idempotent by construction: re-running finds nothing left to do on a
 * clean pass (the `WHERE status='active'` clause only ever matches rows
 * this same function hasn't already flipped).
 */
export async function expireStaleEnrollments() {
  const [affectedCount] = await Enrollment.update(
    { status: 'expired' },
    { where: { status: 'active', expiresAt: { [Op.lte]: new Date() } } }
  );

  logger.info(`[cron] expireStaleEnrollments: flipped ${affectedCount} enrollment(s) active -> expired.`);
  return { expired: affectedCount };
}

// ---------------------------------------------------------------------------
// 7-day-expiring reminder sweep
// ---------------------------------------------------------------------------

// A DAILY sweep looking for "expires in ~7 days" needs a window wide enough
// to reliably catch each qualifying enrollment exactly once given the job
// only runs once every 24h — an exactly-7-day point (or an exactly-24h-wide
// window with no margin) risks missing an enrollment entirely if the cron
// runs a little early/late one day, or double-catching it on two
// consecutive runs at the boundary. A +/-1-day margin around the 7-day mark
// (6..8 days out) comfortably covers any single day's run-time jitter while
// staying nowhere near wide enough to span two consecutive daily runs twice
// -- see DECISIONS.md 2026-08-05 for the full reasoning.
const REMINDER_WINDOW_MIN_DAYS = 6;
const REMINDER_WINDOW_MAX_DAYS = 8;

/**
 * Finds every `status='active'` enrollment expiring within the
 * ~6-8-day-from-now window that hasn't already been reminded
 * (`expiry_reminder_sent_at IS NULL`), sends a `Notification.create()` +
 * best-effort plain-text email for each, then stamps
 * `expiry_reminder_sent_at` so a later sweep (today's or any future day's)
 * never re-sends it. Mirrors orderService.js#sendPurchaseConfirmation's
 * "minimal, direct Notification.create() + optional email" style
 * deliberately — Phase 10's real notificationService doesn't exist yet,
 * this is just enough for this task, not a bigger notification system.
 */
export async function sendExpiringReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_MIN_DAYS * MS_PER_DAY);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MAX_DAYS * MS_PER_DAY);

  const candidates = await Enrollment.findAll({
    where: {
      status: 'active',
      expiresAt: { [Op.between]: [windowStart, windowEnd] },
      expiryReminderSentAt: null,
    },
  });

  let sent = 0;
  for (const enrollment of candidates) {
    const [course, user] = await Promise.all([Course.findByPk(enrollment.courseId), User.findByPk(enrollment.userId)]);
    if (!user) continue; // defensive only -- fk_e_user guarantees this in practice

    const courseTitle = course?.title ?? `course #${enrollment.courseId}`;
    const daysRemaining = Math.max(0, Math.round((new Date(enrollment.expiresAt).getTime() - now.getTime()) / MS_PER_DAY));
    const expiryDateStr = new Date(enrollment.expiresAt).toISOString().slice(0, 10);

    // `/courses/:id` (numeric) LOOKS like a valid route (registered in
    // App.tsx) but does NOT actually work — services/publicService.js
    // #getCourseBySlug queries `WHERE slug = ?` only, never by numeric id, so
    // a numeric-id link 404s server-side and CourseDetailPage.tsx's
    // catch-block falls back to showing an unrelated MOCK_COURSES entry (a
    // real, pre-existing bug found while building this task, out of THIS
    // task's scope to fix at the route/page level — see DECISIONS.md
    // 2026-08-05). Link by the course's real SLUG instead, which resolves
    // correctly; fall back to the course list page if the course row is
    // somehow unavailable (defensive only, per the `!user` guard above).
    const courseLink = course?.slug ? `/courses/${course.slug}` : '/courses';

    await Notification.create({
      userId: enrollment.userId,
      type: 'enrollment_expiring_soon',
      title: 'Your enrollment is expiring soon',
      body: `Your access to "${courseTitle}" expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (on ${expiryDateStr}). Renew to keep your access.`,
      link: courseLink,
      isRead: false,
    });

    if (user.email) {
      await sendMail(enrollmentExpiringReminderTemplate({ user, courseTitle, daysRemaining, expiryDateStr }));
    }

    enrollment.expiryReminderSentAt = now;
    await enrollment.save();
    sent += 1;
  }

  logger.info(
    `[cron] sendExpiringReminders: ${candidates.length} candidate(s) in the ${REMINDER_WINDOW_MIN_DAYS}-${REMINDER_WINDOW_MAX_DAYS}-day window, ${sent} reminder(s) sent.`
  );
  return { sent };
}

export default { expireStaleEnrollments, sendExpiringReminders };
