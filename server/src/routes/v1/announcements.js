// server/src/routes/v1/announcements.js
// GET /announcements (student-facing, docs/07_EXECUTION_PLAN.md 10.2,
// docs/04_API_SPEC.md). Layering: routes -> controllers -> services ->
// models (CLAUDE.md §4).
import { Router } from 'express';
import auth from '../../middleware/auth.js';
import deviceCheck from '../../middleware/deviceCheck.js';
import requireRole from '../../middleware/requireRole.js';
import * as announcementController from '../../controllers/announcementController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.get('/', ...requireStudent, announcementController.listAnnouncements);

export default router;
