// server/src/routes/v1/admin/faculty.js
// Full CRUD + reorder for /admin/faculty (docs/04_API_SPEC.md §7 "Comms/Site").
// Path/shape matches client/src/api/endpoints/admin.ts's getFaculty/
// createFaculty/updateFaculty/deleteFaculty/reorderFaculty exactly — see
// DECISIONS.md. auth/deviceCheck/requireRole('admin') applied at
// routes/v1/admin/index.js.
import { Router } from 'express';
import * as adminContentController from '../../../controllers/adminContentController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/faculty', adminContentController.listFaculty);

router.post(
  '/faculty',
  audit('faculty.create', 'faculty', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Added faculty member "${body?.data?.name ?? ''}"`,
  }),
  adminContentController.createFaculty
);

router.put(
  '/faculty/reorder',
  audit('faculty.reorder', 'faculty', {
    entityId: () => null,
    summary: () => 'Reordered faculty roster display order',
  }),
  adminContentController.reorderFaculty
);

router.patch(
  '/faculty/:id',
  audit('faculty.update', 'faculty', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Updated faculty member #${req.params.id}`,
  }),
  adminContentController.updateFaculty
);

router.delete(
  '/faculty/:id',
  audit('faculty.delete', 'faculty', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted faculty member #${req.params.id}`,
  }),
  adminContentController.deleteFaculty
);

export default router;
