// server/src/controllers/notificationController.js
// GET /notifications, POST /notifications/read (docs/04_API_SPEC.md,
// docs/07_EXECUTION_PLAN.md 10.3). Thin per docs/02_ARCHITECTURE.md:
// validate(zod) -> service -> respond. No SQL/ORM calls live here — see
// services/notificationService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as notificationService from '../services/notificationService.js';

// --- Schemas -----------------------------------------------------------

const markReadSchema = z
  .object({
    ids: z.array(z.coerce.number().int().positive()).optional(),
    all: z.boolean().optional(),
  })
  .refine((d) => d.all === true || (Array.isArray(d.ids) && d.ids.length > 0), {
    message: 'Provide ids[] (non-empty) or all:true.',
  });

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const listNotifications = asyncHandler(async (req, res) => {
  const unread = req.query.unread === '1' || req.query.unread === 'true';
  const data = await notificationService.listNotificationsForUser(req.user.id, { unread });
  ok(res, data);
});

export const markRead = asyncHandler(async (req, res) => {
  const body = validateBody(markReadSchema, req.body);
  const data = await notificationService.markNotificationsRead(req.user.id, body);
  ok(res, data);
});

export default { listNotifications, markRead };
