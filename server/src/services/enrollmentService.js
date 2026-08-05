// server/src/services/enrollmentService.js
// MINIMAL enrollment service for docs/07_EXECUTION_PLAN.md 9.2 — only the
// "create an active enrollment from a paid order" piece the shared
// payment-success path needs. The full enrollment LIFECYCLE (daily expiry
// cron that flips `status: 'active' -> 'expired'`, 7-day-expiring reminder
// notifications) is built separately in services/enrollmentLifecycleService.js
// (Phase 9.9) — see that file's header.
import db from '../models/index.js';

const { Enrollment } = db;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Creates a fresh `status: 'active'` enrollment for `order.userId` in
 * `order.courseId`, `starts_at = now`, `expires_at = now + course.validityDays`.
 * Must be called with an already-open Sequelize `transaction` (the caller —
 * orderService.js's completeOrderPayment — already holds the order row lock
 * for this same transaction).
 *
 * `enrollments` enforces `UNIQUE (user_id, course_id, active_slot)`, where
 * `active_slot` is a generated column that's non-NULL (`1`) only when
 * `status='active'` — i.e. at most one `status='active'` row per
 * (user, course) at a time, while any number of historical `expired`/
 * `revoked` rows for the same pair are allowed (docs/03_DATABASE_SCHEMA.md;
 * migration 20260101000035-fix-enrollment-active-unique-and-reminder-column.cjs
 * fixed this from an originally-too-strict plain `UNIQUE(user_id, course_id,
 * status)` that could only ever tolerate ONE repurchase-after-expiry cycle
 * per (user, course) — see DECISIONS.md 2026-08-05 for the full writeup).
 * orderService's ALREADY_ENROLLED gate already refuses to create a new ORDER
 * for a course the user is CURRENTLY (date-unexpired) actively enrolled in,
 * so the only way a `status='active'` row can still be sitting here for this
 * (user, course) pair is a past enrollment whose `expires_at` has already
 * passed but whose `status` column hasn't been flipped to `'expired'` yet —
 * normally jobs/enrollmentLifecycleCron.js's nightly job, or a small window
 * before it next runs. Repurchasing a course after its enrollment has
 * expired must still work immediately (not just after the next cron run),
 * so this function narrowly (NOT a general lifecycle implementation — just
 * enough to not violate the unique constraint on a legitimate repurchase)
 * flips that specific stale row to `'expired'` first.
 *
 * Concurrent-double-purchase race: if the caller (orderService.js's
 * completeOrderPayment) is racing ANOTHER in-flight completion for the same
 * (user, course) — two separate pending orders for the same course, both
 * completing payment nearly simultaneously — the `Enrollment.create()` below
 * can lose a race to the unique index and throw
 * `SequelizeUniqueConstraintError`. This function deliberately does NOT
 * catch that itself — see orderService.js#completeOrderPayment's own doc
 * comment for where and why that specific race is caught (this function
 * stays a simple, honest "create or throw" building block; the
 * race-tolerance policy decision belongs to the caller that knows about the
 * order/payment/coupon side effects around it).
 */
export async function createEnrollmentFromOrder({ order, course, transaction }) {
  const now = new Date();
  const validityDays = course?.validityDays ?? 180;
  const expiresAt = new Date(now.getTime() + validityDays * MS_PER_DAY);

  await Enrollment.update(
    { status: 'expired' },
    { where: { userId: order.userId, courseId: order.courseId, status: 'active' }, transaction }
  );

  return Enrollment.create(
    {
      userId: order.userId,
      courseId: order.courseId,
      orderId: order.id,
      source: 'purchase',
      startsAt: now,
      expiresAt,
      status: 'active',
    },
    { transaction }
  );
}

export default { createEnrollmentFromOrder };
