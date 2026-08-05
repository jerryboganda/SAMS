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

export default router;
