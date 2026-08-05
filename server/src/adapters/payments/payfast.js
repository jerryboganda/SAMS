// server/src/adapters/payments/payfast.js
// PaymentGateway driver: `payfast` — PLACEHOLDER STUB ONLY
// (docs/07_EXECUTION_PLAN.md 9.5b). Per CLAUDE.md §1 / the task brief:
// "build PLACEHOLDER stubs only (interface-conformant, config-gated,
// GATEWAY_NOT_CONFIGURED when unconfigured) — do NOT attempt full
// integration in v1." This file therefore deliberately does NOT implement
// PayFast's real checkout/ITN (Instant Transaction Notification) field set
// or signature algorithm — there is no doc-research citation block here the
// way jazzcash.js/easypaisa.js have one, because doing that research would
// itself be the first step of the FULL integration this task explicitly
// forbids for v1.
//
// `isConfigured()` returns `false` until real `PAYFAST_MERCHANT_ID`/
// `PAYFAST_SECURED_KEY` env vars are ever set (server/src/config/env.js —
// already zod-validated, defaulting to `''`, from the 2026-08-01 foundation
// work; also already anticipated by services/adminSettingsService.js's own
// `SECTION_DEFAULTS.payments.gatewayKeys.payfastMerchantId`/
// `payfastSecuredKey` naming — this driver's env var names were chosen to
// match those exactly). That `false` is what makes
// server/src/adapters/payments/index.js's factory correctly report
// `422 GATEWAY_NOT_CONFIGURED` even if a future admin mistakenly adds
// `payfast` to `PAYMENTS_ENABLED_GATEWAYS` without also filling in real
// credentials — see that file's own "enabled but not configured" contract
// note.
//
// `createCheckout()`/`handleCallback()` deliberately THROW if ever actually
// invoked. In normal operation they never will be — `isConfigured()` gates
// this driver out upstream at `getPaymentGateway()` — but a placeholder
// stub must NEVER silently pretend to succeed if some future code path
// ever bypasses that gate; throwing loudly is the only safe behavior for
// code that doesn't actually do anything real yet.
import { env } from '../../config/env.js';

const payfastGateway = {
  code: 'payfast',

  /** Sync, no I/O — real env credentials only (unlike the raast/bank_transfer manual pseudo-gateways, which are Settings-driven — see raast.js's own `isConfigured()` doc comment for why those two differ). */
  isConfigured() {
    return Boolean(env.PAYFAST_MERCHANT_ID && env.PAYFAST_SECURED_KEY);
  },

  async createCheckout() {
    throw new Error(
      'payfast.createCheckout() was called on an unimplemented PLACEHOLDER driver. This should be unreachable: isConfigured() always returns false until a real PayFast integration replaces this stub (docs/07_EXECUTION_PLAN.md 9.5b).'
    );
  },

  async handleCallback() {
    throw new Error(
      "payfast.handleCallback() was called on an unimplemented PLACEHOLDER driver. This should be unreachable — see createCheckout()'s comment."
    );
  },
};

export default payfastGateway;
