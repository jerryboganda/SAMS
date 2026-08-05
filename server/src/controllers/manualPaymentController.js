// server/src/controllers/manualPaymentController.js
// POST /checkout/uploads/proof-image, POST /checkout/orders/:id/bank-proof
// (role S — docs/07_EXECUTION_PLAN.md 9.5/9.6, docs/04_API_SPEC.md §5).
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/manualPaymentService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as manualPaymentService from '../services/manualPaymentService.js';

// --- Schemas -----------------------------------------------------------

// `orderId` arrives as a multipart TEXT field alongside the `file` field
// (multer populates non-file fields into req.body too) — the frontend
// already has the order id at this point in the real UX (the order was just
// created moments earlier by POST /checkout/orders, which is what surfaced
// the manualDetails/instructions the student is now acting on). See
// services/manualPaymentService.js's own file header for the full
// upload->order-linkage design.
const uploadBodySchema = z.object({
  orderId: z.coerce.number().int().positive(),
});

// referenceNo <= 120 chars matches bank_transfer_proofs.reference_no
// VARCHAR(120); note <= 300 chars matches .note VARCHAR(300)
// (docs/03_DATABASE_SCHEMA.md). fileUrl is re-verified against the real
// upload, never blindly trusted — see manualPaymentService.js#submitBankProof.
const bankProofBodySchema = z.object({
  referenceNo: z.string().trim().min(1, 'Reference number is required.').max(120),
  note: z.string().trim().max(300).optional(),
  fileUrl: z.string().trim().min(1, 'fileUrl is required.').max(300),
});

const orderIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

/** POST /checkout/uploads/proof-image (role S, multipart `file` field + `orderId` field). */
export const uploadProofImage = asyncHandler(async (req, res) => {
  const { orderId } = validateBody(uploadBodySchema, req.body);
  const data = await manualPaymentService.uploadProofImage({ file: req.file, orderId, userId: req.user.id });
  ok(res, data, 201);
});

/** POST /checkout/orders/:id/bank-proof (role S, owner-only). */
export const submitBankProof = asyncHandler(async (req, res) => {
  const { id } = validateBody(orderIdParamSchema, req.params);
  const { referenceNo, note, fileUrl } = validateBody(bankProofBodySchema, req.body);
  const data = await manualPaymentService.submitBankProof({ orderId: id, userId: req.user.id, referenceNo, note, fileUrl });
  ok(res, data);
});

export default { uploadProofImage, submitBankProof };
