// server/src/adapters/payments/mock.js
// PaymentGateway driver: `mock` (default per .env.example
// PAYMENTS_ENABLED_GATEWAYS=mock — docs/02_ARCHITECTURE.md §7,
// docs/07_EXECUTION_PLAN.md 9.2). Zero credentials required: `createCheckout`
// auto-succeeds with no external network call and no manual "click pay"
// step, so e2e tests/demos run green with zero real merchant accounts.
//
// Design note (mirrors a real hosted-checkout redirect flow on purpose — see
// DECISIONS.md 2026-08-01): a real gateway (JazzCash/EasyPaisa/PayFast/
// Safepay) redirects the browser to a page IT hosts, built from a signed
// payload WE construct at checkout-initiation time, then bounces the
// customer back to OUR OWN return URL after paying
// (docs/02_ARCHITECTURE.md §7's `createCheckout -> {redirectUrl}` shape).
// This driver mirrors that exact shape with zero external network calls:
// `redirectUrl` points straight at OUR OWN `GET /api/v1/checkout/return/mock`
// (the same route real drivers' browser returns hit), carrying the order id
// plus a signed token over that id — so `handleCallback` below genuinely
// VERIFIES a signature rather than blindly trusting the querystring, the
// same discipline every real driver must follow, even though there is no
// real gateway on the other end of this one.
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/** Reuses the app's existing 32-byte AES key as an HMAC-ish signing secret for this dev-only mock — see DECISIONS.md 2026-08-01 for why no dedicated MOCK_GATEWAY_SECRET env var was added for a driver that, by design, must need zero real credentials. */
function mockSigningSecret() {
  return env.APP_ENCRYPTION_KEY;
}

// Exported (not just used internally) so tests/adapters/payments/mock.test.js
// can unit-test the signature builder/verifier directly against a
// self-computed deterministic vector — same pattern as
// src/adapters/video/bunny.js's exported buildBunnyToken.
export function signMockToken(orderId) {
  return crypto.createHash('sha256').update(`${mockSigningSecret()}:mock-checkout:${orderId}`).digest('hex');
}

/** Constant-time compare — a forged token must not be distinguishable from a valid one by timing. */
export function verifyMockToken(orderId, token) {
  if (!token) return false;
  const expectedHex = signMockToken(orderId);
  const provided = Buffer.from(String(token), 'utf8');
  const expected = Buffer.from(expectedHex, 'utf8');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

const mockGateway = {
  code: 'mock',

  /** Needs zero credentials by design — always configured. */
  isConfigured() {
    return true;
  },

  /** See file header for the full design rationale. */
  async createCheckout(order) {
    const token = signMockToken(order.id);
    const redirectUrl = `${env.APP_URL}/api/v1/checkout/return/mock?orderId=${order.id}&token=${token}`;
    return { redirectUrl };
  },

  /**
   * Accepts the token from either the browser GET return (query string,
   * server/src/routes/v1/checkout.js) or a simulated POST webhook/IPN
   * (body, server/src/routes/v1/webhooks.js) — same verification either
   * way, since this pseudo-gateway has no real distinction between the two
   * delivery channels.
   */
  async handleCallback(req) {
    const orderId = req.query?.orderId ?? req.body?.orderId ?? null;
    const token = req.query?.token ?? req.body?.token ?? null;
    const raw = { orderId, token, method: req.method };

    if (!orderId || !token) {
      return {
        orderRef: orderId ? String(orderId) : null,
        status: 'failed',
        externalRef: null,
        signatureValid: false,
        raw,
        eventType: 'payment.callback.malformed',
      };
    }

    const signatureValid = verifyMockToken(orderId, token);
    return {
      orderRef: String(orderId),
      status: signatureValid ? 'success' : 'failed',
      externalRef: `mock-${orderId}`,
      signatureValid,
      raw,
      eventType: signatureValid ? 'payment.success' : 'payment.callback.invalid_signature',
    };
  },
};

export default mockGateway;
