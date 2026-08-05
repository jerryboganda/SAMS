// server/src/adapters/payments/bankTransfer.js
// PaymentGateway driver: `bank_transfer` (docs/02_ARCHITECTURE.md §7,
// docs/07_EXECUTION_PLAN.md 9.6). A MANUAL PSEUDO-GATEWAY exactly like
// raast.js — see that file's header for the full "why no API research /
// why isConfigured() is always true / why the real check lives in
// createCheckout()" rationale, all identical here. Deliberately its OWN
// separate file/driver object (NOT merged into raast.js into one shared
// module) — each needs its own `code` and each has its own, genuinely
// different minimum-required Settings field set (bank_transfer:
// `bankName`+`accountTitle`+`iban`; raast: `raastId`+`raastIban` — see
// DECISIONS.md 2026-08-05 for the full "why two files, not one" reasoning),
// even though `createCheckout()`'s manualDetails SHAPE and
// `handleCallback()`'s always-failing-no-op body are byte-for-byte
// identical between the two — that truly-shared piece (reading Settings)
// lives in server/src/adapters/payments/manualGatewayShared.js so it's
// never duplicated.
import { readPaymentsSettings } from './manualGatewayShared.js';
import { ApiError } from '../../utils/apiError.js';

const bankTransferGateway = {
  code: 'bank_transfer',

  /** Always `true`, sync, no I/O — see raast.js's `isConfigured()` doc comment for the full reasoning (identical here). */
  isConfigured() {
    return true;
  },

  /**
   * Returns `{ manualDetails, orderId }` — SAME shape raast.js returns
   * (client/src/api/endpoints/checkout.ts's `CreateOrderResponse.manualDetails`
   * is one shared interface for both gateways). `raastId`/`qrImageUrl` are
   * empty strings here since they're not applicable to a plain bank
   * transfer — per this task's own frontend-contract note (the SAME shape
   * is deliberately reused for both gateways rather than the API surface
   * growing a second, near-identical `bankTransferDetails` type).
   *
   * Throws `422 GATEWAY_NOT_CONFIGURED` if the admin hasn't filled in the
   * minimum required bank-account Settings fields yet (`bankName`,
   * `accountTitle`, `iban`) — this IS the real "is bank_transfer actually
   * usable right now" check for this driver (see `isConfigured()`'s
   * comment / raast.js's own for why it isn't answered there instead).
   */
  async createCheckout(order) {
    const settings = await readPaymentsSettings();
    if (!settings.bankName || !settings.accountTitle || !settings.iban) {
      throw new ApiError(
        422,
        'GATEWAY_NOT_CONFIGURED',
        'Bank transfer is enabled but the admin has not yet filled in the bank account details in Settings.'
      );
    }
    return {
      orderId: order.id,
      manualDetails: {
        raastId: '', // not applicable to a plain bank transfer
        iban: settings.iban,
        accountTitle: settings.accountTitle,
        bankName: settings.bankName,
        qrImageUrl: '', // not applicable to a plain bank transfer
      },
    };
  },

  /** See raast.js's own `handleCallback()` doc comment — identical reasoning: bank_transfer never receives a real gateway callback either; the admin approval queue (server/src/services/manualPaymentService.js) is the only real success path. Safe, always-failing no-op, never omitted. */
  async handleCallback(req) {
    return {
      orderRef: req.query?.orderId ?? req.body?.orderId ?? null,
      status: 'failed',
      externalRef: null,
      signatureValid: false,
      raw: { ...(req.query ?? {}), ...(req.body ?? {}) },
      eventType: 'payment.callback.unsupported_manual_gateway',
    };
  },
};

// -----------------------------------------------------------------------
// FUTURE: a direct bank-initiated-transfer API driver slot (e.g. a real
// Open Banking / account-to-account initiation API, if SAMS Academy ever
// integrates one) could live here or in a new `bankTransferDirect.js`,
// registered under a different gateway code, mirroring
// docs/02_ARCHITECTURE.md §7's "commented slot for a future direct API"
// note (that note is written about Raast specifically, but the same shape
// would apply here). Not implemented — no such API exists for this project
// today.
// -----------------------------------------------------------------------

export default bankTransferGateway;
