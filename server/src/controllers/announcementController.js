// server/src/controllers/announcementController.js
// GET /announcements (student-facing, read only). Thin per
// docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No SQL/ORM
// calls live here — see services/announcementService.js.
import { asyncHandler } from '../utils/asyncHandler.js';
import * as announcementService from '../services/announcementService.js';

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const listAnnouncements = asyncHandler(async (req, res) => {
  const data = await announcementService.listAnnouncementsForStudent(req.user.id);
  ok(res, data);
});

export default { listAnnouncements };
