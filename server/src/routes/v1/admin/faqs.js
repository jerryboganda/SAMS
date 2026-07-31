// server/src/routes/v1/admin/faqs.js
// Full CRUD + reorder for /admin/faqs (docs/04_API_SPEC.md §7 "Comms/Site").
// Path/shape matches client/src/api/endpoints/admin.ts's getFaqs/createFaq/
// updateFaq/deleteFaq/reorderFaqs exactly — see DECISIONS.md.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js.
import { Router } from 'express';
import * as adminContentController from '../../../controllers/adminContentController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/faqs', adminContentController.listFaqs);

router.post(
  '/faqs',
  audit('faq.create', 'faq', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created FAQ "${(body?.data?.question ?? '').slice(0, 60)}"`,
  }),
  adminContentController.createFaq
);

router.put(
  '/faqs/reorder',
  audit('faq.reorder', 'faq', {
    entityId: () => null,
    summary: () => 'Reordered FAQ display order',
  }),
  adminContentController.reorderFaqs
);

router.patch(
  '/faqs/:id',
  audit('faq.update', 'faq', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Updated FAQ #${req.params.id}`,
  }),
  adminContentController.updateFaq
);

router.delete(
  '/faqs/:id',
  audit('faq.delete', 'faq', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted FAQ #${req.params.id}`,
  }),
  adminContentController.deleteFaq
);

export default router;
