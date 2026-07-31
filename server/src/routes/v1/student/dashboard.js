// server/src/routes/v1/student/dashboard.js
// GET /student/dashboard (docs/04_API_SPEC.md §3, docs/07_EXECUTION_PLAN.md
// 6.1). Role S only, standard `auth -> deviceCheck -> requireRole('student')`
// chain — unlike lectures.js's /play route, there is no anonymous path here.
import { Router } from 'express';
import auth from '../../../middleware/auth.js';
import deviceCheck from '../../../middleware/deviceCheck.js';
import requireRole from '../../../middleware/requireRole.js';
import * as studentDashboardController from '../../../controllers/studentDashboardController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.get('/dashboard', ...requireStudent, studentDashboardController.getDashboard);

export default router;
