// server/tests/adapters/payments/jazzcash.test.js
// Unit tests for the `jazzcash` PaymentGateway driver (docs/07_EXECUTION_PLAN.md
// 9.3). Covers the secure-hash builder/verifier against the OFFICIAL
// documented worked example (see server/src/adapters/payments/jazzcash.js's
// header for the exact source/section — the PDF documents the message
// construction verbatim but never prints a final HMAC digest number for that
// toy example, so the digest itself is self-computed via Node's own `crypto`,
// same approach as tests/adapters/video/bunny.test.js's own doc-gap note),
// PLUS the createCheckout/handleCallback interface contract and the payments
// factory's "enabled but not configured" rules for this specific gateway.
// The DB-backed shared-success-path / idempotent-replay integration test
// lives in tests/checkout/jazzcashFlow.e2e.test.js instead (mirroring where
// the `mock` driver's own equivalent tests live — tests/checkout/, not
// tests/adapters/payments/ — see DECISIONS.md 2026-08-05).
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { env } from '../../../src/config/env.js';
import { getPaymentGateway, isGatewayAvailable } from '../../../src/adapters/payments/index.js';
import jazzcashGateway, {
  SANDBOX_ACTION_URL,
  PRODUCTION_ACTION_URL,
  buildSecureHashMessage,
  computeSecureHash,
  verifySecureHash,
  formatJazzCashDateTime,
  buildTxnRefNo,
  parseOrderIdFromTxnRefNo,
} from '../../../src/adapters/payments/jazzcash.js';

