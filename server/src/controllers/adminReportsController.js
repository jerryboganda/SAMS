// server/src/controllers/adminReportsController.js
// Thin per docs/02_ARCHITECTURE.md: service -> respond. No SQL/ORM calls
// live here — see services/adminReportsService.js. auth/deviceCheck/
// requireRole('admin') applied at routes/v1/admin/index.js. Mirrors
// controllers/adminOrderController.js's thin `ok(res,data,status=200)` style
// exactly (no zod input to validate — GET /admin/reports takes no params,
// see adminReportsService.js's own header for the documented one-combined-
// endpoint contract-drift note).
import { asyncHandler } from '../utils/asyncHandler.js';
import * as adminReportsService from '../services/adminReportsService.js';

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const getReports = asyncHandler(async (req, res) => {
  const data = await adminReportsService.getReportsData();
  ok(res, data);
});

export default { getReports };
