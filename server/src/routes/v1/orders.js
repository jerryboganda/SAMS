// server/src/routes/v1/orders.js
// Mounts GET /orders (role S, my orders) and GET /orders/:id,
// GET /orders/:id/invoice.pdf (owner OR admin — docs/04_API_SPEC.md §5;
// the IDOR check itself lives in services/orderService.js, this router just
// allows BOTH roles through auth/deviceCheck so the service can decide).
// Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
import { Router } from 'express';
import auth from '../../middleware/auth.js';
import deviceCheck from '../../middleware/deviceCheck.js';
import requireRole from '../../middleware/requireRole.js';
import * as ordersController from '../../controllers/ordersController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];
const requireOwnerOrAdmin = [auth, deviceCheck, requireRole('student', 'admin')];

router.get('/', ...requireStudent, ordersController.listMyOrders);
router.get('/:id', ...requireOwnerOrAdmin, ordersController.getOrder);
router.get('/:id/invoice.pdf', ...requireOwnerOrAdmin, ordersController.downloadInvoice);
// docs/07_EXECUTION_PLAN.md 9.5/9.6 — the bank_transfer/raast payment-proof
// image, streamed only through this authenticated owner-or-admin route (see
// services/manualPaymentService.js's header for the full private-storage
// design).
router.get('/:id/proof-image', ...requireOwnerOrAdmin, ordersController.getProofImage);

export default router;
