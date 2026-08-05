// server/src/controllers/adminAuditLogController.js
// Thin per docs/02_ARCHITECTURE.md: service -> respond. No SQL/ORM calls
// live here — see services/auditService.js#listAuditLogs. auth/deviceCheck/
// requireRole('admin') applied at routes/v1/admin/index.js. Mirrors
// controllers/adminOrderController.js's thin `ok(res,data,status=200)` style
// exactly (no zod input to validate — GET /admin/audit-logs takes no params,
// task brief).
import { asyncHandler } from '../utils/asyncHandler.js';
import { listAuditLogs as listAuditLogsService } from '../services/auditService.js';

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const listAuditLogs = asyncHandler(async (req, res) => {
  const data = await listAuditLogsService();
  ok(res, data);
});

export default { listAuditLogs };
