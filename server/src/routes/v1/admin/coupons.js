// server/src/routes/v1/admin/coupons.js
// GET /admin/coupons, POST /admin/coupons, PATCH /admin/coupons/:id, DELETE
// /admin/coupons/:id, POST /admin/coupons/:id/toggle
// (docs/07_EXECUTION_PLAN.md 9.8, docs/04_API_SPEC.md §7 "Coupons").
// auth/deviceCheck/requireRole('admin') applied once at
// routes/v1/admin/index.js — every mutating route here additionally gets
// `audit(...)` (CLAUDE.md §6: "audit-log every admin mutation"), wiring
// copied from routes/v1/admin/courses.js's own audit(...) usage.
import { Router } from 'express';
import * as adminCouponController from '../../../controllers/adminCouponController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/coupons', adminCouponController.listCoupons);

router.post(
  '/coupons',
  audit('coupon.create', 'coupon', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created coupon "${body?.data?.code ?? ''}"`,
  }),
  adminCouponController.createCoupon
);

router.patch(
  '/coupons/:id',
  audit('coupon.update', 'coupon', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Updated coupon #${req.params.id}${body?.data?.code ? ` (${body.data.code})` : ''}`,
  }),
  adminCouponController.updateCoupon
);

router.delete(
  '/coupons/:id',
  audit('coupon.delete', 'coupon', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted coupon #${req.params.id}`,
  }),
  adminCouponController.deleteCoupon
);

router.post(
  '/coupons/:id/toggle',
  audit('coupon.toggle', 'coupon', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Toggled coupon #${req.params.id}, isActive=${body?.data?.isActive}`,
  }),
  adminCouponController.toggleCoupon
);

export default router;
