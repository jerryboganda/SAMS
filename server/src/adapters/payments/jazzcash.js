// server/src/adapters/payments/jazzcash.js
// PaymentGateway driver: JazzCash (docs/02_ARCHITECTURE.md §7,
// docs/07_EXECUTION_PLAN.md 9.3). Hosted-checkout ("Payment Portal") pattern:
// we build a signed pp_* form payload, the browser is POSTed to JazzCash's
// own hosted page (customer enters their wallet/mobile-account credentials
// THERE, never on our site), then JazzCash bounces the browser back to our
// pp_ReturnURL and, separately, calls our IPN webhook — both callbacks are
// verified the same way (handleCallback below), per the driver contract
// documented in server/src/adapters/payments/index.js's header.
//
// ---------------------------------------------------------------------------
// SOURCES (verified live 2026-08-05 — do not trust training-data memory for
// this gateway; the exact secure-hash field set/algorithm is the one thing
// that must be right or every real transaction silently fails signature
// verification). Full doc-gap/judgment-call writeup: DECISIONS.md 2026-08-05.
//
//   1. Official JazzCash "Payment Gateway – Payment Portal Integration Guide
//      for Merchants" v4.2 (09 May 2019), fetched from the official sandbox
//      docs site:
//      https://sandbox.jazzcash.com.pk/SandboxDocumentation/Content/documentation/Payment%20Gateway%20Integration%20Guide%20for%20Merchants-v4.2.pdf
//        - §6.1 "Payment Portal – Input Parameters": the exact hosted-checkout
//          HTML-form field set (pp_Version, pp_TxnType, pp_Language,
//          pp_MerchantID, pp_SubMerchantID, pp_Password, pp_BankID,
//          pp_ProductID, pp_TxnRefNo, pp_Amount, pp_TxnCurrency,
//          pp_TxnDateTime, pp_BillReference, pp_Description,
//          pp_TxnExpiryDateTime, pp_ReturnURL, pp_SecureHash, ppmpf_1..5),
//          pp_TxnType values include `MWALLET` (Mobile Wallet — the flow this
//          driver targets, per docs/02_ARCHITECTURE.md §7's "hosted-checkout
//          pattern"). pp_Amount: "no decimal places are included... 100.00
//          will be passed as 10000" -> smallest currency unit (paisas),
//          confirming `toCents()` is the right conversion. pp_TxnDateTime /
//          pp_TxnExpiryDateTime format: `yyyyMMddHHmmss` (14 digits, no
//          separators), e.g. sample `20110909203547`.
//        - §14.1/§14.2 "How the Secure Hash is Created and Verified" / "How
//          is SHA256-HMAC Calculated": the SHA-256 HMAC calculation includes
//          all `pp_` fields; concatenate their VALUES (never the field
//          names) in ascending alphabetical order of the field name, joined
//          by `&` between fields (not after the last one); prepend the
//          Shared Secret (== our Integrity Salt) followed by `&`; HMAC-SHA256
//          the whole string using the Integrity Salt (UTF-8 encoded) as the
//          HMAC key; hex-encode the digest. The doc's own worked example
//          (§14.2) for 3 fields {pp_Amount:2995, pp_MerchantID:MER123,
//          pp_OrderInfo:A48cvE28} with Shared Secret `0F5DD14AE2` gives the
//          message string verbatim: `0F5DD14AE2&2995&MER123&A48cvE28` — this
//          is used as this file's test's self-computed-digest vector (the
//          PDF documents the message construction but never prints the final
//          HMAC digest number for this toy example, so — same approach as
//          server/src/adapters/video/bunny.js's own doc-gap note — the test
//          recomputes the digest independently via Node's own `crypto`
//          rather than trusting an unpublished number).
//        - Appendix I "Response Code": `pp_ResponseCode == '000'` = "Thank
//          you for Using JazzCash, your transaction was successful." Every
//          other code is a decline/error.
//
//   2. Cross-check against an independent, widely-used community reference
//      implementation (this vendor PDF is nominally titled "Payment Portal"
//      and the worked example on the exact field list used doesn't spell out
//      an MWALLET-specific hash field array — see DECISIONS.md doc-gap note
//      — so the *algorithm mechanics* were corroborated against real,
//      running code before trusting them):
//      https://github.com/rafayhingoro/jazzcash/blob/master/jazzcash.php
//      `secureHash()`/`genString()`: sorts field names ascending, joins
//      non-empty field VALUES with `&`, prepends `IntegritySalt&`, computes
//      `hash_hmac('sha256', $message, $integritySalt)` — i.e. exactly what
//      §14.2 describes, PLUS the one detail neither excerpt of the PDF
//      states outright: fields with an empty/null value are excluded from
//      the hash entirely (`!empty($a) && !is_null($a)`) — implemented here
//      as `pickNonEmptyPpFields()`.
//
//   3. Sandbox/production hosted-checkout form-POST action URL — NOT a
//      literal string in the PDF (it references a server-side config
//      placeholder there), sourced instead from the sandbox site's own
//      merchant-form endpoint, corroborated identically across multiple
//      independent public integration write-ups (WebSearch cross-check,
//      2026-08-05):
//        sandbox:    https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/
//        production: https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { toCents } from '../../utils/money.js';

