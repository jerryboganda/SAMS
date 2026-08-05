// server/src/routes/v1/admin/taxonomy.js
// Mounts /admin/taxonomy (GET) + nested /admin/taxonomy/subjects[/:id],
// /admin/taxonomy/systems[/:id] CRUD (docs/07_EXECUTION_PLAN.md Phase
// 11.3) — route paths confirmed against client/src/api/endpoints/admin.ts's
// real call sites (see services/adminTaxonomyService.js's header comment).
// auth/deviceCheck/requireRole('admin') are applied once at
// routes/v1/admin/index.js — every mutating route here additionally gets
// `audit(...)` (CLAUDE.md §6: "audit-log every admin mutation",
// non-negotiable), mirroring routes/v1/admin/coupons.js's pattern exactly.
import { Router } from 'express';
import * as adminTaxonomyController from '../../../controllers/adminTaxonomyController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/taxonomy', adminTaxonomyController.getTaxonomy);

// --- Subjects ------------------------------------------------------------
router.post(
  '/taxonomy/subjects',
  audit('subject.create', 'subject', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created subject "${body?.data?.name ?? ''}"`,
  }),
  adminTaxonomyController.createSubject
);

router.patch(
  '/taxonomy/subjects/:id',
  audit('subject.update', 'subject', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Updated subject #${req.params.id}${body?.data?.name ? ` (${body.data.name})` : ''}`,
  }),
  adminTaxonomyController.updateSubject
);

router.delete(
  '/taxonomy/subjects/:id',
  audit('subject.delete', 'subject', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted subject #${req.params.id}`,
  }),
  adminTaxonomyController.deleteSubject
);

// --- Systems ---------------------------------------------------------------
router.post(
  '/taxonomy/systems',
  audit('system.create', 'system', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created system "${body?.data?.name ?? ''}"`,
  }),
  adminTaxonomyController.createSystem
);

router.patch(
  '/taxonomy/systems/:id',
  audit('system.update', 'system', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Updated system #${req.params.id}${body?.data?.name ? ` (${body.data.name})` : ''}`,
  }),
  adminTaxonomyController.updateSystem
);

router.delete(
  '/taxonomy/systems/:id',
  audit('system.delete', 'system', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted system #${req.params.id}`,
  }),
  adminTaxonomyController.deleteSystem
);

export default router;
