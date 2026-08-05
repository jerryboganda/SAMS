// server/src/controllers/paymentWebhookController.js
// POST /webhooks/payments/:gateway (role P — signature-verified IPN,
// docs/04_API_SPEC.md §5). Thin per docs/02_ARCHITECTURE.md: validate(zod)
// -> service -> respond. No SQL/ORM or adapter calls live here — see
// services/orderService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as orderService from '../services/orderService.js';

const gatewayParamSchema = z.object({ gateway: z.string().trim().min(1).max(30) });

/**
 * ALWAYS responds 200 to the gateway regardless of internal outcome — the
 * standard payment-gateway-integration convention (a non-200 response makes
 * most gateways retry-storm the same IPN). orderService.handleGatewayWebhook
 * swallows its own errors and always logs to payment_events either way, so
 * there is nothing left for this handler to branch on.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  const { gateway } = validateBody(gatewayParamSchema, req.params);
  await orderService.handleGatewayWebhook(gateway, req);
  res.status(200).json({ success: true, data: { received: true } });
});

export default { handleWebhook };
