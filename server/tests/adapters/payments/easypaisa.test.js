// server/tests/adapters/payments/easypaisa.test.js
// Unit tests for the `easypaisa` PaymentGateway driver (docs/07_EXECUTION_PLAN.md
// 9.4). Mirrors tests/adapters/payments/jazzcash.test.js's structure/rigor.
// EasyPaisa's public docs never publish a worked hash example the way
// JazzCash's PDF's §14.2 does (see server/src/adapters/payments/easypaisa.js's
// header — a confirmed, genuine doc gap, not an oversight), so the hash-
// builder tests below assert the MESSAGE-construction rules directly (field
// order, non-empty filtering, `key=value&...` shape — all independently
// corroborated across 3 real reference implementations) and self-compute the
// AES-ECB digest via Node's own `crypto` for the "does my implementation
// produce ITS OWN documented algorithm correctly" half, exactly the same
// doc-gap fallback jazzcash.test.js/bunny.test.js already established.
// The DB-backed shared-success-path / idempotent-replay integration test
// lives in tests/checkout/easypaisaFlow.e2e.test.js instead (same file-split
// convention as jazzcash's own tests — see DECISIONS.md 2026-08-05).
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { env } from '../../../src/config/env.js';
import { getPaymentGateway, isGatewayAvailable } from '../../../src/adapters/payments/index.js';
import easypaisaGateway, {
  SANDBOX_ACTION_URL,
  PRODUCTION_ACTION_URL,
  buildEasypaisaHashMessage,
  computeMerchantHashedReq,
  verifyMerchantHash,
  formatEasypaisaDateTime,
  formatEasypaisaAmount,
  buildOrderRefNum,
  parseOrderIdFromOrderRefNum,
} from '../../../src/adapters/payments/easypaisa.js';

describe('easypaisa payment adapter — hash message construction (source #1/#2/#3 shared convention, see driver header)', () => {
  test('buildEasypaisaHashMessage joins "key=value" pairs with "&", no trailing separator, in the caller-supplied key order', () => {
    const message = buildEasypaisaHashMessage({ amount: '1500.0', orderRefNum: 'E1T2', storeId: '12345' });
    expect(message).toBe('amount=1500.0&orderRefNum=E1T2&storeId=12345');
  });

  test('fields with empty/null/undefined values are excluded (matches every source\'s own PHP array-building code, which only ever assigns present values)', () => {
    const withEmpties = buildEasypaisaHashMessage({ amount: '100', autoRedirect: '', mobileNum: null, orderRefNum: undefined, storeId: 'S1' });
    const withoutEmpties = buildEasypaisaHashMessage({ amount: '100', storeId: 'S1' });
    expect(withEmpties).toBe(withoutEmpties);
  });

  test('a single-field message has no "&" at all', () => {
    expect(buildEasypaisaHashMessage({ amount: '100' })).toBe('amount=100');
  });
});

