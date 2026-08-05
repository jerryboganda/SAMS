// server/src/routes/v1/admin/students.js
// GET /admin/students(+/:id, +/:id/devices, +/:id/login-events, +/:id/orders,
// +/:id/enrollments), PATCH /admin/students/:id/status, POST
// /admin/students/:id/reset-devices, POST /admin/students/:id/enrollments
// (docs/07_EXECUTION_PLAN.md Phase 11.2, docs/04_API_SPEC.md §7 "Students").
// auth/deviceCheck/requireRole('admin') applied once at
// routes/v1/admin/index.js — every mutating route here additionally gets
// `audit(...)` (CLAUDE.md §6: "audit-log every admin mutation"), wiring
// copied from routes/v1/admin/orders.js's/coupons.js's own audit(...) usage.
import { Router } from 'express';
import * as adminStudentController from '../../../controllers/adminStudentController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/students', adminStudentController.listStudents);
router.get('/students/:id', adminStudentController.getStudent);

router.patch(
  '/students/:id/status',
  audit('student.update_status', 'User', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Set student #${req.params.id} status to "${req.body?.status}"`,
  }),
  adminStudentController.updateStatus
);

router.get('/students/:id/devices', adminStudentController.listDevices);

// THE Phase 11.2 acceptance criterion: deactivates all devices + revokes
// refresh tokens for this student (services/adminStudentService.js#resetDevicesForStudent),
// then audit-logs the action.
router.post(
  '/students/:id/reset-devices',
  audit('student.reset_devices', 'User', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Reset all device slots and revoked sessions for student #${req.params.id}`,
  }),
  adminStudentController.resetDevices
);

// docs/10_SECURITY_CHECKLIST.md §I — right-to-be-forgotten: scrubs PII
// (email->hash, name->"Deleted user") + permanently disables the account
// (unusable password, all devices/sessions killed) while preserving every
// Order/Enrollment/AuditLog/TestSession row (financial/audit history intact
// per the checklist's own wording). Phase 12.5 security-audit finding M-3.
router.post(
  '/students/:id/anonymize',
  audit('student.anonymize', 'User', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Anonymized student #${req.params.id} (PII scrubbed, account permanently disabled).`,
  }),
  adminStudentController.anonymize
);

router.get('/students/:id/login-events', adminStudentController.listLoginEvents);
router.get('/students/:id/orders', adminStudentController.listOrders);
router.get('/students/:id/enrollments', adminStudentController.listEnrollments);

router.post(
  '/students/:id/enrollments',
  audit('enrollment.grant', 'Enrollment', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req) =>
      `Granted a ${req.body?.days}-day manual enrollment in course #${req.body?.courseId} to student #${req.params.id}`,
  }),
  adminStudentController.grantEnrollment
);

export default router;
