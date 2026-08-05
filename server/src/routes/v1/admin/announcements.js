// server/src/routes/v1/admin/announcements.js
// GET /admin/announcements, POST /admin/announcements, DELETE
// /admin/announcements/:id (docs/07_EXECUTION_PLAN.md 10.2,
// docs/04_API_SPEC.md §7 "Announcements"). auth/deviceCheck/
// requireRole('admin') applied once at routes/v1/admin/index.js — every
// mutating route here additionally gets `audit(...)` (CLAUDE.md §6:
// "audit-log every admin mutation"), wiring copied from
// routes/v1/admin/coupons.js's own audit(...) usage.
import { Router } from 'express';
import * as adminAnnouncementController from '../../../controllers/adminAnnouncementController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/announcements', adminAnnouncementController.listAnnouncements);

router.post(
  '/announcements',
  audit('announcement.create', 'announcement', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) =>
      `Broadcasted announcement "${body?.data?.title ?? ''}" to ${
        body?.data?.audience === 'all' ? 'all enrolled students' : `course #${body?.data?.courseId}`
      }${body?.data?.sendEmail ? ' (+ email blast)' : ''}`,
  }),
  adminAnnouncementController.createAnnouncement
);

router.delete(
  '/announcements/:id',
  audit('announcement.delete', 'announcement', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted announcement #${req.params.id}`,
  }),
  adminAnnouncementController.deleteAnnouncement
);

export default router;
