// server/src/routes/v1/admin/packages.js
// Admin subscription package routes (docs/04_API_SPEC.md §7 "Packages")
// All routes are protected by auth/deviceCheck/requireRole('admin') via admin/index.js.
// Every mutating action is audited via audit middleware.
import { Router } from 'express';
import * as adminPackageController from '../../../controllers/adminPackageController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/packages', adminPackageController.listPackages);

router.post(
  '/packages',
  audit('package.create', 'SubscriptionPackage', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req) => `Created subscription package "${req.body?.title}"`,
  }),
  adminPackageController.createPackage
);

router.get('/packages/:id', adminPackageController.getPackage);

router.put(
  '/packages/:id',
  audit('package.update', 'SubscriptionPackage', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Updated subscription package #${req.params.id}`,
  }),
  adminPackageController.updatePackage
);

router.patch(
  '/packages/:id',
  audit('package.update', 'SubscriptionPackage', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Updated subscription package #${req.params.id}`,
  }),
  adminPackageController.updatePackage
);

router.post(
  '/packages/:id/toggle',
  audit('package.toggle', 'SubscriptionPackage', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Toggled active state on subscription package #${req.params.id}`,
  }),
  adminPackageController.togglePackage
);

router.delete(
  '/packages/:id',
  audit('package.delete', 'SubscriptionPackage', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted subscription package #${req.params.id}`,
  }),
  adminPackageController.deletePackage
);

export default router;
