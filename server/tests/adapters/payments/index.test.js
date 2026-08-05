// server/tests/adapters/payments/index.test.js
// PaymentGateway factory (docs/07_EXECUTION_PLAN.md 9.2): keyed by gateway
// code per call (not resolved once at import time like the video adapter —
// see src/adapters/payments/index.js's header for why). This task only
// registers the `mock` driver; jazzcash/easypaisa/raast/bank_transfer/
// payfast/safepay are separate follow-up tasks (9.3-9.6/9.5b) and are
// asserted here to correctly report "not available yet" in the meantime.
import { describe, expect, test } from '@jest/globals';
import { getPaymentGateway, isGatewayAvailable, getEnabledGatewayCodes } from '../../../src/adapters/payments/index.js';
import mockGateway from '../../../src/adapters/payments/mock.js';

describe('payments adapter factory', () => {
  test('env.PAYMENTS_ENABLED_GATEWAYS default (.env.example: "mock") parses to exactly ["mock"]', () => {
    expect(getEnabledGatewayCodes()).toEqual(['mock']);
  });

  test('getPaymentGateway("mock") resolves the mock driver, interface-conformant', () => {
    const driver = getPaymentGateway('mock');
    expect(driver).toBe(mockGateway);
    expect(driver.code).toBe('mock');
    expect(typeof driver.isConfigured).toBe('function');
    expect(typeof driver.createCheckout).toBe('function');
    expect(typeof driver.handleCallback).toBe('function');
    expect(driver.isConfigured()).toBe(true);
  });

  test('isGatewayAvailable("mock") is true; a never-registered code is false without throwing', () => {
    expect(isGatewayAvailable('mock')).toBe(true);
    expect(isGatewayAvailable('not-a-real-gateway')).toBe(false);
  });

  test('a gateway with no registered driver yet (jazzcash — a 9.3 follow-up task) reports unavailable, not a crash', () => {
    expect(isGatewayAvailable('jazzcash')).toBe(false);
  });

  test('getPaymentGateway() throws 422 GATEWAY_NOT_CONFIGURED for an unknown/unregistered code', () => {
    expect.assertions(3);
    try {
      getPaymentGateway('not-a-real-gateway');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
      expect(err.message).toMatch(/not-a-real-gateway/);
    }
  });

  test('getPaymentGateway() throws the SAME 422 GATEWAY_NOT_CONFIGURED for a registered-but-not-enabled code (jazzcash, not in PAYMENTS_ENABLED_GATEWAYS=mock)', () => {
    expect.assertions(2);
    try {
      getPaymentGateway('jazzcash');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
    }
  });
});
