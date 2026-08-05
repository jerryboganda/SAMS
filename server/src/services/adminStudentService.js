// server/src/services/adminStudentService.js
// Admin student management (docs/07_EXECUTION_PLAN.md Phase 11.2,
// docs/04_API_SPEC.md §7 "Students"). Reuses shared building blocks rather
// than duplicating them: authService.js#serializeUser for the User shape,
// deviceService.js#listDevicesForUser for the devices list,
// orderService.js's ORDER_ASSOCIATIONS/serializeOrder for the orders list.
// Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
import { Op, fn, col } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { serializeUser } from './authService.js';
import { listDevicesForUser } from './deviceService.js';
import { ORDER_ASSOCIATIONS, serializeOrder } from './orderService.js';

const { User, UserDevice, RefreshToken, LoginEvent, Order, Enrollment, Course, sequelize } = db;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function assertStudentExists(id) {
  const student = await User.findOne({ where: { id, role: 'student' } });
  if (!student) {
    throw new ApiError(404, 'NOT_FOUND', 'Student not found.');
  }
  return student;
}

// ---------------------------------------------------------------------------
// GET /admin/students
// ---------------------------------------------------------------------------

/**
 * client/src/pages/admin/StudentsManagementPage.tsx calls `GET /admin/students`
 * with ZERO query params (client/src/api/endpoints/admin.ts `getStudents()`)
 * and does ALL search/status filtering client-side over the full returned
 * array — same "flat array, safety-capped, no pagination envelope"
 * precedent as services/adminOrderService.js#listAllOrders (see that file's
 * own doc comment for the full reasoning; the same tradeoff applies here,
 * this codebase's largest such list). `role='student'` only — admins must
 * never appear in this roster. Capped at 500 (this project's largest admin
 * list so far), newest-registered first.
 */
const ADMIN_STUDENTS_LIST_CAP = 500;

/**
 * `User.activeDevicesCount` (client/src/types/index.ts, optional field) is
 * NOT populated by authService.js#serializeUser — that function is shared,
 * foundational Phase 2 code (login/getMe/updateMe/changePassword all reuse
 * it) with no device-count concept and no business needing one on every
 * call. Rather than changing its signature/behavior for every caller, this
 * admin-only file layers the count on top via a SEPARATE query, merged in
 * after serialization — found live (the "Reset Devices (X/2)" header badge
 * and the roster's "Device Slots" column both silently always showed 0)
 * during this task's own end-to-end verification. One GROUPED query for the
 * whole roster (never N+1 per student).
 */
async function attachActiveDeviceCounts(serializedUsers) {
  if (serializedUsers.length === 0) return serializedUsers;
  const rows = await UserDevice.findAll({
    attributes: ['userId', [fn('COUNT', col('id')), 'activeDevicesCount']],
    where: { userId: serializedUsers.map((u) => u.id), isActive: true },
    group: ['userId'],
    raw: true,
  });
  const countByUserId = new Map(rows.map((r) => [r.userId, Number(r.activeDevicesCount) || 0]));
  return serializedUsers.map((u) => ({ ...u, activeDevicesCount: countByUserId.get(u.id) ?? 0 }));
}

export async function listAllStudents() {
  const students = await User.findAll({
    where: { role: 'student' },
    order: [['id', 'DESC']],
    limit: ADMIN_STUDENTS_LIST_CAP,
  });
  return attachActiveDeviceCounts(students.map(serializeUser));
}

// ---------------------------------------------------------------------------
// GET /admin/students/:id
// ---------------------------------------------------------------------------

/**
 * Not currently called by the wired-up page (it resolves the selected
 * student from the already-loaded full list instead) but is part of
 * docs/04_API_SPEC.md §7's contract. 404 if the id doesn't exist OR belongs
 * to a non-student (admin ids must never be reachable through this
 * student-only surface).
 */
export async function getStudentById(id) {
  const student = await assertStudentExists(id);
  const [withCount] = await attachActiveDeviceCounts([serializeUser(student)]);
  return withCount;
}

// ---------------------------------------------------------------------------
// PATCH /admin/students/:id/status
// ---------------------------------------------------------------------------

/**
 * Dedicated sub-path, NOT the more general `PATCH /admin/students/:id` the
 * spec prose describes — client/src/api/endpoints/admin.ts's
 * `updateStudentStatus()` sends only this one field
 * (`{status: "active"|"suspended"}`), and that's the contract this backend
 * matches (CLAUDE.md §1a).
 */
export async function updateStudentStatus(id, status) {
  const student = await assertStudentExists(id);
  student.status = status;
  await student.save();
  return serializeUser(student);
}

// ---------------------------------------------------------------------------
// GET /admin/students/:id/devices
// ---------------------------------------------------------------------------

