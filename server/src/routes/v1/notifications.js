// server/src/routes/v1/notifications.js
// GET /notifications, POST /notifications/read (docs/07_EXECUTION_PLAN.md
// 10.3, docs/04_API_SPEC.md). Layering: routes -> controllers -> services ->
// models (CLAUDE.md §4).
import { Router } from 'express';
import auth from '../../middleware/auth.js';
import deviceCheck from '../../middleware/deviceCheck.js';
import requireRole from '../../middleware/requireRole.js';
import * as notificationController from '../../controllers/notificationController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.get('/', ...requireStudent, notificationController.listNotifications);
router.post('/read', ...requireStudent, notificationController.markRead);

export default router;