describe('jazzcash payment adapter — secure hash (§14.1/§14.2 of the official Payment Portal Integration Guide v4.2)', () => {
  test('buildSecureHashMessage matches the doc\'s own §14.2 worked example verbatim: "0F5DD14AE2&2995&MER123&A48cvE28"', () => {
    const salt = '0F5DD14AE2';
    const fields = { pp_Amount: '2995', pp_MerchantID: 'MER123', pp_OrderInfo: 'A48cvE28' };
    expect(buildSecureHashMessage(fields, salt)).toBe('0F5DD14AE2&2995&MER123&A48cvE28');
  });

  test('computeSecureHash === HEX(HMAC-SHA256(message, key=salt)).toUpperCase() — self-computed digest over the documented message (doc never prints the final hash for this toy example)', () => {
    const salt = '0F5DD14AE2';
    const fields = { pp_Amount: '2995', pp_MerchantID: 'MER123', pp_OrderInfo: 'A48cvE28' };
    const expected = crypto
      .createHmac('sha256', salt)
      .update('0F5DD14AE2&2995&MER123&A48cvE28', 'utf8')
      .digest('hex')
      .toUpperCase();
    expect(computeSecureHash(fields, salt)).toBe(expected);
    expect(computeSecureHash(fields, salt)).toMatch(/^[0-9A-F]{64}$/); // 64 uppercase hex chars = HMAC-SHA256 digest
  });

  test('fields are sorted by ASCENDING field NAME, not insertion order (doc: "ascending alphabetical order of the field name")', () => {
    const salt = 'SALT';
    const inOrder = buildSecureHashMessage({ pp_Zeta: '1', pp_Alpha: '2', pp_Mid: '3' }, salt);
    const shuffled = buildSecureHashMessage({ pp_Mid: '3', pp_Zeta: '1', pp_Alpha: '2' }, salt);
    expect(inOrder).toBe('SALT&2&3&1'); // pp_Alpha, pp_Mid, pp_Zeta
    expect(shuffled).toBe(inOrder);
  });

  test('a field with a substring name sorts BEFORE the longer field it prefixes (doc example: "Card should come before CardNum")', () => {
    const message = buildSecureHashMessage({ pp_CardNum: 'long', pp_Card: 'short' }, 'S');
    expect(message).toBe('S&short&long'); // pp_Card (short) before pp_CardNum (long)
  });

  test('fields with empty/null/undefined values are excluded from the hash (matches the community reference implementation cited in the driver header)', () => {
    const withEmpties = buildSecureHashMessage(
      { pp_Amount: '100', pp_BankID: '', pp_ProductID: null, pp_SubMerchantID: undefined, pp_MerchantID: 'M1' },
      'SALT'
    );
    const withoutEmpties = buildSecureHashMessage({ pp_Amount: '100', pp_MerchantID: 'M1' }, 'SALT');
    expect(withEmpties).toBe(withoutEmpties);
  });

  test('non-"pp_"-prefixed keys (e.g. Express/body noise) never participate in the hash', () => {
    const withNoise = buildSecureHashMessage({ pp_Amount: '100', gateway: 'jazzcash', method: 'POST' }, 'SALT');
    const clean = buildSecureHashMessage({ pp_Amount: '100' }, 'SALT');
    expect(withNoise).toBe(clean);
  });

  test('pp_SecureHash itself is never included even if present in the input object (it would be self-referential)', () => {
    const withHashField = buildSecureHashMessage({ pp_Amount: '100', pp_SecureHash: 'whatever' }, 'SALT');
    expect(withHashField).toBe('SALT&100');
  });

  test('verifySecureHash accepts a genuinely-signed field set', () => {
    const fields = { pp_Amount: '150000', pp_MerchantID: 'MC12345', pp_TxnRefNo: 'T1.123' };
    const hash = computeSecureHash(fields, 'my-integrity-salt');
    expect(verifySecureHash(fields, 'my-integrity-salt', hash)).toBe(true);
  });

  test('verifySecureHash is case-insensitive on the provided hash (JazzCash\'s own case convention is not contractually guaranteed)', () => {
    const fields = { pp_Amount: '150000' };
    const hash = computeSecureHash(fields, 'salt');
    expect(verifySecureHash(fields, 'salt', hash.toLowerCase())).toBe(true);
  });

  test('verifySecureHash rejects a forged/tampered hash without throwing', () => {
    const fields = { pp_Amount: '150000', pp_MerchantID: 'MC12345' };
    const hash = computeSecureHash(fields, 'salt');
    const forged = hash.slice(0, -1) + (hash.at(-1) === '0' ? '1' : '0');
    expect(verifySecureHash(fields, 'salt', forged)).toBe(false);
  });

  test('verifySecureHash rejects a hash computed against DIFFERENT field values (tampered amount)', () => {
    const original = { pp_Amount: '150000', pp_MerchantID: 'MC12345' };
    const hash = computeSecureHash(original, 'salt');
    const tampered = { ...original, pp_Amount: '1' }; // attacker tries to pay less
    expect(verifySecureHash(tampered, 'salt', hash)).toBe(false);
  });

  test('verifySecureHash rejects a missing/empty hash without throwing', () => {
    expect(verifySecureHash({ pp_Amount: '1' }, 'salt', null)).toBe(false);
    expect(verifySecureHash({ pp_Amount: '1' }, 'salt', '')).toBe(false);
    expect(verifySecureHash({ pp_Amount: '1' }, 'salt', undefined)).toBe(false);
  });
});

describe('jazzcash payment adapter — pp_TxnDateTime formatting (§6.1: "yyyyMMddHHmmss")', () => {
  test('formatJazzCashDateTime renders 14 digits, Pakistan local time (UTC+5, no DST)', () => {
    // 2026-08-05T10:00:00.000Z UTC -> 2026-08-05 15:00:00 PKT
    const formatted = formatJazzCashDateTime(new Date('2026-08-05T10:00:00.000Z'));
    expect(formatted).toBe('20260805150000');
    expect(formatted).toMatch(/^\d{14}$/);
  });

  test('correctly rolls over the date across the UTC+5 day boundary', () => {
    // 2026-08-05T20:30:15.000Z UTC -> 2026-08-06 01:30:15 PKT (next day)
    const formatted = formatJazzCashDateTime(new Date('2026-08-05T20:30:15.000Z'));
    expect(formatted).toBe('20260806013015');
  });
});

