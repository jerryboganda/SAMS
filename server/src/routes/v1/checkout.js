// server/src/routes/v1/checkout.js
// Mounts GET /checkout/gateways (role S, docs/07_EXECUTION_PLAN.md 9.7),
// POST /checkout/quote, POST /checkout/orders (role S),
// GET /checkout/return/:gateway (role P — browser payment-gateway return
// URL, never behind auth), and (docs/07_EXECUTION_PLAN.md 9.5/9.6)
// POST /checkout/uploads/proof-image + POST /checkout/orders/:id/bank-proof
// (role S — the manual bank_transfer/raast proof-upload flow) per
// docs/04_API_SPEC.md §5. Layering: routes -> controllers -> services ->
// models (CLAUDE.md §4).
import { Router } from 'express';
import auth from '../../middleware/auth.js';
import deviceCheck from '../../middleware/deviceCheck.js';
import requireRole from '../../middleware/requireRole.js';
import handleImageUpload from '../../middleware/upload.js';
import { checkoutLimiter } from '../../middleware/rateLimits.js';
import * as checkoutController from '../../controllers/checkoutController.js';
import * as manualPaymentController from '../../controllers/manualPaymentController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

// docs/07_EXECUTION_PLAN.md 9.7 — real gateway-availability listing, replacing
// the checkout page's previously-hardcoded gateway config array.
router.get('/gateways', ...requireStudent, checkoutController.listGateways);
// checkoutLimiter (Phase 12.1, DECISIONS.md 2026-08-05 Finding L-2) — keyed
// by authenticated user id, on top of app.js's blanket global limiter.
router.post('/quote', ...requireStudent, checkoutLimiter, checkoutController.quote);
router.post('/orders', ...requireStudent, checkoutLimiter, checkoutController.createOrder);
router.get('/return/:gateway', checkoutController.handleReturn);

// Manual pseudo-gateway (raast/bank_transfer) proof-upload flow —
// docs/07_EXECUTION_PLAN.md 9.5/9.6. `handleImageUpload` reuses the SAME
// multer wiring POST /admin/uploads/image uses (memory storage, 5 MB cap,
// field name `file`); magic-byte validation happens in
// services/manualPaymentService.js, same as adminUploadService.js's own
// pattern.
router.post('/uploads/proof-image', ...requireStudent, handleImageUpload, manualPaymentController.uploadProofImage);
router.post('/orders/:id/bank-proof', ...requireStudent, manualPaymentController.submitBankProof);

export default router;
