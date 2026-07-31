// server/src/routes/v1/admin/messages.js
// GET/PATCH contact messages. Mounted at `/admin/messages` (not the API
// spec's literal `/admin/contact-messages` shorthand) to match the
// already-built client/src/pages/admin/MessagesManagementPage.tsx +
// client/src/api/endpoints/admin.ts's real `getContactMessages()`/
// `updateContactMessageStatus()` calls exactly — see DECISIONS.md
// (CLAUDE.md §1a: prefer the built frontend's real contract over the spec's
// shorthand naming). auth/deviceCheck/requireRole('admin') applied at
// routes/v1/admin/index.js.
import { Router } from 'express';
import * as adminContentController from '../../../controllers/adminContentController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/messages', adminContentController.listContactMessages);

router.patch(
  '/messages/:id/status',
  audit('contact_message.update_status', 'contact_message', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Set contact message #${req.params.id} status to "${body?.data?.status ?? ''}"`,
  }),
  adminContentController.updateContactMessageStatus
);

export default router;
