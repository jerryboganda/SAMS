// server/src/controllers/adminDashboardController.js
// Thin per docs/02_ARCHITECTURE.md: service -> respond. No SQL/ORM calls
// live here — see services/adminDashboardService.js. auth/deviceCheck/
// requireRole('admin') applied at routes/v1/admin/index.js. Mirrors
// controllers/adminOrderController.js's thin `ok(res,data,status=200)` style
// exactly (no zod input to validate — GET /admin/dashboard takes no params).
import { asyncHandler } from '../utils/asyncHandler.js';
import * as adminDashboardService from '../services/adminDashboardService.js';

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await adminDashboardService.getDashboardKPIs();
  ok(res, data);
});

export default { getDashboard };
