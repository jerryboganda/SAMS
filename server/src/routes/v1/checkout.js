// server/src/routes/v1/checkout.js
// Mounts POST /checkout/quote, POST /checkout/orders (role S) and
// GET /checkout/return/:gateway (role P — browser payment-gateway return
// URL, never behind auth) per docs/04_API_SPEC.md §5. Layering: routes ->
// controllers -> services -> models (CLAUDE.md §4).
import { Router } from 'express';
import auth from '../../middleware/auth.js';
import deviceCheck from '../../middleware/deviceCheck.js';
import requireRole from '../../middleware/requireRole.js';
import * as checkoutController from '../../controllers/checkoutController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.post('/quote', ...requireStudent, checkoutController.quote);
router.post('/orders', ...requireStudent, checkoutController.createOrder);
router.get('/return/:gateway', checkoutController.handleReturn);

export default router;
