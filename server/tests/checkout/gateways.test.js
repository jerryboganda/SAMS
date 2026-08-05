// server/tests/checkout/gateways.test.js
// GET /checkout/gateways (docs/07_EXECUTION_PLAN.md 9.7 — new endpoint, see
// DECISIONS.md 2026-08-05 and docs/04_API_SPEC.md §5). Proves the response
// reuses adapters/payments/index.js#isGatewayAvailable's real enabled+
// configured gate rather than a hardcoded list: `mock` is enabled by default
// (.env.example PAYMENTS_ENABLED_GATEWAYS=mock), while an unconfigured
// gateway not in that list (e.g. jazzcash, with no secrets set in the test
// env) reports enabled:false.
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentAgent(prefix) {
  const email = uniqueEmail(prefix);
  await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return agent;
}

describe('GET /api/v1/checkout/gateways', () => {
  test('lists every known gateway code with a real enabled flag', async () => {
    const agent = await studentAgent('gateways-list');

    const res = await agent.get('/api/v1/checkout/gateways');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const codes = res.body.data.map((g) => g.code);
    expect(codes).toEqual(expect.arrayContaining(['jazzcash', 'easypaisa', 'raast', 'payfast', 'safepay', 'bank_transfer', 'mock']));
    for (const gw of res.body.data) {
      expect(typeof gw.enabled).toBe('boolean');
      expect(typeof gw.name).toBe('string');
    }
  });

  test('mock is enabled by default (PAYMENTS_ENABLED_GATEWAYS=mock per .env.example)', async () => {
    const agent = await studentAgent('gateways-mock');

    const res = await agent.get('/api/v1/checkout/gateways');

    const mock = res.body.data.find((g) => g.code === 'mock');
    expect(mock.enabled).toBe(true);
  });

  test('an unconfigured/not-enabled gateway (jazzcash — not in PAYMENTS_ENABLED_GATEWAYS in the test env) reports enabled:false', async () => {
    const agent = await studentAgent('gateways-jazzcash');

    const res = await agent.get('/api/v1/checkout/gateways');

    const jazzcash = res.body.data.find((g) => g.code === 'jazzcash');
    expect(jazzcash.enabled).toBe(false);
  });

  test('unauthenticated request is rejected', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/checkout/gateways');
    expect(res.status).toBe(401);
  });
});
