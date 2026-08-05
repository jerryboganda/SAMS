// server/tests/adapters/payments/safepay.test.js
// Unit tests for the `safepay` PLACEHOLDER PaymentGateway driver
// (docs/07_EXECUTION_PLAN.md 9.5b) — mirrors payfast.test.js's structure
// exactly (see that file's header + safepay.js's own header).
import { afterEach, describe, expect, test } from '@jest/globals';
import safepayGateway from '../../../src/adapters/payments/safepay.js';
import { getPaymentGateway, isGatewayAvailable } from '../../../src/adapters/payments/index.js';
import { env } from '../../../src/config/env.js';

describe('safepay payment adapter — PLACEHOLDER stub contract', () => {
  test('code is "safepay"', () => {
    expect(safepayGateway.code).toBe('safepay');
  });

  test('isConfigured() is false by default (no SAFEPAY_API_KEY/SAFEPAY_SECRET in test env)', () => {
    expect(env.SAFEPAY_API_KEY).toBe('');
    expect(env.SAFEPAY_SECRET).toBe('');
    expect(safepayGateway.isConfigured()).toBe(false);
  });

  test('isConfigured() requires BOTH api key AND secret non-empty', () => {
    const original = { SAFEPAY_API_KEY: env.SAFEPAY_API_KEY, SAFEPAY_SECRET: env.SAFEPAY_SECRET };
    try {
      env.SAFEPAY_API_KEY = 'APIKEY123';
      env.SAFEPAY_SECRET = '';
      expect(safepayGateway.isConfigured()).toBe(false);

      env.SAFEPAY_API_KEY = '';
      env.SAFEPAY_SECRET = 'SECRET123';
      expect(safepayGateway.isConfigured()).toBe(false);

      env.SAFEPAY_API_KEY = 'APIKEY123';
      env.SAFEPAY_SECRET = 'SECRET123';
      expect(safepayGateway.isConfigured()).toBe(true);
    } finally {
      Object.assign(env, original);
    }
  });

  test('createCheckout() throws (never silently succeeds) if ever actually invoked', async () => {
    await expect(safepayGateway.createCheckout({ id: 1 })).rejects.toThrow(/PLACEHOLDER/);
  });

  test('handleCallback() throws (never silently returns a fake success) if ever actually invoked', async () => {
    await expect(safepayGateway.handleCallback({ query: {}, body: {} })).rejects.toThrow(/PLACEHOLDER/);
  });
});

describe('safepay — payments factory integration', () => {
  const original = {
    PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS,
    SAFEPAY_API_KEY: env.SAFEPAY_API_KEY,
    SAFEPAY_SECRET: env.SAFEPAY_SECRET,
  };
  afterEach(() => Object.assign(env, original));

  test('registered in DRIVERS but reports unavailable while not enabled', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock';
    expect(isGatewayAvailable('safepay')).toBe(false);
  });

  test('enabled but unconfigured (no real keys) -> STILL unavailable -> 422 GATEWAY_NOT_CONFIGURED', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,safepay';
    env.SAFEPAY_API_KEY = '';
    env.SAFEPAY_SECRET = '';
    expect(isGatewayAvailable('safepay')).toBe(false);

    expect.assertions(4);
    try {
      getPaymentGateway('safepay');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
      expect(err.message).toMatch(/safepay/);
    }
  });

  test('enabled AND real keys present -> factory resolves it (but the driver itself still refuses to actually run)', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,safepay';
    env.SAFEPAY_API_KEY = 'APIKEY123';
    env.SAFEPAY_SECRET = 'SECRET123';
    expect(isGatewayAvailable('safepay')).toBe(true);
    const driver = getPaymentGateway('safepay');
    expect(driver).toBe(safepayGateway);
  });
});