describe('jazzcash payment adapter — pp_TxnRefNo <-> order id round-trip', () => {
  test('buildTxnRefNo + parseOrderIdFromTxnRefNo round-trips the order id exactly', () => {
    const ref = buildTxnRefNo(4242, new Date('2026-08-05T10:00:00.000Z'));
    expect(ref).toMatch(/^T4242\.\d+$/);
    expect(parseOrderIdFromTxnRefNo(ref)).toBe('4242');
  });

  test('two calls for the same order at different times produce distinct refs (JazzCash requires per-attempt uniqueness) that still parse back to the same order id', () => {
    const ref1 = buildTxnRefNo(7, new Date('2026-08-05T10:00:00.000Z'));
    const ref2 = buildTxnRefNo(7, new Date('2026-08-05T10:00:05.000Z'));
    expect(ref1).not.toBe(ref2);
    expect(parseOrderIdFromTxnRefNo(ref1)).toBe('7');
    expect(parseOrderIdFromTxnRefNo(ref2)).toBe('7');
  });

  test('parseOrderIdFromTxnRefNo returns null for a malformed/foreign ref, never throws', () => {
    expect(parseOrderIdFromTxnRefNo('garbage')).toBeNull();
    expect(parseOrderIdFromTxnRefNo('')).toBeNull();
    expect(parseOrderIdFromTxnRefNo(null)).toBeNull();
    expect(parseOrderIdFromTxnRefNo(undefined)).toBeNull();
    expect(parseOrderIdFromTxnRefNo(12345)).toBeNull();
  });
});

describe('jazzcash payment adapter — isConfigured()', () => {
  const original = {
    JAZZCASH_MERCHANT_ID: env.JAZZCASH_MERCHANT_ID,
    JAZZCASH_PASSWORD: env.JAZZCASH_PASSWORD,
    JAZZCASH_INTEGRITY_SALT: env.JAZZCASH_INTEGRITY_SALT,
  };

  afterEach(() => {
    Object.assign(env, original);
  });

  test('false when any of the 3 required secrets is missing', () => {
    env.JAZZCASH_MERCHANT_ID = '';
    env.JAZZCASH_PASSWORD = '';
    env.JAZZCASH_INTEGRITY_SALT = '';
    expect(jazzcashGateway.isConfigured()).toBe(false);

    env.JAZZCASH_MERCHANT_ID = 'MC12345';
    env.JAZZCASH_PASSWORD = '';
    env.JAZZCASH_INTEGRITY_SALT = 'salt';
    expect(jazzcashGateway.isConfigured()).toBe(false);

    env.JAZZCASH_MERCHANT_ID = 'MC12345';
    env.JAZZCASH_PASSWORD = 'pw';
    env.JAZZCASH_INTEGRITY_SALT = '';
    expect(jazzcashGateway.isConfigured()).toBe(false);
  });

  test('true once all 3 required secrets are non-empty', () => {
    env.JAZZCASH_MERCHANT_ID = 'MC12345';
    env.JAZZCASH_PASSWORD = 'pw';
    env.JAZZCASH_INTEGRITY_SALT = 'salt';
    expect(jazzcashGateway.isConfigured()).toBe(true);
  });
});

