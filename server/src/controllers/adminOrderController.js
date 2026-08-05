// server/src/controllers/adminOrderController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/adminOrderService.js.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js;
// audit() applied per-route at routes/v1/admin/orders.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminOrderService from '../services/adminOrderService.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

// "reason required" per CLAUDE.md's admin-mutation convention (task brief) —
// non-empty after trim, capped at a reasonable length. The frontend
// (OrdersManagementPage.tsx) always sends a non-empty string (defaults to a
// placeholder if the admin leaves the field blank), but the backend must not
// assume that — it validates independently.
const reasonBodySchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required.').max(500, 'Reason must be 500 characters or fewer.'),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const listOrders = asyncHandler(async (req, res) => {
  const data = await adminOrderService.listAllOrders();
  ok(res, data);
});

export const getOrder = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminOrderService.getOrderByIdForAdmin(id);
  ok(res, data);
});

export const getPaymentEvents = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminOrderService.getPaymentEventsForOrder(id);
  ok(res, data);
});

export const markPaid = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { reason } = validateBody(reasonBodySchema, req.body);
  const data = await adminOrderService.markOrderPaid({ orderId: id, reason, adminUserId: req.user.id });
  ok(res, data);
});

export const refundFlag = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { reason } = validateBody(reasonBodySchema, req.body);
  const data = await adminOrderService.refundFlagOrder({ orderId: id, reason, adminUserId: req.user.id });
  ok(res, data);
});

export default { listOrders, getOrder, getPaymentEvents, markPaid, refundFlag };
