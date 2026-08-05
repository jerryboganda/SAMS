// server/tests/adapters/payments/payfast.test.js
// Unit tests for the `payfast` PLACEHOLDER PaymentGateway driver
// (docs/07_EXECUTION_PLAN.md 9.5b) — proves it is genuinely
// non-functional-by-default (isConfigured() false until real env keys are
// set) and that it never silently pretends to succeed if ever actually
// invoked. No DB access needed (env-var-gated only, unlike raast/
// bank_transfer.test.js).
import { afterEach, describe, expect, test } from '@jest/globals';
import payfastGateway from '../../../src/adapters/payments/payfast.js';
import { getPaymentGateway, isGatewayAvailable } from '../../../src/adapters/payments/index.js';
import { env } from '../../../src/config/env.js';

describe('payfast payment adapter — PLACEHOLDER stub contract', () => {
  test('code is "payfast"', () => {
    expect(payfastGateway.code).toBe('payfast');
  });

  test('isConfigured() is false by default (no PAYFAST_MERCHANT_ID/PAYFAST_SECURED_KEY in test env)', () => {
    expect(env.PAYFAST_MERCHANT_ID).toBe('');
    expect(env.PAYFAST_SECURED_KEY).toBe('');
    expect(payfastGateway.isConfigured()).toBe(false);
  });

  test('isConfigured() requires BOTH merchant id AND secured key non-empty', () => {
    const original = { PAYFAST_MERCHANT_ID: env.PAYFAST_MERCHANT_ID, PAYFAST_SECURED_KEY: env.PAYFAST_SECURED_KEY };
    try {
      env.PAYFAST_MERCHANT_ID = 'MERCHANT123';
      env.PAYFAST_SECURED_KEY = '';
      expect(payfastGateway.isConfigured()).toBe(false);

      env.PAYFAST_MERCHANT_ID = '';
      env.PAYFAST_SECURED_KEY = 'SECUREDKEY123';
      expect(payfastGateway.isConfigured()).toBe(false);

      env.PAYFAST_MERCHANT_ID = 'MERCHANT123';
      env.PAYFAST_SECURED_KEY = 'SECUREDKEY123';
      expect(payfastGateway.isConfigured()).toBe(true);
    } finally {
      Object.assign(env, original);
    }
  });

  test('createCheckout() throws (never silently succeeds) if ever actually invoked, regardless of the factory gate', async () => {
    await expect(payfastGateway.createCheckout({ id: 1 })).rejects.toThrow(/PLACEHOLDER/);
  });

  test('handleCallback() throws (never silently returns a fake success) if ever actually invoked', async () => {
    await expect(payfastGateway.handleCallback({ query: {}, body: {} })).rejects.toThrow(/PLACEHOLDER/);
  });
});

describe('payfast — payments factory integration', () => {
  const original = {
    PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS,
    PAYFAST_MERCHANT_ID: env.PAYFAST_MERCHANT_ID,
    PAYFAST_SECURED_KEY: env.PAYFAST_SECURED_KEY,
  };
  afterEach(() => Object.assign(env, original));

  test('registered in DRIVERS but reports unavailable while not enabled', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock';
    expect(isGatewayAvailable('payfast')).toBe(false);
  });

  test('enabled but unconfigured (no real keys) -> STILL unavailable -> 422 GATEWAY_NOT_CONFIGURED (the placeholder-stub contract this task requires)', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,payfast';
    env.PAYFAST_MERCHANT_ID = '';
    env.PAYFAST_SECURED_KEY = '';
    expect(isGatewayAvailable('payfast')).toBe(false);

    expect.assertions(4);
    try {
      getPaymentGateway('payfast');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
      expect(err.message).toMatch(/payfast/);
    }
  });

  test('enabled AND real keys present -> factory resolves it (but the driver itself still refuses to actually run — see createCheckout()\'s own test above)', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,payfast';
    env.PAYFAST_MERCHANT_ID = 'MERCHANT123';
    env.PAYFAST_SECURED_KEY = 'SECUREDKEY123';
    expect(isGatewayAvailable('payfast')).toBe(true);
    const driver = getPaymentGateway('payfast');
    expect(driver).toBe(payfastGateway);
  });
});
