// server/src/controllers/adminAnnouncementController.js
// GET/POST /admin/announcements, DELETE /admin/announcements/:id
// (docs/07_EXECUTION_PLAN.md 10.2). Thin per docs/02_ARCHITECTURE.md:
// validate(zod) -> service -> respond. No SQL/ORM calls live here — see
// services/announcementService.js. auth/deviceCheck/requireRole('admin')
// applied at routes/v1/admin/index.js; audit() applied per-route at
// routes/v1/admin/announcements.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as announcementService from '../services/announcementService.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1),
    audience: z.enum(['all', 'course']),
    courseId: z.coerce.number().int().positive().optional().nullable(),
    sendEmail: z.coerce.boolean().optional().default(false),
  })
  .refine((d) => d.audience !== 'course' || !!d.courseId, {
    message: 'courseId is required when audience is "course".',
    path: ['courseId'],
  });

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const listAnnouncements = asyncHandler(async (req, res) => {
  const data = await announcementService.listAnnouncementsAdmin();
  ok(res, data);
});

/**
 * `createdBy` is NEVER read from `req.body` — the frontend's own
 * createAnnouncement() call sends a display-name string (e.g. "Dr. Zabih
 * Ullah (Admin)") in its payload purely for its own optimistic-UI update.
 * Identity is always derived from the authenticated session (`req.user.id`)
 * so a client can never spoof who broadcast an announcement.
 */
export const createAnnouncement = asyncHandler(async (req, res) => {
  const body = validateBody(createSchema, req.body);
  const data = await announcementService.createAnnouncementAdmin({ ...body, createdBy: req.user.id });
  ok(res, data, 201);
});

export const deleteAnnouncement = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await announcementService.deleteAnnouncementAdmin(id);
  ok(res, { success: true });
});

export default { listAnnouncements, createAnnouncement, deleteAnnouncement };
