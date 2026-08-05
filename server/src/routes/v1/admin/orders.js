// server/src/routes/v1/admin/orders.js
// GET /admin/orders(+/:id, +/:id/payment-events), POST
// /admin/orders/:id/mark-paid|refund-flag (docs/07_EXECUTION_PLAN.md 9.8,
// docs/04_API_SPEC.md §7 "Orders"). auth/deviceCheck/requireRole('admin')
// applied once at routes/v1/admin/index.js — the two mutating routes here
// additionally get `audit(...)` (CLAUDE.md §6: "audit-log every admin
// mutation"), wiring copied from routes/v1/admin/courses.js's own
// audit(...) usage.
import { Router } from 'express';
import * as adminOrderController from '../../../controllers/adminOrderController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/orders', adminOrderController.listOrders);
router.get('/orders/:id', adminOrderController.getOrder);
router.get('/orders/:id/payment-events', adminOrderController.getPaymentEvents);

router.post(
  '/orders/:id/mark-paid',
  audit('order.mark_paid', 'order', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Manually marked order #${req.params.id} as PAID. Reason: "${req.body?.reason ?? ''}"`,
  }),
  adminOrderController.markPaid
);

router.post(
  '/orders/:id/refund-flag',
  audit('order.refund_flag', 'order', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Flagged order #${req.params.id} as REFUNDED. Reason: "${req.body?.reason ?? ''}"`,
  }),
  adminOrderController.refundFlag
);

export default router;