/**
 * Reuses deviceService.js#listDevicesForUser as-is. Passing the ADMIN's own
 * `req` straight through is correct, not just "good enough": that function's
 * `isCurrent` flag is computed by hashing the caller's own `device_token`
 * cookie and comparing it against each listed device row's stored hash — the
 * admin's device-token cookie can never collide with one of the STUDENT's
 * device rows, so every row correctly comes back `isCurrent:false`, which is
 * exactly the right answer from an admin's point of view (there is no
 * meaningful "my current device" when looking at someone else's devices).
 */
export async function listDevicesForStudent(id, req) {
  await assertStudentExists(id);
  return listDevicesForUser(id, req);
}

// ---------------------------------------------------------------------------
// POST /admin/students/:id/reset-devices — Phase 11.2 acceptance criterion
// ---------------------------------------------------------------------------

/**
 * Deactivates every active device slot and revokes every still-live refresh
 * token for this student — mirrors authService.js#resetPassword's own "kill
 * ALL sessions, no exclusion" pattern exactly (docs/04_API_SPEC.md §7's own
 * bolded line: "deactivate all devices + revoke refresh tokens"). This is an
 * admin acting on a DIFFERENT user's session, not the admin's own —
 * `clearSessionCookies`/`res` are deliberately never touched here.
 */
export async function resetDevicesForStudent(id) {
  await assertStudentExists(id);
  await UserDevice.update({ isActive: false }, { where: { userId: id, isActive: true } });
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: id, revokedAt: null } });
  return { success: true, message: 'All device slots and active sessions have been reset for this student.' };
}

// ---------------------------------------------------------------------------
// GET /admin/students/:id/login-events
// ---------------------------------------------------------------------------

/** Matches client/src/types/index.ts's `LoginEvent` interface field-for-field. */
function serializeLoginEvent(event) {
  return {
    id: event.id,
    userId: event.userId,
    emailTried: event.emailTried ?? undefined,
    status: event.status,
    reason: event.reason ?? undefined,
    ip: event.ip ?? undefined,
    country: event.country ?? undefined,
    userAgent: event.userAgent ?? undefined,
    createdAt: event.createdAt,
  };
}

/**
 * The frontend's "suspicious" highlight is driven entirely by the existing
 * `status` ENUM value ('success'|'failed'|'blocked'|'suspicious') that
 * authService.js's login flow already writes — rows are returned exactly
 * as-is, no new "is this suspicious" computation here.
 */
export async function listLoginEventsForStudent(id) {
  await assertStudentExists(id);
  const events = await LoginEvent.findAll({ where: { userId: id }, order: [['createdAt', 'DESC']], limit: 100 });
  return events.map(serializeLoginEvent);
}

// ---------------------------------------------------------------------------
// GET /admin/students/:id/orders
// ---------------------------------------------------------------------------

/** Reuses orderService.js's exported serializeOrder/ORDER_ASSOCIATIONS — does not reimplement order serialization. */
export async function listOrdersForStudent(id) {
  await assertStudentExists(id);
  const orders = await Order.findAll({ where: { userId: id }, include: ORDER_ASSOCIATIONS, order: [['id', 'DESC']] });
  return orders.map(serializeOrder);
}

// ---------------------------------------------------------------------------
// GET /admin/students/:id/enrollments, POST .../enrollments
// ---------------------------------------------------------------------------

/** Matches client/src/types/index.ts's `Enrollment` interface's relevant subset. */
function serializeEnrollment(enrollment) {
  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    courseTitle: enrollment.course?.title ?? undefined,
    orderId: enrollment.orderId ?? undefined,
    source: enrollment.source,
    startsAt: enrollment.startsAt,
    expiresAt: enrollment.expiresAt,
    status: enrollment.status,
  };
}

/**
 * New endpoint — not yet called by the currently-wired page, built for the
 * concurrently-in-progress Enrollments-tab rebuild (task brief) to have a
 * real contract to fetch. Every enrollment row for this student, ANY status
 * (active/expired/revoked), newest-first.
 */
export async function listEnrollmentsForStudent(id) {
  await assertStudentExists(id);
  const enrollments = await Enrollment.findAll({
    where: { userId: id },
    include: [{ model: Course, as: 'course' }],
    order: [['id', 'DESC']],
  });
  return enrollments.map(serializeEnrollment);
}

/**
 * Creates a NEW `source:'manual'` enrollment. `enrollments` enforces
 * `UNIQUE(user_id, course_id, active_slot)` (only one `status='active'` row
 * per user+course at a time — see models/Enrollment.js's own doc comment),
 * so any existing active row for this EXACT (studentId, courseId) pair is
 * first flipped to `'expired'` — the same unique-constraint-safe technique
 * services/enrollmentService.js#createEnrollmentFromOrder already uses,
 * mirrored here rather than called directly (that function is
 * checkout-specific: it requires a real `order` + `course.validityDays` +
 * an already-open transaction the CALLER owns, none of which apply to an
 * admin manual grant).
 */
