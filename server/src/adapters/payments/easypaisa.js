// server/src/adapters/payments/easypaisa.js
// PaymentGateway driver: EasyPaisa (Telenor Microfinance Bank) — docs/02_
// ARCHITECTURE.md §7, docs/07_EXECUTION_PLAN.md 9.4. Targets EasyPaisa's
// "Post Method" hosted-checkout flow (merchant HTML-form POST to EasyPaisa's
// own `Index.jsf` page — customer picks/enters Mobile Account, OTC, or Card
// details THERE, never on our site — the same hosted-checkout pattern
// server/src/adapters/payments/jazzcash.js's Payment Portal flow uses), NOT
// EasyPaisa's separate newer REST "Open API" (`/easypay-service/rest/v4/
// initiate-ma-transaction` etc.), which authenticates via HTTP Basic
// `username:password` credentials rather than a Store ID + Hash Key pair —
// this codebase's reserved env vars are `EASYPAISA_STORE_ID` +
// `EASYPAISA_HASH_KEY` only (no username/password reserved anywhere), which
// is itself confirmation this driver targets the Hash-Key-based flow.
//
// ---------------------------------------------------------------------------
// SOURCES & CONFIDENCE (checked live 2026-08-05 — do not trust training-data
// memory for this gateway). EasyPaisa's public documentation is materially
// SPARSER and less consistently published than JazzCash's: no equivalent of
// JazzCash's single authoritative sandbox-hosted PDF could be reached in a
// form WebFetch could extract readable text from (the "Easypaisa Merchant
// Integration Guide v4.1.2" PDF is only mirrored on scribd/pdfcoffee behind
// preview walls that would not yield full text). Per the task brief's own
// documented fallback for this situation, the algorithm below was instead
// cross-checked for CONVERGENT agreement across THREE independent, real,
// running community reference implementations before writing a single line
// of driver code. Full doc-gap/judgment-call writeup: DECISIONS.md 2026-08-05
// (EasyPaisa entry, appended after the JazzCash one).
//
//   1. https://github.com/FahadYousafMahar/Easypay-WHMCS-Gateway/blob/master/EasyPay.php
//      (a real, WHMCS-Marketplace-listed EasyPay/EasyPaisa gateway module —
//      `getHashedRequest()`) AND its companion IPN handler
//      https://github.com/FahadYousafMahar/Easypay-WHMCS-Gateway/blob/master/callback/EasyPay.php
//      — the only one of the three sources with a real INBOUND callback
//      handler, not just an outbound request builder.
//   2. https://raw.githubusercontent.com/zfhassaan/easypaisa/master/src/Payment.php
//      (`zfhassaan/easypaisa`, a maintained Laravel package published on
//      Packagist — `gethashRequest()`/`getCheckoutUrl()`).
//   3. https://raw.githubusercontent.com/maan56/EasyPaisa-Integration-PHP-Laravel/main/app/Http/Controllers/DepositController.php
//      (a from-scratch Laravel/Inertia integration demo showing the full
//      initiate -> auth_token -> Confirm.jsf -> `desc` round trip end to end).
//
// CONFIDENCE — HIGH for the outbound request-hash algorithm (all 3 sources
// agree byte-for-byte on the mechanics below); LOW for inbound callback
// authenticity (see judgment call #4 below — a confirmed, genuine gap, not
// an oversight).
//
//   a. Hash algorithm (3-way corroborated, HIGH confidence): build a
//      `key=value&key=value&...` string (NOT URL-encoded, no trailing `&`)
//      from a fixed field set, keys in ASCENDING alphabetical order (source
//      #3's own field-by-field concatenation is already alphabetical:
//      amount, autoRedirect, expiryDate, mobileNum, orderRefNum,
//      paymentMethod, postBackURL, storeId — sources #1/#2 use smaller
//      subsets of the same field names in the same relative order). Encrypt
//      that string with AES in ECB mode, PKCS7-padded (source #1's
//      `mcrypt`-era `pkcs5_pad()`+`MCRYPT_RIJNDAEL_128`/ECB is byte-identical
//      to PKCS7 padding for a 128-bit block cipher; sources #2/#3's modern
//      `openssl_encrypt($msg,'aes-128-ecb',$hashKey,OPENSSL_RAW_DATA)` uses
//      PHP's own openssl default padding, which is PKCS7 unless
//      `OPENSSL_ZERO_PADDING` is passed — it is not), keyed by the raw UTF-8
//      bytes of the merchant's Hash Key (never hex-decoded), base64-encode
//      the ciphertext. Source #1 explicitly validates `strlen($hashKey) ==
//      16 || 24 || 32` before encrypting — `mcrypt`'s `RIJNDAEL_128` (128-bit
//      BLOCK size) auto-selects AES-128/192/256 by KEY length, which is why
//      this driver's `pickCipherForHashKey()` below does the equivalent
//      explicit selection for Node's `crypto` (which, unlike `mcrypt`,
//      requires the exact cipher name to match the key length). Verified
//      independently in this environment via Node's own `crypto` module
//      (encrypt then decrypt round-trips back to the original plaintext for
//      16/24/32-byte keys) — see the "self-consistent" note in DECISIONS.md,
//      since no PHP runtime was available in this environment to byte-for-
//      byte cross-check against a real `openssl_encrypt()` output; PKCS7-
//      padded AES-ECB via OpenSSL is extremely well-established/standard
//      behavior, not a novel or ambiguous claim.
//   b. Field name for the computed hash: `merchantHashedReq` (source #1's
//      WHMCS `$postfields['merchantHashedReq']` AND source #3's
//      `$post_data['merchantHashedReq']` — 2 of 3 sources agree; source #2's
//      `encryptedHashRequest` query-param naming is a one-off used only by
//      that package's own non-standard GET-querystring `getCheckoutUrl()`
//      variant, which — notably — doesn't even match that SAME package's own
//      README `Hosted.blade.php` sample form, which posts a plain field set
//      with no hash field in it at all. Given that inconsistency inside
//      source #2 itself, `merchantHashedReq` (agreeing 2-of-3, and the one
//      literally POSTed as an HTML hidden `<input>` to the real
//      `Index.jsf` endpoint in sources #1 and #3) is used here.
//   c. `amount` format: EXACTLY ONE fractional digit, decimal-point PKR
//      (e.g. `"1500.0"` for Rs 1,500), NOT a smallest-unit integer like
//      JazzCash's `pp_Amount`. Source #1: `number_format($amount,1,'.','')`.
//      Source #3: `$request->amount . '.0'`. 2-of-3 code sources agree
//      exactly; a WebSearch-indexed excerpt of the official integration
//      guide's own text likewise describes "Post Method Integration ... one
//      decimal point (e.g., 10.0)" for this exact flow (a separate,
//      unrelated MPGS/Mastercard "Hosted Checkout" product page's "last two
//      digits are decimal" phrasing turned up in the same search and was
//      discarded as noise — it describes a different vendor's product, not
//      EasyPaisa's). `formatEasypaisaAmount()` below derives this from the
//      exact-integer-cents value via `toCents()` (never a float multiply,
//      per `server/src/utils/money.js`'s own house rule), rounding the
//      DECIMAL(10,2) column's 2nd fractional digit to the nearest 0.1
//      half-up (a minor judgment call — the sources never needed to round a
//      genuine 2-decimal input, since none of their demo amounts had a
//      non-zero 2nd decimal digit).
//   d. Sandbox/production hosted-checkout URLs (3-way corroborated, HIGH
//      confidence — identical literal strings in all 3 sources):
//        production: https://easypay.easypaisa.com.pk/easypay/Index.jsf
//        sandbox:    https://easypaystg.easypaisa.com.pk/easypay/Index.jsf
//   e. `expiryDate` format `Ymd His` (PHP `DateTime::format`) = `yyyyMMdd
//      HHmmss` WITH a literal space between the date and time halves (e.g.
//      `"20260805 150000"`) — sources #1 and #3 both call
//      `$date->format('Ymd His')` verbatim (2-of-3; source #2 uses a
//      different, ISO-ish `timeStamp` field instead of `expiryDate` for its
//      own leaner field subset, so only 2 of the 3 sources exercise this
//      field at all — still full agreement between the two that do).
//
//   4. **Confirmed, genuine doc gap — inbound callback authenticity (LOW
//      confidence, judgment call, logged in DECISIONS.md 2026-08-05):**
//      EasyPaisa's own documented postback fields (`status` ∈
//      {"Success","Failure"}, `desc` ∈ {"0000","0001"}, `orderRefNumber`) —
//      corroborated by source #3's real, running `checkoutSuccess()`
//      checking `$request->desc == "0000"`, and by a WebSearch-indexed
//      excerpt of the merchant-portal documentation describing the same
//      three field names — carry NO cryptographic signature in ANY of the 3
//      independent reference implementations inspected here. This is a
//      stark, confirmed contrast with JazzCash's `pp_SecureHash`. The ONE
//      source with genuine anti-spoofing logic (source #1's IPN handler)
//      instead validates that a provided `url` param is genuinely hosted on
//      `*.easypaisa.com.pk` via regex, then performs a server-to-server
//      `cURL` GET to fetch the AUTHORITATIVE transaction JSON from that
//      URL — a fundamentally different verification model (fetch-from-
//      source-of-truth) than a per-callback signature, and one this
//      driver's synchronous, credential-light contract (no
//      username/password reserved for the REST "Inquire Transaction Status"
//      API either) cannot safely replicate without a live sandbox account to
//      validate against. Given CLAUDE.md's hard "verify signatures on EVERY
//      callback" requirement and this driver's contract's "NEVER assume
//      [signatureValid] true", this driver imposes its OWN defensive
//      requirement NOT specified by EasyPaisa itself: the caller must also
//      supply a `merchantHashedReq` field on the callback, computed with the
//      SAME AES-ECB(HashKey) primitive as the outbound request but over the
//      callback's own terminal fields (`buildEasypaisaCallbackHashMessage`
//      below) — a real, working shared-secret check nothing else in this
//      codebase can forge without the Hash Key, but NOT something confirmed
//      to be what a genuine EasyPaisa server actually sends back. Flagged
//      prominently here and in DECISIONS.md so a future maintainer with real
//      sandbox access can verify/replace this the moment credentials exist.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { toCents } from '../../utils/money.js';

