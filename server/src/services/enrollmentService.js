// server/src/services/enrollmentService.js
// MINIMAL enrollment service for docs/07_EXECUTION_PLAN.md 9.2 — only the
// "create an active enrollment from a paid order" piece the shared
// payment-success path needs. The full enrollment LIFECYCLE (daily expiry
// cron that flips `status: 'active' -> 'expired'`, 7-day-expiring reminder
// notifications) is a SEPARATE follow-up task (9.9), not built here — see
// CLAUDE.md's task brief for this phase.
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
 * `enrollments` enforces `UNIQUE (user_id, course_id, status)` — at most one
 * `status='active'` row per (user, course) at a time
 * (docs/03_DATABASE_SCHEMA.md). orderService's ALREADY_ENROLLED gate already
 * refuses to create a new ORDER for a course the user is CURRENTLY
 * (date-unexpired) actively enrolled in, so the only way a `status='active'`
 * row can still be sitting here for this (user, course) pair is a past
 * enrollment whose `expires_at` has already passed but whose `status` column
 * hasn't been flipped to `'expired'` yet — that flip is normally the daily
 * 9.9 cron's job, which doesn't exist yet. Repurchasing a course after its
 * enrollment has expired must still work today, so this function narrowly
 * (NOT a general lifecycle implementation — just enough to not violate the
 * unique constraint on a legitimate repurchase) flips that specific stale
 * row to `'expired'` first. See DECISIONS.md 2026-08-01.
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
