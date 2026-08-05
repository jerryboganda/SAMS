// server/src/routes/v1/webhooks.js
// Mounts POST /webhooks/payments/:gateway (role P — signature-verified IPN,
// docs/04_API_SPEC.md §5). Layering: routes -> controllers -> services ->
// models (CLAUDE.md §4).
import { Router } from 'express';
import * as paymentWebhookController from '../../controllers/paymentWebhookController.js';

const router = Router();

router.post('/payments/:gateway', paymentWebhookController.handleWebhook);

export default router;
