// server/tests/checkout/jazzcashFlow.e2e.test.js
// Adapts tests/checkout/mockFlow.e2e.test.js (full purchase flow) and
// tests/checkout/idempotentReplay.test.js (replay safety) for the REAL
// `jazzcash` driver instead of `mock` — docs/07_EXECUTION_PLAN.md 9.3's own
// AC: "fire the same successful callback twice ... this test just proves
// your driver's return shape integrates cleanly with [the] existing shared
// [success] path" (orderService.processGatewayCallback/completeOrderPayment,
// unchanged, already correct from Phase 9.1-9.2).
//
// Drives the real HTTP endpoints: POST /checkout/orders (gateway:'jazzcash')
// -> a hand-built, GENUINELY pp_SecureHash-signed IPN payload (simulating
// what JazzCash's own server would POST to our webhook — see
// server/src/adapters/payments/jazzcash.js for the exact algorithm this
// reuses via its own exported `computeSecureHash`) -> POST
// /webhooks/payments/jazzcash -> asserts DB + disk state, fired twice for
// the idempotency half.
//
// env.PAYMENTS_ENABLED_GATEWAYS / env.JAZZCASH_* are mutated for the
// duration of this file only and restored afterward — same pattern
// tests/adapters/video/bunny.test.js already uses for env-gated drivers
// (env.js's exported `env` is a plain, mutable object; every call site reads
// it live, never caches it at import time — see src/adapters/payments/index.js's
// getEnabledGatewayCodes()/isConfigured()).
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { env } from '../../src/config/env.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { INVOICES_DIR } from '../../src/services/invoiceService.js';
import { computeSecureHash } from '../../src/adapters/payments/jazzcash.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Order, Enrollment, Notification, PaymentEvent } = db;

const JAZZCASH_TEST_SALT = 'jest-jazzcash-integrity-salt';
const originalEnv = {
  PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS,
  JAZZCASH_MERCHANT_ID: env.JAZZCASH_MERCHANT_ID,
  JAZZCASH_PASSWORD: env.JAZZCASH_PASSWORD,
  JAZZCASH_INTEGRITY_SALT: env.JAZZCASH_INTEGRITY_SALT,
};

beforeAll(() => {
  env.PAYMENTS_ENABLED_GATEWAYS = 'mock,jazzcash';
  env.JAZZCASH_MERCHANT_ID = 'JESTMERCHANT01';
  env.JAZZCASH_PASSWORD = 'jest-password';
  env.JAZZCASH_INTEGRITY_SALT = JAZZCASH_TEST_SALT;
});

afterAll(async () => {
  Object.assign(env, originalEnv);
  await sequelize.close();
});

/** Simulates JazzCash's own server building a genuinely-signed IPN/return payload for a given (echoed) pp_TxnRefNo — same algorithm the real gateway uses, per jazzcash.js's own doc-sourced computeSecureHash. */
function buildSignedGatewayResponse({ txnRefNo, amountPaisas, responseCode = '000' }) {
  const fields = {
    pp_TxnRefNo: txnRefNo, // JazzCash echoes back exactly what we sent (§6.1 response table)
    pp_Amount: String(amountPaisas),
    pp_ResponseCode: responseCode,
    pp_ResponseMessage: responseCode === '000' ? 'Thank you for Using JazzCash, your transaction was successful.' : 'Declined',
    pp_RetreivalReferenceNo: `RRN-${txnRefNo}`,
    pp_TxnCurrency: 'PKR',
  };
  fields.pp_SecureHash = computeSecureHash(fields, JAZZCASH_TEST_SALT);
  return fields;
}

