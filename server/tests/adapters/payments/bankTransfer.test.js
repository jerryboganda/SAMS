// server/tests/adapters/payments/bankTransfer.test.js
// Unit tests for the `bank_transfer` PaymentGateway driver
// (docs/07_EXECUTION_PLAN.md 9.6) — mirrors raast.test.js's structure
// exactly (see that file's header + bankTransfer.js's own header for the
// full "why this and raast are separate driver files sharing one Settings
// reader" rationale).
import { afterAll, afterEach, describe, expect, test } from '@jest/globals';
import db from '../../../src/models/index.js';
import bankTransferGateway from '../../../src/adapters/payments/bankTransfer.js';
import { getPaymentGateway, isGatewayAvailable } from '../../../src/adapters/payments/index.js';
import { env } from '../../../src/config/env.js';

const { Setting, sequelize } = db;

afterEach(async () => {
  await Setting.destroy({ where: { key: 'payments' } });
});

afterAll(async () => {
  await sequelize.close();
});

describe('bank_transfer payment adapter — interface contract', () => {
  test('code is "bank_transfer"', () => {
    expect(bankTransferGateway.code).toBe('bank_transfer');
  });

  test('isConfigured() is always true, sync, no I/O', () => {
    expect(bankTransferGateway.isConfigured()).toBe(true);
  });

  test('createCheckout() throws 422 GATEWAY_NOT_CONFIGURED on a fresh/unconfigured DB', async () => {
    expect.assertions(2);
    try {
      await bankTransferGateway.createCheckout({ id: 1 });
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
    }
  });

  test('createCheckout() throws 422 GATEWAY_NOT_CONFIGURED when bankName/accountTitle/iban are still incomplete', async () => {
    await Setting.upsert({ key: 'payments', value: { bankName: 'Meezan Bank', accountTitle: '', iban: '' } });
    expect.assertions(2);
    try {
      await bankTransferGateway.createCheckout({ id: 1 });
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GATEWAY_NOT_CONFIGURED');
    }
  });

  test('createCheckout() returns { orderId, manualDetails } with raastId/qrImageUrl blank (not applicable to a plain bank transfer)', async () => {
    await Setting.upsert({
      key: 'payments',
      value: {
        bankName: 'Meezan Bank Limited, Main Campus Branch',
        accountTitle: 'SAMS ACADEMY PRIVATE LIMITED',
        iban: 'PK36MEZN0001020304050607',
        raastId: '03001234567@raast', // present in Settings but irrelevant to THIS gateway
      },
    });

    const result = await bankTransferGateway.createCheckout({ id: 99 });
    expect(result.orderId).toBe(99);
    expect(result.manualDetails).toEqual({
      raastId: '',
      iban: 'PK36MEZN0001020304050607',
      accountTitle: 'SAMS ACADEMY PRIVATE LIMITED',
      bankName: 'Meezan Bank Limited, Main Campus Branch',
      qrImageUrl: '',
    });
  });

  test('handleCallback() — always signatureValid:false, status:failed, never throws', async () => {
    const result = await bankTransferGateway.handleCallback({ query: { orderId: '9' }, body: {} });
    expect(result.orderRef).toBe('9');
    expect(result.status).toBe('failed');
    expect(result.signatureValid).toBe(false);
    expect(result.eventType).toBe('payment.callback.unsupported_manual_gateway');
  });
});

describe('bank_transfer — payments factory integration', () => {
  const original = { PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS };
  afterEach(() => Object.assign(env, original));

  test('registered in DRIVERS but reports unavailable while not listed in PAYMENTS_ENABLED_GATEWAYS (default "mock")', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock';
    expect(isGatewayAvailable('bank_transfer')).toBe(false);
  });

  test('enabled -> available immediately -> resolves the real driver, interface-conformant', () => {
    env.PAYMENTS_ENABLED_GATEWAYS = 'mock,bank_transfer';
    expect(isGatewayAvailable('bank_transfer')).toBe(true);
    const driver = getPaymentGateway('bank_transfer');
    expect(driver).toBe(bankTransferGateway);
    expect(driver.code).toBe('bank_transfer');
    expect(typeof driver.createCheckout).toBe('function');
    expect(typeof driver.handleCallback).toBe('function');
  });
});
