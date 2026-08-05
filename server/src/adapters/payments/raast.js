// server/src/adapters/payments/raast.js
// PaymentGateway driver: `raast` (docs/02_ARCHITECTURE.md §7,
// docs/07_EXECUTION_PLAN.md 9.5). A MANUAL PSEUDO-GATEWAY, not a real API
// integration — per the task brief, NO external API research was
// required/attempted for this driver (unlike jazzcash.js/easypaisa.js,
// there is no citation block here): Raast (the State Bank of Pakistan's
// instant-payment settlement rail) exposes bank-to-bank / PSP-to-PSP APIs to
// LICENSED FINANCIAL INSTITUTIONS, not to an individual merchant web app, so
// no ordinary "sign up for a merchant account, get an API key" integration
// exists for Raast the way it does for JazzCash/EasyPaisa/PayFast/Safepay.
// This driver is sourced entirely from OUR OWN admin-editable Settings data
// (manualGatewayShared.js), matching docs/02_ARCHITECTURE.md §7's own
// description verbatim: "createCheckout returns instructions payload from
// admin Settings (Raast ID / IBAN / QR image) -> student pays in their bank
// app -> uploads proof/txn ref -> same admin approval queue as bank
// transfer -> shared success path."
//
// A COMMENTED SLOT for a FUTURE direct Raast API driver is left at the
// bottom of this file, per that same architecture doc line.
import { readPaymentsSettings } from './manualGatewayShared.js';
import { ApiError } from '../../utils/apiError.js';

const raastGateway = {
  code: 'raast',

  /**
   * Always `true`, sync, no I/O — matches the "sync, no I/O" line every
   * other driver's `isConfigured()` follows (server/src/adapters/payments/
   * index.js's header). This is a DELIBERATE, DOCUMENTED DEVIATION from a
   * literal reading of this task's own brief ("isConfigured() — true iff
   * the relevant Settings fields are non-empty... read from
   * Setting.findByPk('payments')"): that would require `isConfigured()` to
   * do real DB I/O and therefore be ASYNC, but
   * server/src/adapters/payments/index.js#isGatewayAvailable/
   * #getPaymentGateway are SYNCHRONOUS and are asserted on synchronously,
   * without `await`, by tests/adapters/payments/{index,jazzcash,easypaisa}.test.js
   * — two of which (jazzcash.test.js, easypaisa.test.js) are explicitly
   * off-limits to modify for this task. Making `isConfigured()` async here
   * would make `!driver.isConfigured()` (index.js) evaluate the truthiness
   * of a Promise object (always truthy) instead of the real boolean,
   * silently breaking that whole gate for EVERY driver, not just this one.
   * So the REAL "are Settings actually filled in yet" check — the one this
   * task's brief actually cares about — lives in `createCheckout()` below
   * instead (already `async`, already does real I/O, already the step that
   * throws `422 GATEWAY_NOT_CONFIGURED` for every other reason a checkout
   * can't proceed). Full reasoning: DECISIONS.md 2026-08-05.
   */
  isConfigured() {
    return true;
  },

  /**
   * Returns `{ manualDetails, orderId }` — the THIRD valid driver-return
   * shape (docs/02_ARCHITECTURE.md §7: "{ redirectUrl | formFields |
   * instructions }"), matching client/src/api/endpoints/checkout.ts's
   * `CreateOrderResponse.manualDetails` shape EXACTLY (confirmed by reading
   * that file directly): `{raastId, iban, accountTitle, bankName,
   * qrImageUrl}`. `accountTitle`/`bankName` are shared with
   * bank_transfer.js's own manualDetails (both ultimately settle into the
   * SAME underlying bank account Settings > Payments describes) — see
   * DECISIONS.md 2026-08-05 for why the frontend's ONE shared shape reuses
   * these two fields for both gateways rather than needing a
   * Raast-specific bank name.
   *
   * Throws `422 GATEWAY_NOT_CONFIGURED` if the admin hasn't filled in the
   * minimum required Raast Settings fields yet (`raastId`, `raastIban`) —
   * this IS the real "is raast actually usable right now" check for this
   * driver (see `isConfigured()`'s comment above for why it isn't answered
   * there instead).
   */
  async createCheckout(order) {
    const settings = await readPaymentsSettings();
    if (!settings.raastId || !settings.raastIban) {
      throw new ApiError(
        422,
        'GATEWAY_NOT_CONFIGURED',
        'Raast is enabled but the admin has not yet filled in the Raast ID / IBAN in Settings.'
      );
    }
    return {
      orderId: order.id,
      manualDetails: {
        raastId: settings.raastId,
        iban: settings.raastIban,
        accountTitle: settings.accountTitle,
        bankName: settings.bankName,
        qrImageUrl: settings.raastQrImage,
      },
    };
  },

  /**
   * Raast has no real gateway that ever calls back into this app —
   * `GET /checkout/return/raast` and `POST /webhooks/payments/raast` are
   * never actually hit by anything real in this build; the admin approval
   * queue (server/src/services/manualPaymentService.js) is the ONLY path
   * that ever completes a raast order's payment (see that file + the task
   * brief's own "raast/bank_transfer never go through processGatewayCallback/
   * webhooks" note). Implemented as a safe, ALWAYS-FAILING no-op (never
   * `signatureValid:true`, never `status:'success'`) rather than omitted
   * entirely, so this driver stays interface-conformant with the contract
   * every driver satisfies (server/src/adapters/payments/index.js's
   * header) — a stray/forged request against either generic route with
   * `gateway=raast` must never be able to fake a successful payment.
   */
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
// FUTURE: a direct Raast API driver slot (docs/02_ARCHITECTURE.md §7). If
// SAMS Academy ever becomes (or partners with) a Raast-participating
// financial institution / licensed PSP with real API credentials, a second
// driver implementing this SAME PaymentGateway contract could live here or
// in a new `raastDirect.js`, registered under a DIFFERENT gateway code
// (e.g. `raast_api`) so this manual pseudo-gateway keeps working unchanged
// for any deployment that never gets those credentials. Not implemented —
// no such API/credentials exist for this project today.
//
//   const raastDirectGateway = {
//     code: 'raast_api',
//     isConfigured() { return Boolean(env.RAAST_API_KEY /* ... */); },
//     async createCheckout(order) { /* real Raast settlement API call */ },
//     async handleCallback(req) { /* real signature verification */ },
//   };
// -----------------------------------------------------------------------

export default raastGateway;
