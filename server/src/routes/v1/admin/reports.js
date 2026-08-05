// server/src/routes/v1/admin/reports.js
// GET /admin/reports — ONE combined endpoint (docs/07_EXECUTION_PLAN.md
// 11.5, "reports" half; see services/adminReportsService.js's header for the
// documented docs/04_API_SPEC.md §7 contract-drift note: the frontend calls
// this single combined route, not three separate `/admin/reports/*` routes).
// auth/deviceCheck/requireRole('admin') applied once at
// routes/v1/admin/index.js. Read-only — no `audit(...)` wiring needed.
import { Router } from 'express';
import * as adminReportsController from '../../../controllers/adminReportsController.js';

const router = Router();

router.get('/reports', adminReportsController.getReports);

export default router;
