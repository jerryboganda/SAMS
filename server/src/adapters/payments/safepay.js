// server/src/adapters/payments/safepay.js
// PaymentGateway driver: `safepay` — PLACEHOLDER STUB ONLY
// (docs/07_EXECUTION_PLAN.md 9.5b). Mirrors payfast.js exactly — see that
// file's header for the full "why no real integration, why throw instead of
// silently succeed" rationale; identical reasoning applies here.
//
// `isConfigured()` returns `false` until real `SAFEPAY_API_KEY`/
// `SAFEPAY_SECRET` env vars are ever set (server/src/config/env.js —
// already zod-validated, defaulting to `''`, from the 2026-08-01 foundation
// work; also already anticipated by services/adminSettingsService.js's own
// `SECTION_DEFAULTS.payments.gatewayKeys.safepayApiKey`/`safepaySecret`
// naming — this driver's env var names were chosen to match those exactly).
import { env } from '../../config/env.js';

const safepayGateway = {
  code: 'safepay',

  /** Sync, no I/O — real env credentials only. */
  isConfigured() {
    return Boolean(env.SAFEPAY_API_KEY && env.SAFEPAY_SECRET);
  },

  async createCheckout() {
    throw new Error(
      'safepay.createCheckout() was called on an unimplemented PLACEHOLDER driver. This should be unreachable: isConfigured() always returns false until a real Safepay integration replaces this stub (docs/07_EXECUTION_PLAN.md 9.5b).'
    );
  },

  async handleCallback() {
    throw new Error(
      "safepay.handleCallback() was called on an unimplemented PLACEHOLDER driver. This should be unreachable — see createCheckout()'s comment."
    );
  },
};

export default safepayGateway;
