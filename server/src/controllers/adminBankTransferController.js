// server/src/controllers/adminBankTransferController.js
// GET /admin/bank-transfers, POST /admin/bank-transfers/:id/approve|reject
// (role A — docs/07_EXECUTION_PLAN.md 9.5/9.6, docs/04_API_SPEC.md §7).
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/manualPaymentService.js.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js;
// audit() applied per-route at routes/v1/admin/bankTransfers.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as manualPaymentService from '../services/manualPaymentService.js';

// --- Schemas -----------------------------------------------------------

// docs/03_DATABASE_SCHEMA.md's orders.status ENUM — the queue's `?status=`
// query accepts any of these (see manualPaymentService.js#resolveQueueOrderStatus
// for how 'pending' maps onto 'awaiting_verification'), defaulting to
// 'pending' — the only value docs/04_API_SPEC.md §7 documents.
const queueQuerySchema = z.object({
  status: z.enum(['pending', 'awaiting_verification', 'paid', 'failed', 'cancelled', 'refunded']).optional().default('pending'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const orderIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

// reason <= 300 chars matches bank_transfer_proofs.reject_reason VARCHAR(300).
const rejectBodySchema = z.object({
  reason: z.string().trim().min(1, 'A rejection reason is required.').max(300),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

/** GET /admin/bank-transfers?status=pending — the shared bank_transfer+raast manual-payment verification queue. */
export const listQueue = asyncHandler(async (req, res) => {
  const { status, page, limit } = validateBody(queueQuerySchema, req.query);
  const data = await manualPaymentService.listBankTransferQueue({ status, page, limit });
  ok(res, data);
});

/** POST /admin/bank-transfers/:id/approve — triggers the shared payment-success path (order->paid, enrollment, invoice, notification). */
export const approve = asyncHandler(async (req, res) => {
  const { id } = validateBody(orderIdParamSchema, req.params);
  const data = await manualPaymentService.approveBankTransfer({ orderId: id, adminUserId: req.user.id });
  ok(res, data);
});

/** POST /admin/bank-transfers/:id/reject {reason} — order -> failed, proof -> rejected, student notified. */
export const reject = asyncHandler(async (req, res) => {
  const { id } = validateBody(orderIdParamSchema, req.params);
  const { reason } = validateBody(rejectBodySchema, req.body);
  const data = await manualPaymentService.rejectBankTransfer({ orderId: id, adminUserId: req.user.id, reason });
  ok(res, data);
});

export default { listQueue, approve, reject };