describe('easypaisa payment adapter — computeMerchantHashedReq / verifyMerchantHash (AES-ECB(HashKey), PKCS7, base64 — source header note (a))', () => {
  test('computeMerchantHashedReq === base64(AES-ECB-PKCS7(message, key=hashKey)) — self-computed digest matching this driver\'s own documented algorithm (no official worked example exists for this gateway to assert against instead — see file header)', () => {
    const hashKey = 'ABCDEFGHIJKLMNOP'; // 16 bytes -> aes-128-ecb
    const fields = { amount: '1500.0', orderRefNum: 'E501T1700000000', storeId: 'STORE01' };
    const message = buildEasypaisaHashMessage(fields);
    const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(hashKey, 'utf8'), null);
    const expected = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]).toString('base64');

    expect(computeMerchantHashedReq(fields, hashKey)).toBe(expected);
  });

  test('supports 16/24/32-byte Hash Keys (aes-128/192/256-ecb) — mcrypt RIJNDAEL_128\'s own key-length-driven cipher selection, per source #1\'s explicit strlen(16|24|32) validation', () => {
    const fields = { amount: '100.0' };
    for (const len of [16, 24, 32]) {
      const hashKey = 'K'.repeat(len);
      expect(() => computeMerchantHashedReq(fields, hashKey)).not.toThrow();
      // round-trips are internally consistent (decryptable back to the same message) — proves correct padding/mode, not just "didn't throw".
      const b64 = computeMerchantHashedReq(fields, hashKey);
      const cipherName = { 16: 'aes-128-ecb', 24: 'aes-192-ecb', 32: 'aes-256-ecb' }[len];
      const decipher = crypto.createDecipheriv(cipherName, Buffer.from(hashKey, 'utf8'), null);
      const decrypted = Buffer.concat([decipher.update(Buffer.from(b64, 'base64')), decipher.final()]).toString('utf8');
      expect(decrypted).toBe(buildEasypaisaHashMessage(fields));
    }
  });

  test('throws for a Hash Key of any other length (fundamentally misconfigured, not a signature failure)', () => {
    expect(() => computeMerchantHashedReq({ amount: '1' }, 'too-short')).toThrow(/16, 24, or 32 bytes/);
    expect(() => computeMerchantHashedReq({ amount: '1' }, '')).toThrow();
  });

  test('verifyMerchantHash accepts a genuinely-signed field set', () => {
    const fields = { amount: '1500.0', orderRefNum: 'E1T1', storeId: 'S1' };
    const hashKey = 'MY16BYTEHASHKEY!';
    const hash = computeMerchantHashedReq(fields, hashKey);
    expect(verifyMerchantHash(fields, hashKey, hash)).toBe(true);
  });

  test('verifyMerchantHash is case-SENSITIVE (base64, unlike jazzcash.js\'s hex verifySecureHash)', () => {
    const fields = { amount: '100.0' };
    const hashKey = 'MY16BYTEHASHKEY!';
    const hash = computeMerchantHashedReq(fields, hashKey);
    const flippedCase = hash === hash.toUpperCase() ? hash.toLowerCase() : hash.toUpperCase();
    expect(verifyMerchantHash(fields, hashKey, flippedCase)).toBe(false);
  });

  test('verifyMerchantHash rejects a forged/tampered hash without throwing', () => {
    const fields = { amount: '100.0', orderRefNum: 'E1T1' };
    const hashKey = 'MY16BYTEHASHKEY!';
    const hash = computeMerchantHashedReq(fields, hashKey);
    const forged = (hash.slice(0, -1) + (hash.at(-1) === 'A' ? 'B' : 'A'));
    expect(verifyMerchantHash(fields, hashKey, forged)).toBe(false);
  });

  test('verifyMerchantHash rejects a hash computed against DIFFERENT field values (tampered amount)', () => {
    const hashKey = 'MY16BYTEHASHKEY!';
    const original = { amount: '100.0', orderRefNum: 'E1T1' };
    const hash = computeMerchantHashedReq(original, hashKey);
    const tampered = { ...original, amount: '1.0' };
    expect(verifyMerchantHash(tampered, hashKey, hash)).toBe(false);
  });

  test('verifyMerchantHash rejects a missing/empty hash without throwing', () => {
    expect(verifyMerchantHash({ amount: '1' }, 'MY16BYTEHASHKEY!', null)).toBe(false);
    expect(verifyMerchantHash({ amount: '1' }, 'MY16BYTEHASHKEY!', '')).toBe(false);
    expect(verifyMerchantHash({ amount: '1' }, 'MY16BYTEHASHKEY!', undefined)).toBe(false);
  });

  test('verifyMerchantHash never throws even for a malformed Hash Key (would otherwise crash the callback route)', () => {
    expect(verifyMerchantHash({ amount: '1' }, 'bad-length-key', 'anything')).toBe(false);
  });
});

describe('easypaisa payment adapter — formatEasypaisaAmount (one fractional digit, decimal-point PKR — source header note (c))', () => {
  test('a clean 2-decimal amount with a zero 2nd digit renders with exactly 1 fractional digit', () => {
    expect(formatEasypaisaAmount('15000.00')).toBe('15000.0');
    expect(formatEasypaisaAmount('1500.00')).toBe('1500.0');
  });

  test('rounds the 2nd decimal digit to the nearest 0.1, half-up', () => {
    expect(formatEasypaisaAmount('100.04')).toBe('100.0');
    expect(formatEasypaisaAmount('100.05')).toBe('100.1'); // half-up
    expect(formatEasypaisaAmount('100.06')).toBe('100.1');
  });

  test('carries into the next rupee when rounding 0.95-0.99 up to the next whole rupee', () => {
    expect(formatEasypaisaAmount('9999.99')).toBe('10000.0');
    expect(formatEasypaisaAmount('9999.95')).toBe('10000.0');
  });

  test('never uses a float multiply — exact for values that would lose precision under naive float math', () => {
    expect(formatEasypaisaAmount('19.99')).toBe('20.0');
  });
});

