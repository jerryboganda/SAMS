// server/src/controllers/checkoutController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM or adapter calls live here — see services/orderService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import { env } from '../config/env.js';
import * as orderService from '../services/orderService.js';

// --- Schemas -----------------------------------------------------------

const quoteSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  couponCode: z.string().trim().min(1).max(40).optional(),
});

// Matches the `orders.gateway` ENUM minus 'manual' (an internal-only value
// used by admin mark-paid, docs/04_API_SPEC.md §7 — never a student-chosen
// checkout gateway).
const createOrderSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  couponCode: z.string().trim().min(1).max(40).optional(),
  gateway: z.enum(['jazzcash', 'easypaisa', 'raast', 'payfast', 'safepay', 'bank_transfer', 'mock']),
});

const gatewayParamSchema = z.object({
  gateway: z.string().trim().min(1).max(30),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const quote = asyncHandler(async (req, res) => {
  const body = validateBody(quoteSchema, req.body);
  const data = await orderService.getQuoteResponse({ courseId: body.courseId, couponCode: body.couponCode });
  ok(res, data);
});

export const createOrder = asyncHandler(async (req, res) => {
  const body = validateBody(createOrderSchema, req.body);
  const data = await orderService.createOrder({
    userId: req.user.id,
    courseId: body.courseId,
    couponCode: body.couponCode,
    gateway: body.gateway,
  });
  ok(res, data, 201);
});

/**
 * GET /checkout/return/:gateway (role P — browser return URL). Deliberately
 * NEVER responds with a JSON error, even for an unknown gateway or a failed
 * verification — always ends in an HTTP redirect to the client SPA
 * (docs/04_API_SPEC.md §5: "verifies -> redirect to /order/:id/status"), the
 * same UX contract every real hosted-checkout gateway's browser-return flow
 * expects. `orderService.handleGatewayReturn` swallows its own errors and
 * best-effort recovers an order id to redirect to; `/checkout` is the
 * fallback when nothing usable could be recovered at all.
 */
export const handleReturn = asyncHandler(async (req, res) => {
  const { gateway } = validateBody(gatewayParamSchema, req.params);
  const orderId = await orderService.handleGatewayReturn(gateway, req);
  const target = orderId ? `/order/${orderId}/status` : '/checkout';
  res.redirect(`${env.APP_URL}${target}`);
});

export default { quote, createOrder, handleReturn };
