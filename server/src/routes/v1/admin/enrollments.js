// server/src/routes/v1/admin/enrollments.js
// PATCH /admin/enrollments/:id — extend/revoke a student's course enrollment
// (docs/07_EXECUTION_PLAN.md Phase 11.2, docs/04_API_SPEC.md §7's exact
// documented shape: "PATCH /admin/enrollments/:id (extend/revoke)"). A
// separate top-level router (not nested under students.js) because the
// enrollment is addressed by its OWN id here, not by (studentId, courseId).
// auth/deviceCheck/requireRole('admin') applied once at
// routes/v1/admin/index.js. See adminEnrollmentController.js's header for
// why the audit write for this route is done directly in the controller
// instead of via the audit() middleware used elsewhere in this admin API.
import { Router } from 'express';
import * as adminEnrollmentController from '../../../controllers/adminEnrollmentController.js';

const router = Router();

router.patch('/enrollments/:id', adminEnrollmentController.updateEnrollment);

export default router;