export async function grantEnrollment({ studentId, courseId, days, adminUserId: _adminUserId }) {
  await assertStudentExists(studentId);

  if (!Number.isInteger(days) || days <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'days must be a positive integer.');
  }

  const course = await Course.findByPk(courseId);
  if (!course) {
    throw new ApiError(404, 'NOT_FOUND', 'Course not found.');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * MS_PER_DAY);

  const created = await sequelize.transaction(async (transaction) => {
    await Enrollment.update(
      { status: 'expired' },
      { where: { userId: studentId, courseId, status: 'active' }, transaction }
    );
    return Enrollment.create(
      {
        userId: studentId,
        courseId,
        orderId: null,
        source: 'manual',
        startsAt: now,
        expiresAt,
        status: 'active',
      },
      { transaction }
    );
  });

  const fresh = await Enrollment.findOne({ where: { id: created.id }, include: [{ model: Course, as: 'course' }] });
  return serializeEnrollment(fresh);
}

// ---------------------------------------------------------------------------
// PATCH /admin/enrollments/:id — extend/revoke (routes/v1/admin/enrollments.js)
// ---------------------------------------------------------------------------

/**
 * Extends `expiresAt` by `+days` days. Extends from the enrollment's CURRENT
 * `expiresAt` when it's still in the future (pushes the real end date
 * forward, as expected) — but when the enrollment has already lapsed
 * (`status==='expired'`, or `expiresAt` is already in the past regardless of
 * the `status` column), extending from that stale past date would produce a
 * still-expired (or barely-not-expired) result for anything less than a huge
 * `days` value, which is not what an admin clicking "extend" wants. Judgment
 * call (task brief flagged this explicitly): in that case this extends from
 * `now` instead AND flips `status` back to `'active'` — access is gated on
 * `status==='active' AND expiresAt>now` everywhere else in this codebase
 * (see services/videoService.js#assertEnrolled and friends), so bumping
 * `expiresAt` on an `'expired'` row without also flipping its status back
 * would silently fail to restore access. Reactivating can collide with
 * `enrollments.uq_enr_active` if some OTHER row for this exact
 * (user, course) is currently `'active'` (e.g. the student repurchased since
 * this one lapsed) — guarded the same unique-constraint-safe way
 * `grantEnrollment` is, by flipping that other row to `'expired'` first,
 * inside the same transaction. Only allowed if not already `'revoked'`.
 */
export async function extendEnrollment({ enrollmentId, days }) {
  if (!Number.isInteger(days) || days <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'days must be a positive integer.');
  }

  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    throw new ApiError(404, 'NOT_FOUND', 'Enrollment not found.');
  }
  if (enrollment.status === 'revoked') {
    throw new ApiError(409, 'INVALID_ENROLLMENT_STATE', `Enrollment #${enrollmentId} has been revoked and cannot be extended.`);
  }

  const now = new Date();
  const isLapsed = enrollment.status === 'expired' || new Date(enrollment.expiresAt) <= now;
  const base = isLapsed ? now : new Date(enrollment.expiresAt);

  await sequelize.transaction(async (transaction) => {
    if (isLapsed) {
      await Enrollment.update(
        { status: 'expired' },
        {
          where: {
            userId: enrollment.userId,
            courseId: enrollment.courseId,
            status: 'active',
            id: { [Op.ne]: enrollment.id },
          },
          transaction,
        }
      );
      enrollment.status = 'active';
    }
    enrollment.expiresAt = new Date(base.getTime() + days * MS_PER_DAY);
    await enrollment.save({ transaction });
  });

  const fresh = await Enrollment.findOne({ where: { id: enrollment.id }, include: [{ model: Course, as: 'course' }] });
  return serializeEnrollment(fresh);
}

/**
 * `status = 'revoked'` — distinct from the passive `'expired'` the daily
 * cron sets (services/enrollmentLifecycleService.js#expireStaleEnrollments):
 * revoked is an explicit admin action, expired is just time passing. Only
 * allowed if not already `'revoked'` (409 if so).
 */
export async function revokeEnrollment(enrollmentId) {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    throw new ApiError(404, 'NOT_FOUND', 'Enrollment not found.');
  }
  if (enrollment.status === 'revoked') {
    throw new ApiError(409, 'INVALID_ENROLLMENT_STATE', `Enrollment #${enrollmentId} is already revoked.`);
  }

  enrollment.status = 'revoked';
  await enrollment.save();

  const fresh = await Enrollment.findOne({ where: { id: enrollment.id }, include: [{ model: Course, as: 'course' }] });
  return serializeEnrollment(fresh);
}

export default {
  listAllStudents,
  getStudentById,
  updateStudentStatus,
  listDevicesForStudent,
  resetDevicesForStudent,
  listLoginEventsForStudent,
  listOrdersForStudent,
  listEnrollmentsForStudent,
  grantEnrollment,
  extendEnrollment,
  revokeEnrollment,
};
