// server/src/routes/v1/admin/dashboard.js
// GET /admin/dashboard (docs/07_EXECUTION_PLAN.md 11.1, docs/04_API_SPEC.md
// §7). auth/deviceCheck/requireRole('admin') applied once at
// routes/v1/admin/index.js. Read-only — no `audit(...)` wiring needed
// (task brief: "GET-only, no audit(...) needed — read-only").
import { Router } from 'express';
import * as adminDashboardController from '../../../controllers/adminDashboardController.js';

const router = Router();

router.get('/dashboard', adminDashboardController.getDashboard);

export default router;
