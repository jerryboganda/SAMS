// server/tests/adapters/payments/mock.test.js
// Unit + integration tests for the `mock` PaymentGateway driver
// (docs/07_EXECUTION_PLAN.md 9.2). Covers the signature builder/verifier
// against a self-computed deterministic vector (same style as
// tests/adapters/video/bunny.test.js's own token vector — see that file's
// header for why a self-computed vector is used rather than a
// gateway-published sample number) PLUS the createCheckout/handleCallback
// interface contract.
import crypto from 'node:crypto';
import { describe, expect, test } from '@jest/globals';
import mockGateway, { signMockToken, verifyMockToken } from '../../../src/adapters/payments/mock.js';
import { env } from '../../../src/config/env.js';

describe('mock payment adapter — signature builder/verifier', () => {
  test('signMockToken(orderId) === HEX(SHA256(APP_ENCRYPTION_KEY + ":mock-checkout:" + orderId)) — documented, self-computed vector', () => {
    const orderId = 42;
    const expected = crypto
      .createHash('sha256')
      .update(`${env.APP_ENCRYPTION_KEY}:mock-checkout:${orderId}`)
      .digest('hex');
    expect(signMockToken(orderId)).toBe(expected);
    // Deterministic: same input -> same token, every call.
    expect(signMockToken(orderId)).toBe(signMockToken(orderId));
  });

  test('different orderIds produce different tokens', () => {
    expect(signMockToken(1)).not.toBe(signMockToken(2));
  });

  test('verifyMockToken accepts a genuinely-signed token', () => {
    const token = signMockToken(7);
    expect(verifyMockToken(7, token)).toBe(true);
  });

  test('verifyMockToken rejects a forged/tampered token', () => {
    const token = signMockToken(7);
    const forged = token.slice(0, -1) + (token.at(-1) === '0' ? '1' : '0');
    expect(verifyMockToken(7, forged)).toBe(false);
  });

  test('verifyMockToken rejects a token signed for a DIFFERENT orderId (no cross-order replay)', () => {
    const tokenForOrder7 = signMockToken(7);
    expect(verifyMockToken(8, tokenForOrder7)).toBe(false);
  });

  test('verifyMockToken rejects a missing/empty token without throwing', () => {
    expect(verifyMockToken(7, null)).toBe(false);
    expect(verifyMockToken(7, '')).toBe(false);
    expect(verifyMockToken(7, undefined)).toBe(false);
  });
});

describe('mock payment adapter — interface contract', () => {
  test('code is "mock" and isConfigured() is always true (zero credentials by design)', () => {
    expect(mockGateway.code).toBe('mock');
    expect(mockGateway.isConfigured()).toBe(true);
  });

  test('createCheckout(order) mirrors a real hosted-checkout redirect: redirectUrl points at our OWN GET /api/v1/checkout/return/mock (the actual mounted route, server/src/routes/v1/index.js) with orderId+token', async () => {
    const order = { id: 123, invoiceNo: 'SAMS-2026-00001' };
    const { redirectUrl } = await mockGateway.createCheckout(order);

    expect(redirectUrl.startsWith(env.APP_URL)).toBe(true);
    const url = new URL(redirectUrl);
    // Regression guard for docs/07_EXECUTION_PLAN.md 9.7's live-browser-verification bug find
    // (DECISIONS.md 2026-08-05): the real router mounts checkoutRouter under '/api/v1/checkout'
    // (app.js: app.use('/api/v1', v1Router); routes/v1/index.js: router.use('/checkout', ...)) —
    // a redirectUrl missing the '/api/v1' prefix 404s in a real browser (this file's OWN header
    // comment already documented the correct path; only this literal string was wrong).
    expect(url.pathname).toBe('/api/v1/checkout/return/mock');
    expect(url.searchParams.get('orderId')).toBe('123');
    expect(verifyMockToken(123, url.searchParams.get('token'))).toBe(true);
  });

  test('handleCallback(req) — valid token (query, GET-return shape) -> verified success', async () => {
    const token = signMockToken(55);
    const result = await mockGateway.handleCallback({ method: 'GET', query: { orderId: '55', token }, body: {} });

    expect(result.orderRef).toBe('55');
    expect(result.status).toBe('success');
    expect(result.signatureValid).toBe(true);
    expect(result.externalRef).toBe('mock-55');
    expect(result.raw).toMatchObject({ orderId: '55', token });
  });

  test('handleCallback(req) — valid token (body, POST-webhook shape) -> verified success', async () => {
    const token = signMockToken(56);
    const result = await mockGateway.handleCallback({ method: 'POST', query: {}, body: { orderId: '56', token } });

    expect(result.orderRef).toBe('56');
    expect(result.status).toBe('success');
    expect(result.signatureValid).toBe(true);
  });

  test('handleCallback(req) — tampered token -> failed, signatureValid:false (never throws)', async () => {
    const token = signMockToken(57);
    const forged = token.slice(0, -1) + (token.at(-1) === '0' ? '1' : '0');
    const result = await mockGateway.handleCallback({ method: 'GET', query: { orderId: '57', token: forged }, body: {} });

    expect(result.orderRef).toBe('57');
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.invalid_signature');
  });

  test('handleCallback(req) — missing orderId/token -> malformed, never throws', async () => {
    const result = await mockGateway.handleCallback({ method: 'GET', query: {}, body: {} });
    expect(result.orderRef).toBeNull();
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.malformed');
  });
});
