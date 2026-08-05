// server/tests/adapters/payments/raast.test.js
// Unit tests for the `raast` PaymentGateway driver (docs/07_EXECUTION_PLAN.md
// 9.5) — a MANUAL pseudo-gateway sourced entirely from admin-editable
// `settings['payments']`, not env vars/an external API (see raast.js's own
// header). Covers isConfigured()'s always-true/sync/no-I/O contract,
// createCheckout()'s Settings-driven manualDetails shape (+ its own
// GATEWAY_NOT_CONFIGURED completeness check), and handleCallback()'s
// always-failing no-op. The DB-backed proof-upload/admin-approval flow this
// driver plugs into is covered end-to-end by
// tests/checkout/bankTransferFlow.e2e.test.js (raast half).
import { afterAll, afterEach, describe, expect, test } from '@jest/globals';
import db from '../../../src/models/index.js';
import raastGateway from '../../../src/adapters/payments/raast.js';
import { getPaymentGateway, isGatewayAvailable } from '../../../src/adapters/payments/index.js';
import { env } from '../../../src/config/env.js';

const { Setting, sequelize } = db;

afterEach(async () => {
  await Setting.destroy({ where: { key: 'payments' } });
});

afterAll(async () => {
  await sequelize.close();
});

describe('raast payment adapter — interface contract', () => {
  test('code is "raast"', () => {
    expect(raastGateway.code).toBe('raast');
  });

  test('isConfigured() is always true, sync, no I/O — the real Settings-completeness check lives in createCheckout() instead (see file header)', () => {
    const result = raastGateway.isConfigured();
    expect(result).toBe(true);
  });

  test('createCheckout() throws 422 GATEWAY_NOT_CONFIGURED on a fresh/unconfigured DB (no settings row at all)', async () => {
    expect.assertions(2);
    try {
      await raastGateway.createCheckout({ id: 1 });
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
    }
  });

  test('createCheckout() throws 422 GATEWAY_NOT_CONFIGURED when raastId/raastIban are still empty strings (settings row exists but incomplete)', async () => {
    await Setting.upsert({ key: 'payments', value: { bankName: 'Meezan Bank', accountTitle: 'SAMS Academy', raastId: '', raastIban: '' } });
    expect.assertions(2);
    try {
      await raastGateway.createCheckout({ id: 1 });
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
    }
  });

  test('createCheckout() returns { orderId, manualDetails } sourced from Settings > Payments when fully configured', async () => {
    await Setting.upsert({
      key: 'payments',
      value: {
        bankName: 'Meezan Bank Limited, Main Campus Branch',
        accountTitle: 'SAMS ACADEMY PRIVATE LIMITED',
        raastId: '03001234567@raast',
        raastIban: 'PK36MEZN0001020304050607',
        raastQrImage: 'https://example.test/qr.png',
      },
    });

    const result = await raastGateway.createCheckout({ id: 42 });
    expect(result.orderId).toBe(42);
    expect(result.manualDetails).toEqual({
      raastId: '03001234567@raast',
      iban: 'PK36MEZN0001020304050607',
      accountTitle: 'SAMS ACADEMY PRIVATE LIMITED',
      bankName: 'Meezan Bank Limited, Main Campus Branch',
      qrImageUrl: 'https://example.test/qr.png',
    });
  });

  test('handleCallback() — always signatureValid:false, status:failed, never throws (there is no real gateway that ever calls this back)', async () => {
    const result = await raastGateway.handleCallback({ query: { orderId: '5' }, body: {} });
    expect(result.orderRef).toBe('5');
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.unsupported_manual_gateway');
  });

  test('handleCallback() — missing orderId entirely -> orderRef null, still never throws', async () => {
    const result = await raastGateway.handleCallback({ query: {}, body: {} });
    expect(result.orderRef).toBeNull();
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
  });
});

describe('raast — payments factory integration', () => {
  const original = { PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS };
  afterEach(() => Object.assign(env, original));

  test('registered in DRIVERS but reports unavailable while not listed in PAYMENTS_ENABLED_GATEWAYS (default "mock")', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock';
    expect(isGatewayAvailable('raast')).toBe(false);
  });

  test('enabled -> available immediately (isConfigured() is always true) -> resolves the real driver, interface-conformant', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,raast';
    expect(isGatewayAvailable('raast')).toBe(true);
    const driver = getPaymentGateway('raast');
    expect(driver).toBe(raastGateway);
    expect(driver.code).toBe('raast');
    expect(typeof driver.createCheckout).toBe('function');
    expect(typeof driver.handleCallback).toBe('function');
  });
});