describe('jazzcash payment adapter — createCheckout(order)', () => {
  const original = {
    JAZZCASH_MERCHANT_ID: env.JAZZCASH_MERCHANT_ID,
    JAZZCASH_PASSWORD: env.JAZZCASH_PASSWORD,
    JAZZCASH_INTEGRITY_SALT: env.JAZZCASH_INTEGRITY_SALT,
    JAZZCASH_ENV: env.JAZZCASH_ENV,
  };

  beforeEach(() => {
    env.JAZZCASH_MERCHANT_ID = 'MC12345';
    env.JAZZCASH_PASSWORD = 'pw123';
    env.JAZZCASH_INTEGRITY_SALT = 'test-integrity-salt';
    env.JAZZCASH_ENV = 'sandbox';
  });

  afterEach(() => {
    Object.assign(env, original);
  });

  test('returns { actionUrl, method:"POST", formFields } — a form-POST hosted-checkout shape, not a bare redirectUrl', async () => {
    const order = { id: 501, invoiceNo: 'SAMS-2026-00501', finalAmount: '15000.00' };
    const result = await jazzcashGateway.createCheckout(order);

    expect(result.actionUrl).toBe(SANDBOX_ACTION_URL);
    expect(result.method).toBe('POST');
    expect(result.formFields.pp_MerchantID).toBe('MC12345');
    expect(result.formFields.pp_Password).toBe('pw123');
    expect(result.formFields.pp_TxnType).toBe('MWALLET');
    expect(result.formFields.pp_TxnCurrency).toBe('PKR');
    expect(result.formFields.pp_ReturnURL).toBe(`${env.APP_URL}/api/v1/checkout/return/jazzcash`);
  });

  test('pp_Amount is the integer paisas conversion via toCents (never a float multiply) — "15000.00" -> "1500000"', async () => {
    const order = { id: 502, invoiceNo: 'SAMS-2026-00502', finalAmount: '15000.00' };
    const result = await jazzcashGateway.createCheckout(order);
    expect(result.formFields.pp_Amount).toBe('1500000');
  });

  test('pp_TxnRefNo embeds the order id and round-trips via parseOrderIdFromTxnRefNo', async () => {
    const order = { id: 503, invoiceNo: 'SAMS-2026-00503', finalAmount: '5000.00' };
    const result = await jazzcashGateway.createCheckout(order);
    expect(parseOrderIdFromTxnRefNo(result.formFields.pp_TxnRefNo)).toBe('503');
  });

  test('pp_SecureHash on the outgoing payload is internally self-consistent (verifySecureHash accepts it against the same fields)', async () => {
    const order = { id: 504, invoiceNo: 'SAMS-2026-00504', finalAmount: '9999.99' };
    const result = await jazzcashGateway.createCheckout(order);
    expect(verifySecureHash(result.formFields, env.JAZZCASH_INTEGRITY_SALT, result.formFields.pp_SecureHash)).toBe(true);
  });

  test('uses the PRODUCTION action URL when JAZZCASH_ENV=production', async () => {
    env.JAZZCASH_ENV = 'production';
    const order = { id: 505, invoiceNo: 'SAMS-2026-00505', finalAmount: '1000.00' };
    const result = await jazzcashGateway.createCheckout(order);
    expect(result.actionUrl).toBe(PRODUCTION_ACTION_URL);
  });
});

