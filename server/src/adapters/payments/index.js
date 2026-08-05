// server/src/adapters/payments/index.js
// PaymentGateway factory (docs/02_ARCHITECTURE.md §7, docs/07_EXECUTION_PLAN.md
// 9.2). Mirrors server/src/adapters/video/index.js's factory SHAPE, with one
// structural difference driven by the domain: video has exactly ONE active
// provider at a time (env.VIDEO_PROVIDER, resolved once at import time), but
// payments can have MANY gateways enabled simultaneously
// (env.PAYMENTS_ENABLED_GATEWAYS is a comma list — a student picks one per
// order). So this factory is keyed by gateway CODE per call
// (getPaymentGateway(code)), not resolved once at import time, and there is
// no single top-level default export the way the video adapter has one.
//
// ---------------------------------------------------------------------------
// Driver contract every PaymentGateway driver must implement (this task:
// mock.js only — jazzcash/easypaisa/raast/bank_transfer/payfast/safepay are
// separate follow-up tasks, docs/07_EXECUTION_PLAN.md 9.3-9.6/9.5b):
//
//   code            - the gateway code string; must equal its own key in
//                      DRIVERS below (e.g. 'jazzcash').
//   isConfigured()  - SYNC, no I/O: true iff this driver has everything it
//                      needs to actually run (required env secrets present,
//                      etc). The `mock` driver needs zero credentials, so
//                      always returns true. A placeholder stub (payfast/
//                      safepay, task 9.5b) should return false until real
//                      keys are filled in — that is what makes an unconfigured
//                      placeholder correctly report GATEWAY_NOT_CONFIGURED
//                      even once someone adds its code to
//                      PAYMENTS_ENABLED_GATEWAYS by mistake.
//   createCheckout(order) - async -> { redirectUrl } (hosted-checkout
//                      redirect flow: JazzCash/EasyPaisa/PayFast/Safepay/
//                      mock) OR { manualDetails, orderId } (manual
//                      proof-upload flow: bank_transfer/raast — manualDetails
//                      shape TBD by 9.5/9.6, not used by this task's mock
//                      driver).
//   handleCallback(req)   - async -> verifies signature/hash against the raw
//                      request (query for a browser GET return, body for a
//                      POST IPN/webhook — a driver should accept whichever
//                      the calling route actually has), returns:
//                        {
//                          orderRef,        // OUR order id/ref, exactly as
//                                            // WE embedded it during
//                                            // createCheckout (never the
//                                            // gateway's own id — that is
//                                            // externalRef below). string
//                                            // or null if it couldn't even
//                                            // be recovered from the request.
//                          status,          // 'success' | 'failed'
//                          externalRef,     // the GATEWAY's own transaction/
//                                            // reference id (idempotency key
//                                            // component alongside `gateway`)
//                          signatureValid,  // boolean — was the callback's
//                                            // signature/hash cryptographically
//                                            // verified? NEVER assume true.
//                          raw,             // the raw payload actually
//                                            // received (query or body),
//                                            // stored verbatim on the
//                                            // payment_events row this
//                                            // produces
//                          eventType,       // optional — payment_events.event_type
//                                            // override (defaults are derived
//                                            // from `status` by the caller)
//                        }
//                      A driver must NEVER throw merely because a signature
//                      failed to verify — return signatureValid:false so the
//                      caller can log the attempt to payment_events and
//                      respond safely (every route calling this must be able
//                      to always answer the gateway/browser gracefully). It
//                      MAY throw for a genuinely malformed/unroutable request
//                      the driver cannot make any sense of at all.
//
// "Enabled but not configured" contract (documented ONCE here so the 9.3-
// 9.6/9.5b follow-up tasks implement against the SAME rule instead of each
// reinventing it):
//   - A gateway code with NO registered driver in DRIVERS at all, OR one
//     that IS registered but is NOT listed in env.PAYMENTS_ENABLED_GATEWAYS
//     -> "not enabled at all" -> 422 GATEWAY_NOT_CONFIGURED (one generic
//     message either way — no reason to leak to a client which gateway
//     codes almost exist in this build).
//   - A gateway code that IS registered AND IS listed in
//     PAYMENTS_ENABLED_GATEWAYS, but whose driver.isConfigured() returns
//     false (missing required env secrets) -> "enabled but not configured"
//     -> ALSO 422 GATEWAY_NOT_CONFIGURED, same status/code. The distinction
//     between these two cases matters for HOW a future driver author
//     implements isConfigured() (e.g. "did an admin/ops person turn this on
//     in PAYMENTS_ENABLED_GATEWAYS without also filling in its secrets?"),
//     not for what the client observes.
// ---------------------------------------------------------------------------
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import mockGateway from './mock.js';
import jazzcashGateway from './jazzcash.js';
import easypaisaGateway from './easypaisa.js';
import raastGateway from './raast.js';
import bankTransferGateway from './bankTransfer.js';
import payfastGateway from './payfast.js';
import safepayGateway from './safepay.js';

const DRIVERS = {
  mock: mockGateway,
  jazzcash: jazzcashGateway, // docs/07_EXECUTION_PLAN.md 9.3
  easypaisa: easypaisaGateway, // docs/07_EXECUTION_PLAN.md 9.4
  // Manual pseudo-gateways (docs/07_EXECUTION_PLAN.md 9.5/9.6): Settings-
  // sourced `manualDetails` + proof upload + shared admin approval queue
  // (server/src/services/manualPaymentService.js). Each driver's own file
  // leaves a commented-out slot for a FUTURE direct API driver, per
  // docs/02_ARCHITECTURE.md §7.
  raast: raastGateway,
  bank_transfer: bankTransferGateway,
  // PLACEHOLDER stubs only (docs/07_EXECUTION_PLAN.md 9.5b) — genuinely
  // non-functional until a real integration replaces them; isConfigured()
  // returns false until real env keys are set. See each file's own header.
  payfast: payfastGateway,
  safepay: safepayGateway,
};

/** Parses env.PAYMENTS_ENABLED_GATEWAYS (comma list, e.g. "jazzcash,easypaisa,mock") into a trimmed, non-empty array. */
export function getEnabledGatewayCodes() {
  return env.PAYMENTS_ENABLED_GATEWAYS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True iff `code` is registered AND enabled AND (if it declares one) reports itself configured. Never throws. */
export function isGatewayAvailable(code) {
  const driver = DRIVERS[code];
  if (!driver) return false;
  if (!getEnabledGatewayCodes().includes(code)) return false;
  if (typeof driver.isConfigured === 'function' && !driver.isConfigured()) return false;
  return true;
}

/** Resolves a PaymentGateway driver by code, or throws 422 GATEWAY_NOT_CONFIGURED (see the contract note above for the two cases this covers). */
export function getPaymentGateway(code) {
  if (!isGatewayAvailable(code)) {
    throw new ApiError(422, 'GATEWAY_NOT_CONFIGURED', `Payment gateway "${code}" is not available.`);
  }
  return DRIVERS[code];
}

export default { getPaymentGateway, isGatewayAvailable, getEnabledGatewayCodes };