describe('easypaisa payment adapter — formatEasypaisaDateTime ("Ymd His" — source #1/#3)', () => {
  test('renders "yyyyMMdd HHmmss" (literal space), Pakistan local time (UTC+5, no DST)', () => {
    // 2026-08-05T10:00:00.000Z UTC -> 2026-08-05 15:00:00 PKT
    expect(formatEasypaisaDateTime(new Date('2026-08-05T10:00:00.000Z'))).toBe('20260805 150000');
  });

  test('correctly rolls over the date across the UTC+5 day boundary', () => {
    expect(formatEasypaisaDateTime(new Date('2026-08-05T20:30:15.000Z'))).toBe('20260806 013015');
  });
});

describe('easypaisa payment adapter — orderRefNum <-> order id round-trip', () => {
  test('buildOrderRefNum + parseOrderIdFromOrderRefNum round-trips the order id exactly, alphanumeric-only', () => {
    const ref = buildOrderRefNum(4242, new Date('2026-08-05T10:00:00.000Z'));
    expect(ref).toMatch(/^[A-Za-z0-9]+$/); // "Max 20 Alpha-Numeric characters" per source #1
    expect(ref).toMatch(/^E4242T\d+$/);
    expect(parseOrderIdFromOrderRefNum(ref)).toBe('4242');
  });

  test('two calls for the same order at different times produce distinct refs that still parse back to the same order id', () => {
    const ref1 = buildOrderRefNum(7, new Date('2026-08-05T10:00:00.000Z'));
    const ref2 = buildOrderRefNum(7, new Date('2026-08-05T10:00:05.000Z'));
    expect(ref1).not.toBe(ref2);
    expect(parseOrderIdFromOrderRefNum(ref1)).toBe('7');
    expect(parseOrderIdFromOrderRefNum(ref2)).toBe('7');
  });

  test('parseOrderIdFromOrderRefNum returns null for a malformed/foreign ref, never throws', () => {
    expect(parseOrderIdFromOrderRefNum('garbage')).toBeNull();
    expect(parseOrderIdFromOrderRefNum('')).toBeNull();
    expect(parseOrderIdFromOrderRefNum(null)).toBeNull();
    expect(parseOrderIdFromOrderRefNum(undefined)).toBeNull();
    expect(parseOrderIdFromOrderRefNum(12345)).toBeNull();
  });
});

describe('easypaisa payment adapter — isConfigured()', () => {
  const original = { EASYPAISA_STORE_ID: env.EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY: env.EASYPAISA_HASH_KEY };

  afterEach(() => {
    Object.assign(env, original);
  });

  test('false when either required secret is missing', () => {
    env.EASYPAISA_STORE_ID = '';
    env.EASYPAISA_HASH_KEY = '';
    expect(easypaisaGateway.isConfigured()).toBe(false);

    env.EASYPAISA_STORE_ID = 'STORE01';
    env.EASYPAISA_HASH_KEY = '';
    expect(easypaisaGateway.isConfigured()).toBe(false);

    env.EASYPAISA_STORE_ID = '';
    env.EASYPAISA_HASH_KEY = 'MY16BYTEHASHKEY!';
    expect(easypaisaGateway.isConfigured()).toBe(false);
  });

  test('true once both required secrets are non-empty', () => {
    env.EASYPAISA_STORE_ID = 'STORE01';
    env.EASYPAISA_HASH_KEY = 'MY16BYTEHASHKEY!';
    expect(easypaisaGateway.isConfigured()).toBe(true);
  });
});

