// server/src/routes/v1/admin/auditLogs.js
// GET /admin/audit-logs (docs/07_EXECUTION_PLAN.md 11.5, docs/04_API_SPEC.md
// §7). auth/deviceCheck/requireRole('admin') applied once at
// routes/v1/admin/index.js. Read-only — no `audit(...)` wiring (task brief:
// "reading audit logs isn't itself an auditable mutation").
import { Router } from 'express';
import * as adminAuditLogController from '../../../controllers/adminAuditLogController.js';

const router = Router();

router.get('/audit-logs', adminAuditLogController.listAuditLogs);

export default router;