describe('E2E: quote -> order -> JazzCash hosted-checkout -> signed IPN -> enrollment active -> invoice PDF -> notification', () => {
  test('the full JazzCash purchase flow (real driver, hand-signed IPN) leaves consistent DB + disk state', async () => {
    const email = uniqueEmail('e2e-jazzcash-flow');
    const { user } = await createVerifiedUser({ email, name: 'E2E JazzCash Student' });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-e2e-jazzcash' });
    const course = await createCourse({ price: 15000, validityDays: 180 });

    // 1. Create order against the real jazzcash driver.
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'jazzcash' });
    expect(orderRes.status).toBe(201);
    const { order, actionUrl, method, formFields } = orderRes.body.data;
    expect(order.status).toBe('pending');
    // Hosted-checkout form-POST shape (NOT a bare redirectUrl — see jazzcash.js's createCheckout doc comment).
    expect(actionUrl).toMatch(/^https:\/\/sandbox\.jazzcash\.com\.pk\//);
    expect(method).toBe('POST');
    expect(formFields.pp_MerchantID).toBe('JESTMERCHANT01');
    expect(formFields.pp_Amount).toBe('1500000'); // 15000.00 PKR -> paisas, via toCents

    // 2. Simulate JazzCash's server calling our IPN webhook with a genuinely
    // signed success response (server-to-server — not the browser return).
    const signedResponse = buildSignedGatewayResponse({ txnRefNo: formFields.pp_TxnRefNo, amountPaisas: formFields.pp_Amount });
    const webhookRes = await agent.post('/api/v1/webhooks/payments/jazzcash').send(signedResponse);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body).toEqual({ success: true, data: { received: true } });

    // 3. Order is paid, gateway_ref set to JazzCash's own RRN (externalRef).
    const paidOrder = await Order.findByPk(order.id);
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.paidAt).not.toBeNull();
    expect(paidOrder.gatewayRef).toBe(`RRN-${formFields.pp_TxnRefNo}`);

    // 4. Enrollment active with the right validity window.
    const enrollment = await Enrollment.findOne({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('active');
    expect(enrollment.source).toBe('purchase');

    // 5. Invoice PDF exists on disk + streams via the authenticated route.
    const invoicePath = `${INVOICES_DIR}/${paidOrder.invoiceNo}.pdf`;
    expect(fs.existsSync(invoicePath)).toBe(true);
    const invoiceRes = await agent.get(`/api/v1/orders/${order.id}/invoice.pdf`);
    expect(invoiceRes.status).toBe(200);

    // 6. Notification + confirmation email sent.
    const notification = await Notification.findOne({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(notification).not.toBeNull();
    const mail = testOutbox.find((m) => m.to === email && /purchase is confirmed/i.test(m.subject));
    expect(mail).toBeTruthy();

    // 7. payment_events logged the verified success, raw pp_* payload included, signature_valid true.
    const event = await PaymentEvent.findOne({ where: { orderId: order.id, gateway: 'jazzcash', eventType: 'payment.success' } });
    expect(event).not.toBeNull();
    expect(event.signatureValid).toBe(true);
    expect(event.externalRef).toBe(`RRN-${formFields.pp_TxnRefNo}`);
    expect(event.payload).toMatchObject({ pp_TxnRefNo: formFields.pp_TxnRefNo, pp_ResponseCode: '000' });
  });

  test('a replayed IDENTICAL signed IPN is a safe no-op: order paid once, exactly 1 enrollment, exactly 1 notification (idempotency proof for a real, non-mock driver)', async () => {
    const email = uniqueEmail('e2e-jazzcash-replay');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-jazzcash-replay' });
    const course = await createCourse({ price: 8000 });

    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'jazzcash' });
    expect(orderRes.status).toBe(201);
    const { order, formFields } = orderRes.body.data;

    const signedResponse = buildSignedGatewayResponse({ txnRefNo: formFields.pp_TxnRefNo, amountPaisas: formFields.pp_Amount });

    // First callback: real success path runs.
    const first = await agent.post('/api/v1/webhooks/payments/jazzcash').send(signedResponse);
    expect(first.status).toBe(200);
    const paidOnce = await Order.findByPk(order.id);
    expect(paidOnce.status).toBe('paid');
    const paidAtFirst = paidOnce.paidAt.getTime();

    // Second, IDENTICAL callback (same pp_TxnRefNo/pp_SecureHash) — must be a no-op.
    const second = await agent.post('/api/v1/webhooks/payments/jazzcash').send(signedResponse);
    expect(second.status).toBe(200);
    const paidTwice = await Order.findByPk(order.id);
    expect(paidTwice.status).toBe('paid');
    expect(paidTwice.paidAt.getTime()).toBe(paidAtFirst); // unchanged — the update never re-ran

    const enrollments = await Enrollment.findAll({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
    expect(enrollments.length).toBe(1);

    const notifications = await Notification.findAll({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(notifications.length).toBe(1);

    // Every callback IS still logged (audit trail) — 2 rows, both verified — even though only the first drove any side effects.
    const events = await PaymentEvent.findAll({ where: { orderId: order.id, gateway: 'jazzcash', eventType: 'payment.success' } });
    expect(events.length).toBe(2);
    expect(events.every((e) => e.signatureValid === true)).toBe(true);
  });

  test('a forged pp_SecureHash on the IPN never pays the order (logged as an unverified attempt, order stays pending)', async () => {
    const email = uniqueEmail('e2e-jazzcash-forged');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-jazzcash-forged' });
    const course = await createCourse({ price: 5000 });

    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'jazzcash' });
    const { order, formFields } = orderRes.body.data;

    const forged = buildSignedGatewayResponse({ txnRefNo: formFields.pp_TxnRefNo, amountPaisas: formFields.pp_Amount });
    forged.pp_SecureHash = forged.pp_SecureHash.slice(0, -1) + (forged.pp_SecureHash.at(-1) === '0' ? '1' : '0');

    const res = await agent.post('/api/v1/webhooks/payments/jazzcash').send(forged);
    expect(res.status).toBe(200); // always 200 to the gateway regardless of outcome

    const stillPending = await Order.findByPk(order.id);
    expect(stillPending.status).toBe('pending');

    const event = await PaymentEvent.findOne({ where: { orderId: order.id, gateway: 'jazzcash', eventType: 'payment.callback.invalid_signature' } });
    expect(event).not.toBeNull();
    expect(event.signatureValid).toBe(false);
  });
});
