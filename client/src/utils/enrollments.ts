// client/src/utils/enrollments.ts
//
// Pure Active/Expired split for `Enrollment[]` returned by both
// `GET /student/courses` and `GET /student/dashboard`. The real backend
// deliberately returns EVERY enrollment for the user under both endpoints —
// active AND expired (see server/src/services/studentCourseService.js's
// `getEnrollmentsWithProgress()` doc comment) — so any screen that renders
// "my enrolled courses" must apply this split itself; the API never
// pre-filters it, despite `StudentDashboardStats.activeEnrollments`'s
// confusingly-active-sounding field name.
//
// Extracted out of MyCoursesPage.tsx (which already had this exact
// two-predicate logic inline) so StudentDashboardPage.tsx's own "My Enrolled
// Courses" widget can reuse the identical rule — before this fix, that page
// rendered `stats.activeEnrollments` completely unfiltered, which (now that
// the field genuinely contains expired rows too) would have shown expired
// subscriptions on the dashboard as if they were still active. See
// DECISIONS.md's Phase 6.2-6.3 entry.
//
// The "expiring soon" (<=14 days) rule is intentionally NOT duplicated here —
// it stays purely presentational inside CourseCard.tsx (`isExpiringSoon`),
// which only needs a single already-classified-active enrollment at a time,
// not a list split.
import { Enrollment } from "../types";

/**
 * Matches MyCoursesPage.tsx's pre-existing `expiredEnrollments` predicate
 * exactly: expired either by the server's own `status`, or by a
 * client-computed `remainingDays` that has already hit zero (covers the
 * small window where `status` hasn't flipped yet but the validity date has
 * passed).
 */
export function isEnrollmentExpired(enrollment: Enrollment): boolean {
  return enrollment.status === "expired" || (enrollment.remainingDays !== undefined && enrollment.remainingDays <= 0);
}

/**
 * Matches MyCoursesPage.tsx's pre-existing `activeEnrollments` predicate
 * exactly: `status === "active"` AND not already past its `remainingDays`.
 * A `remainingDays` of `undefined` is treated as "still active" (no expiry
 * signal available yet), not as expired.
 */
export function isEnrollmentActive(enrollment: Enrollment): boolean {
  return enrollment.status === "active" && (enrollment.remainingDays === undefined || enrollment.remainingDays > 0);
}

export interface SplitEnrollments {
  active: Enrollment[];
  expired: Enrollment[];
}

/**
 * Splits a flat enrollment list into Active (incl. "expiring soon", which is
 * purely a presentational sub-state of Active — see CourseCard.tsx) and
 * Expired buckets.
 *
 * NOTE (inherited, not introduced by this function): a `status === "revoked"`
 * enrollment whose `remainingDays` is still positive (or undefined) matches
 * neither `isEnrollmentActive` nor `isEnrollmentExpired`, so it is silently
 * excluded from both buckets — this reproduces MyCoursesPage.tsx's original
 * inline filters byte-for-byte rather than introducing new "revoked" handling
 * this task didn't ask for. See enrollments.test.ts.
 */
export function splitEnrollmentsByStatus(enrollments: Enrollment[]): SplitEnrollments {
  const active: Enrollment[] = [];
  const expired: Enrollment[] = [];
  for (const enrollment of enrollments) {
    if (isEnrollmentExpired(enrollment)) {
      expired.push(enrollment);
    } else if (isEnrollmentActive(enrollment)) {
      active.push(enrollment);
    }
  }
  return { active, expired };
}
