// server/src/controllers/studentDashboardController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/studentDashboardService.js.
import { asyncHandler } from '../utils/asyncHandler.js';
import * as studentDashboardService from '../services/studentDashboardService.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await studentDashboardService.getDashboard(req.user.id);
  res.status(200).json({ success: true, data });
});