describe('easypaisa payment adapter — createCheckout(order)', () => {
  const original = {
    EASYPAISA_STORE_ID: env.EASYPAISA_STORE_ID,
    EASYPAISA_HASH_KEY: env.EASYPAISA_HASH_KEY,
    EASYPAISA_ENV: env.EASYPAISA_ENV,
  };

  beforeEach(() => {
    env.EASYPAISA_STORE_ID = 'STORE01';
    env.EASYPAISA_HASH_KEY = 'MY16BYTEHASHKEY!';
    env.EASYPAISA_ENV = 'sandbox';
  });

  afterEach(() => {
    Object.assign(env, original);
  });

  test('returns { actionUrl, method:"POST", formFields } — a form-POST hosted-checkout shape, not a bare redirectUrl', async () => {
    const order = { id: 501, invoiceNo: 'SAMS-2026-00501', finalAmount: '15000.00' };
    const result = await easypaisaGateway.createCheckout(order);

    expect(result.actionUrl).toBe(SANDBOX_ACTION_URL);
    expect(result.method).toBe('POST');
    expect(result.formFields.storeId).toBe('STORE01');
    expect(result.formFields.paymentMethod).toBe('MA_PAYMENT_METHOD');
    expect(result.formFields.postBackURL).toBe(`${env.APP_URL}/api/v1/checkout/return/easypaisa`);
  });

  test('amount is the one-decimal PKR string (never a float multiply) — "15000.00" -> "15000.0"', async () => {
    const order = { id: 502, invoiceNo: 'SAMS-2026-00502', finalAmount: '15000.00' };
    const result = await easypaisaGateway.createCheckout(order);
    expect(result.formFields.amount).toBe('15000.0');
  });

  test('orderRefNum embeds the order id and round-trips via parseOrderIdFromOrderRefNum', async () => {
    const order = { id: 503, invoiceNo: 'SAMS-2026-00503', finalAmount: '5000.00' };
    const result = await easypaisaGateway.createCheckout(order);
    expect(parseOrderIdFromOrderRefNum(result.formFields.orderRefNum)).toBe('503');
  });

  test('merchantHashedReq on the outgoing payload is internally self-consistent (verifyMerchantHash accepts it against the same ordered request fields)', async () => {
    const order = { id: 504, invoiceNo: 'SAMS-2026-00504', finalAmount: '9999.99' };
    const result = await easypaisaGateway.createCheckout(order);
    const { merchantHashedReq, ...fields } = result.formFields;
    const orderedForHash = {
      amount: fields.amount,
      autoRedirect: fields.autoRedirect,
      expiryDate: fields.expiryDate,
      orderRefNum: fields.orderRefNum,
      paymentMethod: fields.paymentMethod,
      postBackURL: fields.postBackURL,
      storeId: fields.storeId,
    };
    expect(verifyMerchantHash(orderedForHash, env.EASYPAISA_HASH_KEY, merchantHashedReq)).toBe(true);
  });

  test('uses the PRODUCTION action URL when EASYPAISA_ENV=production', async () => {
    env.EASYPAISA_ENV = 'production';
    const order = { id: 505, invoiceNo: 'SAMS-2026-00505', finalAmount: '1000.00' };
    const result = await easypaisaGateway.createCheckout(order);
    expect(result.actionUrl).toBe(PRODUCTION_ACTION_URL);
  });
});

