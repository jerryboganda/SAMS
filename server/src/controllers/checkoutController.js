// server/src/controllers/checkoutController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM or adapter calls live here — see services/orderService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import { env } from '../config/env.js';
import * as orderService from '../services/orderService.js';
import { isGatewayAvailable } from '../adapters/payments/index.js';

// Every gateway CODE this deployment could ever route a checkout to (mirrors
// `DRIVERS` in adapters/payments/index.js) — used only to build the
// GET /checkout/gateways listing below, never to bypass
// isGatewayAvailable()'s own enabled+configured gate.
const ALL_GATEWAY_CODES = ['jazzcash', 'easypaisa', 'raast', 'payfast', 'safepay', 'bank_transfer', 'mock'];

// Human-readable labels for the gateway picker UI — purely cosmetic, kept
// here (not in the adapter layer) since adapters/payments/index.js is a
// backend-only factory with no UI-facing concerns (docs/02_ARCHITECTURE.md §7).
const GATEWAY_NAMES = {
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
  raast: 'Raast',
  payfast: 'PayFast',
  safepay: 'Safepay',
  bank_transfer: 'Bank Transfer',
  mock: 'Mock (Dev)',
};

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

/**
 * GET /checkout/gateways (role S, docs/07_EXECUTION_PLAN.md 9.7 — new,
 * genuinely undocumented-until-now endpoint; see DECISIONS.md 2026-08-05 and
 * docs/04_API_SPEC.md §5). Replaces CheckoutPage.tsx's previously-hardcoded
 * `gatewayConfigs` array with the REAL enabled/configured state, reusing
 * `isGatewayAvailable()` from adapters/payments/index.js directly — no new
 * service, this is a thin one-liner-per-code list comprehension.
 */
export const listGateways = asyncHandler(async (req, res) => {
  const data = ALL_GATEWAY_CODES.map((code) => ({
    code,
    name: GATEWAY_NAMES[code] ?? code,
    enabled: isGatewayAvailable(code),
  }));
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

export default { listGateways, quote, createOrder, handleReturn };