export const SANDBOX_ACTION_URL = 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
export const PRODUCTION_ACTION_URL = 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';

// JazzCash's own default/max txn-expiry window is 3 months (§6.1); we use a
// much tighter, security-conscious default matching a normal checkout
// session's realistic lifetime — a judgment call (the docs don't mandate a
// specific value below the 3-month ceiling), logged in DECISIONS.md.
const TXN_EXPIRY_MINUTES = 60;

// §6.1: "In cases when any of these characters <>\*=%/:'"{} are inserted,
// they will be replaced with a space. Pipe '|' is not allowed" (pp_Description only).
const DESCRIPTION_FORBIDDEN_CHARS = /[<>\\*=%/:'"{}|]/g;

/** Pakistan Standard Time is a fixed UTC+5 offset, no DST — safe to compute without a timezone-database dependency (CLAUDE.md §4: keep dependencies minimal). */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** JazzCash's documented `yyyyMMddHHmmss` format (§6.1 sample: `20110909203547`), rendered in Pakistan local time. */
export function formatJazzCashDateTime(date) {
  const shifted = new Date(date.getTime() + PKT_OFFSET_MS);
  const pad2 = (n) => String(n).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}${pad2(shifted.getUTCMonth() + 1)}${pad2(shifted.getUTCDate())}` +
    `${pad2(shifted.getUTCHours())}${pad2(shifted.getUTCMinutes())}${pad2(shifted.getUTCSeconds())}`
  );
}

/**
 * pp_TxnRefNo must be unique per attempt (JazzCash rejects a replayed ref)
 * AND must let us recover OUR order id from JazzCash's callback later (it
 * echoes pp_TxnRefNo back unchanged — §6.1 response table: "As provided in
 * the request"). Format `T{orderId}.{unixSeconds}` — '.' is one of the two
 * extra characters the field explicitly allows beyond alphanumeric ("20 AN &
 * '/' & '.'", §6.1) and gives parseOrderIdFromTxnRefNo() an unambiguous
 * delimiter regardless of orderId's digit count. Judgment call (JazzCash's
 * docs don't mandate any particular txn-ref-embeds-order-id scheme) — logged
 * in DECISIONS.md; comfortably fits the 20-char cap for any realistic order
 * id on this deployment's scale.
 */
export function buildTxnRefNo(orderId, date = new Date()) {
  return `T${orderId}.${Math.floor(date.getTime() / 1000)}`;
}

/** Inverse of buildTxnRefNo — returns the embedded order id as a string, or null if `txnRefNo` doesn't match our own format (e.g. malformed/forged callback). */
export function parseOrderIdFromTxnRefNo(txnRefNo) {
  if (typeof txnRefNo !== 'string') return null;
  const match = txnRefNo.match(/^T(\d+)\./);
  return match ? match[1] : null;
}

/** §6.1: strip the characters JazzCash's own Payment Portal replaces with a space in pp_Description, and enforce the 200-char max length. */
function sanitizeDescription(text) {
  return String(text).replace(DESCRIPTION_FORBIDDEN_CHARS, ' ').slice(0, 200);
}

/** Every `pp_` field (never pp_SecureHash itself) with a non-empty value — matches the community reference implementation's `!empty()` filter (source #2 above); the doc's own §14.2 worked example doesn't need this filter since it has no empty fields to begin with. */
function pickNonEmptyPpFields(fields) {
  const picked = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'pp_SecureHash') continue;
    if (!key.startsWith('pp_')) continue;
    if (value === undefined || value === null || value === '') continue;
    picked[key] = String(value);
  }
  return picked;
}

/**
 * §14.2's exact message construction: Integrity Salt, then every non-empty
 * `pp_` field's VALUE (never its name) in ascending alphabetical order of
 * the field NAME, all joined by `&` (including between the salt and the
 * first value). Exported so tests can assert the message shape directly
 * against the documented worked example, independent of the HMAC step.
 */
export function buildSecureHashMessage(fields, integritySalt) {
  const picked = pickNonEmptyPpFields(fields);
  const sortedValues = Object.keys(picked)
    .sort()
    .map((key) => picked[key]);
  return [integritySalt, ...sortedValues].join('&');
}

/** HMAC-SHA256(message, key=integritySalt), hex-encoded, uppercase (matches every sample hash shown in the official PDF). */
export function computeSecureHash(fields, integritySalt) {
  const message = buildSecureHashMessage(fields, integritySalt);
  return crypto.createHmac('sha256', integritySalt).update(message, 'utf8').digest('hex').toUpperCase();
}

/**
 * Constant-time, case-insensitive compare (JazzCash's own case convention
 * isn't contractually guaranteed even though every documented sample is
 * uppercase) against a freshly recomputed hash. Never throws — a forged or
 * missing hash simply compares false, same discipline as
 * server/src/adapters/payments/mock.js's verifyMockToken.
 */
export function verifySecureHash(fields, integritySalt, providedHash) {
  if (!providedHash) return false;
  const expected = computeSecureHash(fields, integritySalt);
  const provided = Buffer.from(String(providedHash).toUpperCase(), 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (provided.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuf);
}

const jazzcashGateway = {
  code: 'jazzcash',

  /** Sync, no I/O — true iff every required merchant secret is present (docs/adapters/payments/index.js's "enabled but not configured" contract). */
  isConfigured() {
    return Boolean(env.JAZZCASH_MERCHANT_ID && env.JAZZCASH_PASSWORD && env.JAZZCASH_INTEGRITY_SALT);
  },

  /**
   * Builds the signed hosted-checkout form payload. Unlike a simple
   * redirect-URL gateway (mock/PayFast-style), JazzCash's Payment Portal is
   * an HTML-form POST target — there is no way to encode all required
   * fields (notably the 64-char pp_SecureHash) into a bare querystring
   * redirect, so this driver returns `{ actionUrl, method, formFields }`
   * rather than `{ redirectUrl }` (docs/02_ARCHITECTURE.md §7's own
   * driver-return-shape note explicitly anticipates `formFields` as one of
   * the valid shapes). Documented clearly here for whoever wires the
   * frontend (docs/07_EXECUTION_PLAN.md 9.7): render a form with one hidden
   * `<input>` per `formFields` entry, `method="POST"`, `action={actionUrl}`,
   * and auto-submit it — the standard hosted-checkout redirect-via-form-post
   * pattern every JazzCash integration (and PayFast/Safepay, once built)
   * uses.
   */
  async createCheckout(order) {
    const now = new Date();
    const txnDateTime = formatJazzCashDateTime(now);
    const txnExpiryDateTime = formatJazzCashDateTime(new Date(now.getTime() + TXN_EXPIRY_MINUTES * 60 * 1000));
    const txnRefNo = buildTxnRefNo(order.id, now);
    const amountInPaisas = toCents(order.finalAmount); // §6.1: "no decimal places... 100.00 will be passed as 10000"

    const fields = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET', // Mobile Wallet — the hosted-checkout flow this driver targets (§6.1)
      pp_Language: 'EN',
      pp_MerchantID: env.JAZZCASH_MERCHANT_ID,
      pp_SubMerchantID: '', // only relevant for merchants with sub-merchants — none here
      pp_Password: env.JAZZCASH_PASSWORD,
      pp_BankID: '', // only used for DD (internet banking) transactions, empty otherwise per §6.1
      pp_ProductID: '', // optional; not applicable to MWALLET
      pp_TxnRefNo: txnRefNo,
      pp_Amount: String(amountInPaisas),
      pp_TxnCurrency: 'PKR', // §6.1: fixed value
      pp_TxnDateTime: txnDateTime,
      pp_BillReference: String(order.invoiceNo ?? order.id).slice(0, 20), // 20 AN max per §6.1
      pp_Description: sanitizeDescription(`SAMS Academy course purchase - invoice ${order.invoiceNo}`),
      pp_TxnExpiryDateTime: txnExpiryDateTime,
      pp_ReturnURL: `${env.APP_URL}/api/v1/checkout/return/jazzcash`,
    };
    const pp_SecureHash = computeSecureHash(fields, env.JAZZCASH_INTEGRITY_SALT);

    return {
      actionUrl: env.JAZZCASH_ENV === 'production' ? PRODUCTION_ACTION_URL : SANDBOX_ACTION_URL,
      method: 'POST',
      formFields: { ...fields, pp_SecureHash },
    };
  },

  /**
   * Verifies pp_SecureHash on whichever channel actually carried the
   * callback — JazzCash's own docs state pp_ReturnURL is hit via "an HTTP
   * POST Request" (§6.1) and the IPN/webhook is likewise a POST, so both
   * land in `req.body` once a form-body parser is wired in front of this
   * route; `req.query` is also checked (merged, body taking precedence) so
   * this driver degrades gracefully if a future route ever forwards fields
   * via querystring instead — same defensive dual-channel read as
   * mock.js's handleCallback. NEVER throws merely for a bad/forged/missing
   * hash — always returns `signatureValid:false` instead (driver contract,
   * server/src/adapters/payments/index.js header).
   */
  async handleCallback(req) {
    const raw = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const orderRef = parseOrderIdFromTxnRefNo(raw.pp_TxnRefNo);

    if (!raw.pp_TxnRefNo || !raw.pp_SecureHash || !raw.pp_ResponseCode) {
      return {
        orderRef,
        status: 'failed',
        externalRef: raw.pp_RetreivalReferenceNo ?? raw.pp_TxnRefNo ?? null,
        signatureValid: false,
        raw,
        eventType: 'payment.callback.malformed',
      };
    }

    const signatureValid = verifySecureHash(raw, env.JAZZCASH_INTEGRITY_SALT, raw.pp_SecureHash);
    // Appendix I: pp_ResponseCode '000' = success; every other code is a decline/error.
    const status = signatureValid && raw.pp_ResponseCode === '000' ? 'success' : 'failed';

    return {
      orderRef,
      status,
      // pp_RetreivalReferenceNo is JazzCash's OWN transaction reference
      // (distinct from pp_TxnRefNo, which is the ref WE generated and they
      // merely echo back) — falls back to pp_TxnRefNo if a declined
      // transaction's response omits it.
      externalRef: raw.pp_RetreivalReferenceNo || raw.pp_TxnRefNo || null,
      signatureValid,
      raw,
      eventType: signatureValid ? undefined : 'payment.callback.invalid_signature',
    };
  },
};

export default jazzcashGateway;