describe('easypaisa payment adapter — handleCallback(req)', () => {
  const HASH_KEY = 'MY16BYTEHASHKEY!';
  const original = { EASYPAISA_HASH_KEY: env.EASYPAISA_HASH_KEY };

  beforeEach(() => {
    env.EASYPAISA_HASH_KEY = HASH_KEY;
  });

  afterEach(() => {
    Object.assign(env, original);
  });

  function signedFields(overrides = {}) {
    const fields = {
      orderRefNumber: 'E77T1700000000',
      status: 'Success',
      desc: '0000',
      transactionId: 'TXN-abc123',
      ...overrides,
    };
    const orderedForHash = { desc: fields.desc, orderRefNumber: fields.orderRefNumber, status: fields.status, transactionId: fields.transactionId };
    fields.merchantHashedReq = computeMerchantHashedReq(orderedForHash, HASH_KEY);
    return fields;
  }

  test('valid hash + desc "0000" (body, POST IPN shape) -> verified success', async () => {
    const body = signedFields();
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body });

    expect(result.orderRef).toBe('77');
    expect(result.status).toBe('success');
    expect(result.signatureValid).toBe(true);
    expect(result.externalRef).toBe('TXN-abc123');
    expect(result.raw).toMatchObject(body);
    expect(result.eventType).toBeUndefined(); // caller defaults to 'payment.success'
  });

  test('valid hash + desc "0000" (query, GET-return shape) -> verified success', async () => {
    const query = signedFields({ orderRefNumber: 'E78T1700000001' });
    const result = await easypaisaGateway.handleCallback({ method: 'GET', query, body: {} });
    expect(result.orderRef).toBe('78');
    expect(result.status).toBe('success');
    expect(result.signatureValid).toBe(true);
  });

  test('valid hash but desc "0001" (declared failure) -> failed, signature still reported valid', async () => {
    const body = signedFields({ desc: '0001', status: 'Failure' });
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body });
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(true);
    expect(result.eventType).toBeUndefined(); // caller defaults to 'payment.failed'
  });

  test('falls back to status==="Success" (case-insensitive) when desc is absent', async () => {
    const fields = { orderRefNumber: 'E79T1700000002', status: 'success', transactionId: 'TXN-xyz' };
    const orderedForHash = { orderRefNumber: fields.orderRefNumber, status: fields.status, transactionId: fields.transactionId };
    fields.merchantHashedReq = computeMerchantHashedReq(orderedForHash, HASH_KEY);
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body: fields });
    expect(result.status).toBe('success');
    expect(result.signatureValid).toBe(true);
  });

  test('forged/tampered merchantHashedReq -> failed, signatureValid:false, never throws', async () => {
    const body = signedFields();
    body.merchantHashedReq = body.merchantHashedReq.slice(0, -1) + (body.merchantHashedReq.at(-1) === 'A' ? 'B' : 'A');
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body });

    expect(result.orderRef).toBe('77');
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.invalid_signature');
  });

  test('tampered desc (attacker tries to flip a decline into a success) invalidates the hash', async () => {
    const body = signedFields({ desc: '0001' });
    body.desc = '0000'; // tampered after signing
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body });
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
  });

  test('missing orderRefNumber/merchantHashedReq/desc+status -> malformed, never throws', async () => {
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body: {} });
    expect(result.orderRef).toBeNull();
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.malformed');
  });

  test('unroutable/foreign orderRefNumber (not one we generated) -> orderRef null, still never throws', async () => {
    const body = signedFields({ orderRefNumber: 'not-our-format' });
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body });
    expect(result.orderRef).toBeNull();
    // signature is still verified independently of whether the ref was parseable
    expect(result.signatureValid).toBe(true);
  });

  test('a malformed EASYPAISA_HASH_KEY on our own side never throws, just fails verification', async () => {
    env.EASYPAISA_HASH_KEY = 'wrong-length';
    const body = signedFields();
    const result = await easypaisaGateway.handleCallback({ method: 'POST', query: {}, body });
    expect(result.signatureValid).toBe(false);
    expect(result.status).toBe('failed');
  });
});

describe('easypaisa — payments factory integration', () => {
  const original = {
    PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS,
    EASYPAISA_STORE_ID: env.EASYPAISA_STORE_ID,
    EASYPAISA_HASH_KEY: env.EASYPAISA_HASH_KEY,
  };

  afterEach(() => {
    Object.assign(env, original);
  });

  test('registered in DRIVERS but reports unavailable while not listed in PAYMENTS_ENABLED_GATEWAYS (default "mock")', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock';
    expect(isGatewayAvailable('easypaisa')).toBe(false);
  });

  test('enabled but missing secrets -> still unavailable (isConfigured() gate) -> GATEWAY_NOT_CONFIGURED', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,easypaisa';
    env.EASYPAISA_STORE_ID = '';
    env.EASYPAISA_HASH_KEY = '';
    expect(isGatewayAvailable('easypaisa')).toBe(false);

    expect.assertions(4);
    try {
      getPaymentGateway('easypaisa');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
      expect(err.message).toMatch(/easypaisa/);
    }
  });

  test('enabled AND configured -> available, resolves the real driver, interface-conformant', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,easypaisa';
    env.EASYPAISA_STORE_ID = 'STORE01';
    env.EASYPAISA_HASH_KEY = 'MY16BYTEHASHKEY!';

    expect(isGatewayAvailable('easypaisa')).toBe(true);
    const driver = getPaymentGateway('easypaisa');
    expect(driver).toBe(easypaisaGateway);
    expect(driver.code).toBe('easypaisa');
    expect(typeof driver.createCheckout).toBe('function');
    expect(typeof driver.handleCallback).toBe('function');
  });
});