describe('jazzcash payment adapter — handleCallback(req)', () => {
  const SALT = 'test-integrity-salt';
  const original = { JAZZCASH_INTEGRITY_SALT: env.JAZZCASH_INTEGRITY_SALT };

  beforeEach(() => {
    env.JAZZCASH_INTEGRITY_SALT = SALT;
  });

  afterEach(() => {
    Object.assign(env, original);
  });

  function signedFields(overrides = {}) {
    const fields = {
      pp_TxnRefNo: 'T77.1700000000',
      pp_Amount: '1500000',
      pp_ResponseCode: '000',
      pp_ResponseMessage: 'Thank you for Using JazzCash, your transaction was successful.',
      pp_RetreivalReferenceNo: 'RRN-abc123',
      ...overrides,
    };
    fields.pp_SecureHash = computeSecureHash(fields, SALT);
    return fields;
  }

  test('valid signature + pp_ResponseCode 000 (body, POST IPN-webhook shape) -> verified success', async () => {
    const body = signedFields();
    const result = await jazzcashGateway.handleCallback({ method: 'POST', query: {}, body });

    expect(result.orderRef).toBe('77');
    expect(result.status).toBe('success');
    expect(result.signatureValid).toBe(true);
    expect(result.externalRef).toBe('RRN-abc123');
    expect(result.raw).toMatchObject(body);
    expect(result.eventType).toBeUndefined(); // caller defaults to 'payment.success'
  });

  test('valid signature + pp_ResponseCode 000 (query, GET-return shape) -> verified success', async () => {
    const query = signedFields({ pp_TxnRefNo: 'T78.1700000001' });
    const result = await jazzcashGateway.handleCallback({ method: 'GET', query, body: {} });
    expect(result.orderRef).toBe('78');
    expect(result.status).toBe('success');
    expect(result.signatureValid).toBe(true);
  });

  test('valid signature but a DECLINE response code -> failed, signature still reported valid', async () => {
    const body = signedFields({ pp_ResponseCode: '999', pp_ResponseMessage: 'Declined' });
    const result = await jazzcashGateway.handleCallback({ method: 'POST', query: {}, body });
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(true);
    expect(result.eventType).toBeUndefined(); // caller defaults to 'payment.failed'
  });

  test('forged/tampered pp_SecureHash -> failed, signatureValid:false, never throws', async () => {
    const body = signedFields();
    body.pp_SecureHash = body.pp_SecureHash.slice(0, -1) + (body.pp_SecureHash.at(-1) === '0' ? '1' : '0');
    const result = await jazzcashGateway.handleCallback({ method: 'POST', query: {}, body });

    expect(result.orderRef).toBe('77');
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.invalid_signature');
  });

  test('tampered pp_Amount (attacker tries to report a lower paid amount) invalidates the signature', async () => {
    const body = signedFields();
    body.pp_Amount = '1'; // tampered after signing
    const result = await jazzcashGateway.handleCallback({ method: 'POST', query: {}, body });
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
  });

  test('missing pp_TxnRefNo/pp_SecureHash/pp_ResponseCode -> malformed, never throws', async () => {
    const result = await jazzcashGateway.handleCallback({ method: 'POST', query: {}, body: {} });
    expect(result.orderRef).toBeNull();
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.malformed');
  });

  test('unroutable/foreign pp_TxnRefNo (not one we generated) -> orderRef null, still never throws', async () => {
    const body = signedFields({ pp_TxnRefNo: 'not-our-format' });
    const result = await jazzcashGateway.handleCallback({ method: 'POST', query: {}, body });
    expect(result.orderRef).toBeNull();
    // signature is still verified independently of whether the ref was parseable
    expect(result.signatureValid).toBe(true);
  });
});

describe('jazzcash — payments factory integration', () => {
  const original = {
    PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS,
    JAZZCASH_MERCHANT_ID: env.JAZZCASH_MERCHANT_ID,
    JAZZCASH_PASSWORD: env.JAZZCASH_PASSWORD,
    JAZZCASH_INTEGRITY_SALT: env.JAZZCASH_INTEGRITY_SALT,
  };

  afterEach(() => {
    Object.assign(env, original);
  });

  test('registered in DRIVERS but reports unavailable while not listed in PAYMENTS_ENABLED_GATEWAYS (default "mock")', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock';
    expect(isGatewayAvailable('jazzcash')).toBe(false);
  });

  test('enabled but missing secrets -> still unavailable (isConfigured() gate) -> GATEWAY_NOT_CONFIGURED', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,jazzcash';
    env.JAZZCASH_MERCHANT_ID = '';
    env.JAZZCASH_PASSWORD = '';
    env.JAZZCASH_INTEGRITY_SALT = '';
    expect(isGatewayAvailable('jazzcash')).toBe(false);

    expect.assertions(4);
    try {
      getPaymentGateway('jazzcash');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
      expect(err.message).toMatch(/jazzcash/);
    }
  });

  test('enabled AND configured -> available, resolves the real driver, interface-conformant', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,jazzcash';
    env.JAZZCASH_MERCHANT_ID = 'MC12345';
    env.JAZZCASH_PASSWORD = 'pw';
    env.JAZZCASH_INTEGRITY_SALT = 'salt';

    expect(isGatewayAvailable('jazzcash')).toBe(true);
    const driver = getPaymentGateway('jazzcash');
    expect(driver).toBe(jazzcashGateway);
    expect(driver.code).toBe('jazzcash');
    expect(typeof driver.createCheckout).toBe('function');
    expect(typeof driver.handleCallback).toBe('function');
  });
});