export const SANDBOX_ACTION_URL = 'https://easypaystg.easypaisa.com.pk/easypay/Index.jsf';
export const PRODUCTION_ACTION_URL = 'https://easypay.easypaisa.com.pk/easypay/Index.jsf';

// Source #3's `MA_PAYMENT_METHOD` constant — routes the customer to
// EasyPaisa's Mobile Account channel on their OWN hosted page, the closest
// EasyPaisa analog to JazzCash's `pp_TxnType=MWALLET` choice
// (docs/02_ARCHITECTURE.md §7's hosted-checkout pattern). A documented
// judgment call — EasyPaisa's Index.jsf page also supports `CC_PAYMENT_
// METHOD`/`OTC_PAYMENT_METHOD`, but this codebase exposes exactly one
// `easypaisa` gateway code, so one channel had to be picked.
const PAYMENT_METHOD = 'MA_PAYMENT_METHOD';

// EasyPaisa's own default token/session lifetime is not documented anywhere
// reachable; mirrors jazzcash.js's own judgment call of a security-conscious,
// realistic checkout-session window rather than any doc-mandated value.
const TXN_EXPIRY_MINUTES = 60;

/** Pakistan Standard Time is a fixed UTC+5 offset, no DST (same helper shape as jazzcash.js's own — CLAUDE.md §4: keep dependencies minimal, no timezone-database package). */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** `Ymd His` (PHP DateTime format, sources #1/#3): `yyyyMMdd HHmmss` with a literal space, Pakistan local time. */
export function formatEasypaisaDateTime(date) {
  const shifted = new Date(date.getTime() + PKT_OFFSET_MS);
  const pad2 = (n) => String(n).padStart(2, '0');
  const datePart = `${shifted.getUTCFullYear()}${pad2(shifted.getUTCMonth() + 1)}${pad2(shifted.getUTCDate())}`;
  const timePart = `${pad2(shifted.getUTCHours())}${pad2(shifted.getUTCMinutes())}${pad2(shifted.getUTCSeconds())}`;
  return `${datePart} ${timePart}`;
}

/**
 * Decimal string/number (<=2 fractional digits, e.g. order.finalAmount's
 * DECIMAL(10,2)) -> EasyPaisa's documented one-fractional-digit PKR string
 * (e.g. "15000.0") — see source header note (c). Built on `toCents()`'s
 * exact-integer-cents conversion (never a float multiply), rounding the 2nd
 * decimal digit to the nearest 0.1 half-up using only small-integer division
 * (0-99 range, exact in IEEE-754 double).
 */
export function formatEasypaisaAmount(value) {
  const cents = toCents(value);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  let rupees = Math.floor(abs / 100);
  let tenth = Math.round((abs % 100) / 10); // 0-10
  if (tenth === 10) {
    tenth = 0;
    rupees += 1;
  }
  return `${negative ? '-' : ''}${rupees}.${tenth}`;
}

/**
 * `orderRefNum` must be unique per checkout attempt AND let `handleCallback`
 * recover our own order id from EasyPaisa's echoed `orderRefNumber` later.
 * Source #1's doc comment caps this field at "Max 20 Alpha-Numeric
 * characters" (no `.`/`/` extras documented, unlike JazzCash's `pp_TxnRefNo`
 * — this driver therefore uses a literal letter delimiter, itself
 * alphanumeric, instead of jazzcash.js's `.`). Judgment call, logged in
 * DECISIONS.md — EasyPaisa's docs don't mandate any particular
 * ref-embeds-order-id scheme.
 */
export function buildOrderRefNum(orderId, date = new Date()) {
  return `E${orderId}T${Math.floor(date.getTime() / 1000)}`;
}

/** Inverse of buildOrderRefNum — returns the embedded order id as a string, or null if `orderRefNum` doesn't match our own format (e.g. malformed/forged callback). */
export function parseOrderIdFromOrderRefNum(orderRefNum) {
  if (typeof orderRefNum !== 'string') return null;
  const match = orderRefNum.match(/^E(\d+)T\d+$/);
  return match ? match[1] : null;
}

/** AES-ECB cipher name matching the Hash Key's byte length — see source header note (a): `mcrypt`'s RIJNDAEL_128 auto-selects AES-128/192/256 by key length; Node's `crypto` needs the cipher name spelled out explicitly. Throws for anything else (a fundamentally misconfigured Hash Key, not a signature-verification failure — deliberately NOT swallowed the way a bad/forged hash is). */
function pickCipherForHashKey(hashKey) {
  const len = Buffer.byteLength(String(hashKey), 'utf8');
  if (len === 16) return 'aes-128-ecb';
  if (len === 24) return 'aes-192-ecb';
  if (len === 32) return 'aes-256-ecb';
  throw new Error(`EASYPAISA_HASH_KEY must be 16, 24, or 32 bytes (got ${len}) — see easypaisa.js source header note (a)`);
}

/** Every field in `fields` (in caller-supplied key order — callers pass an already-ordered plain object) rendered as `key=value`, non-empty values only, joined by `&` with no trailing separator — source #1/#2/#3's shared concatenation convention. Exported so tests can assert the message shape directly. */
export function buildEasypaisaHashMessage(fields) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/** AES-ECB(HashKey), PKCS7-padded, base64-encoded — see source header note (a). `fields` must already be in the field's documented order (this function does not sort — callers control ordering, matching the sources' own hand-ordered field lists). */
export function computeMerchantHashedReq(fields, hashKey) {
  const message = buildEasypaisaHashMessage(fields);
  const cipherName = pickCipherForHashKey(hashKey);
  const cipher = crypto.createCipheriv(cipherName, Buffer.from(String(hashKey), 'utf8'), null);
  const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}

/**
 * Constant-time compare against a freshly recomputed hash. Base64 is
 * case-SENSITIVE (unlike jazzcash.js's hex `verifySecureHash`, which
 * normalizes case) — no normalization here. Never throws for a bad/missing/
 * forged hash — mismatches (including a malformed Hash Key that makes
 * `computeMerchantHashedReq` itself throw) simply resolve to `false`, same
 * discipline as every other driver's verify function.
 */
export function verifyMerchantHash(fields, hashKey, providedHash) {
  if (!providedHash) return false;
  let expected;
  try {
    expected = computeMerchantHashedReq(fields, hashKey);
  } catch {
    return false;
  }
  const provided = Buffer.from(String(providedHash), 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (provided.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuf);
}

// The fixed, documented request-side field set, in the ascending-
// alphabetical order every source's own hand-written concatenation already
// follows (source header note (a)) — kept as a named order list (rather than
// re-sorting at call time, unlike jazzcash.js's dynamic pp_* sort) since this
// driver deliberately sends a smaller, fixed field set rather than "every
// field present", so there is nothing to dynamically discover.
const REQUEST_HASH_FIELD_ORDER = ['amount', 'autoRedirect', 'expiryDate', 'orderRefNum', 'paymentMethod', 'postBackURL', 'storeId'];

// This driver's OWN required (not EasyPaisa-documented — see source header
// note 4) callback-verification field set, same ascending-alphabetical
// convention, restricted to the terminal fields EasyPaisa's real postback is
// corroborated to actually send (`status`/`desc`/`orderRefNumber`) plus an
// optional `transactionId` when present (source #1's IPN JSON:
// `transaction_id`).
const CALLBACK_HASH_FIELD_ORDER = ['desc', 'orderRefNumber', 'status', 'transactionId'];

/** Builds an ordered plain object (only the keys in `order` that exist+are non-empty in `source`) so buildEasypaisaHashMessage's `Object.entries` iterates in the documented field order. */
function pickOrdered(source, order) {
  const picked = {};
  for (const key of order) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    picked[key] = value;
  }
  return picked;
}

const easypaisaGateway = {
  code: 'easypaisa',

  /** Sync, no I/O — true iff both required merchant secrets are present (docs/adapters/payments/index.js's "enabled but not configured" contract). */
  isConfigured() {
    return Boolean(env.EASYPAISA_STORE_ID && env.EASYPAISA_HASH_KEY);
  },

  /**
   * Builds the signed hosted-checkout form payload for EasyPaisa's
   * `Index.jsf` Post Method endpoint. Same `{ actionUrl, method, formFields
   * }` shape as jazzcash.js (NOT `{ redirectUrl }`) for the same reason:
   * `merchantHashedReq` cannot be safely encoded into a bare querystring
   * redirect (docs/02_ARCHITECTURE.md §7's driver-return-shape note
   * anticipates `formFields` as a valid shape for exactly this case).
   * Render a hidden-input form, `method="POST"`, `action={actionUrl}`,
   * auto-submit (docs/07_EXECUTION_PLAN.md 9.7 frontend-wiring pass).
   */
  async createCheckout(order) {
    const now = new Date();
    const orderRefNum = buildOrderRefNum(order.id, now);
    const expiryDate = formatEasypaisaDateTime(new Date(now.getTime() + TXN_EXPIRY_MINUTES * 60 * 1000));
    const amount = formatEasypaisaAmount(order.finalAmount);

    const fields = {
      amount,
      autoRedirect: '1', // auto-redirect the browser back to postBackURL after payment (sources #1/#3)
      expiryDate,
      orderRefNum,
      paymentMethod: PAYMENT_METHOD,
      postBackURL: `${env.APP_URL}/api/v1/checkout/return/easypaisa`,
      storeId: env.EASYPAISA_STORE_ID,
    };
    const orderedForHash = pickOrdered(fields, REQUEST_HASH_FIELD_ORDER);
    const merchantHashedReq = computeMerchantHashedReq(orderedForHash, env.EASYPAISA_HASH_KEY);

    return {
      actionUrl: env.EASYPAISA_ENV === 'production' ? PRODUCTION_ACTION_URL : SANDBOX_ACTION_URL,
      method: 'POST',
      formFields: { ...fields, merchantHashedReq },
    };
  },

  /**
   * Verifies this driver's own `merchantHashedReq` requirement (see source
   * header note 4 for why there is no EasyPaisa-documented signature to
   * check instead) on whichever channel carried the callback — query for a
   * browser GET return, body for a POST IPN, merged defensively (body takes
   * precedence) exactly like jazzcash.js/mock.js. NEVER throws merely for a
   * bad/forged/missing hash — always returns `signatureValid:false`.
   */
  async handleCallback(req) {
    const raw = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const orderRef = parseOrderIdFromOrderRefNum(raw.orderRefNumber ?? raw.orderRefNum);

    if (!raw.orderRefNumber || !raw.merchantHashedReq || (raw.desc === undefined && raw.status === undefined)) {
      return {
        orderRef,
        status: 'failed',
        externalRef: raw.transactionId ?? raw.orderRefNumber ?? null,
        signatureValid: false,
        raw,
        eventType: 'payment.callback.malformed',
      };
    }

    const orderedForHash = pickOrdered(raw, CALLBACK_HASH_FIELD_ORDER);
    const signatureValid = verifyMerchantHash(orderedForHash, env.EASYPAISA_HASH_KEY, raw.merchantHashedReq);
    // Source header note (4)/(c): desc "0000" = success (source #3's real
    // `checkoutSuccess()`); status "Success" accepted as a fallback signal
    // when desc is absent, case-insensitively (casing convention not
    // contractually documented anywhere reachable).
    const declaredSuccess = raw.desc === '0000' || String(raw.status ?? '').toLowerCase() === 'success';
    const status = signatureValid && declaredSuccess ? 'success' : 'failed';

    return {
      orderRef,
      status,
      // transactionId is EasyPaisa's OWN transaction reference (source #1's
      // IPN JSON: transaction_id) — falls back to the order ref EasyPaisa
      // merely echoes back when a declined/incomplete transaction's payload
      // omits it.
      externalRef: raw.transactionId || raw.orderRefNumber || null,
      signatureValid,
      raw,
      eventType: signatureValid ? undefined : 'payment.callback.invalid_signature',
    };
  },
};

export default easypaisaGateway;
