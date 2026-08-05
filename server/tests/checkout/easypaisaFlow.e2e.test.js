// server/tests/checkout/easypaisaFlow.e2e.test.js
// Adapts tests/checkout/jazzcashFlow.e2e.test.js for the REAL `easypaisa`
// driver instead of `jazzcash` — docs/07_EXECUTION_PLAN.md 9.4's own AC:
// prove the driver's return shape integrates cleanly with the existing
// shared success path (orderService.processGatewayCallback/
// completeOrderPayment, unchanged, already correct from Phase 9.1-9.2).
//
// Drives the real HTTP endpoints: POST /checkout/orders (gateway:'easypaisa')
// -> a hand-built, genuinely `merchantHashedReq`-signed IPN payload
// (simulating what a caller hitting our webhook would need to supply, per
// server/src/adapters/payments/easypaisa.js's OWN callback-verification
// requirement — see that file's header note (4) for why this driver
// verifies its own hash rather than one EasyPaisa itself is documented to
// send) -> POST /webhooks/payments/easypaisa -> asserts DB + disk state,
// fired twice for the idempotency half.
//
// env.PAYMENTS_ENABLED_GATEWAYS / env.EASYPAISA_* are mutated for the
// duration of this file only and restored afterward — same pattern
// tests/checkout/jazzcashFlow.e2e.test.js already uses.
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { env } from '../../src/config/env.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { INVOICES_DIR } from '../../src/services/invoiceService.js';
import { computeMerchantHashedReq } from '../../src/adapters/payments/easypaisa.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Order, Enrollment, Notification, PaymentEvent } = db;

const EASYPAISA_TEST_HASH_KEY = 'JESTHASHKEY16BYT'; // 16 bytes -> aes-128-ecb
const originalEnv = {
  PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS,
  EASYPAISA_STORE_ID: env.EASYPAISA_STORE_ID,
  EASYPAISA_HASH_KEY: env.EASYPAISA_HASH_KEY,
};

beforeAll(() => {
  env.PAYMENTS_ENABLED_GATEWAYS = 'mock,easypaisa';
  env.EASYPAISA_STORE_ID = 'JESTSTORE01';
  env.EASYPAISA_HASH_KEY = EASYPAISA_TEST_HASH_KEY;
});

afterAll(async () => {
  Object.assign(env, originalEnv);
  await sequelize.close();
});

/** Simulates a genuine EasyPaisa postback for a given (echoed) orderRefNum — same driver-required merchantHashedReq algorithm as easypaisa.js's own computeMerchantHashedReq (see that file's header note (4) for why this driver imposes its own hash requirement on the inbound leg). */
function buildSignedGatewayResponse({ orderRefNum, desc = '0000', status = 'Success' }) {
  const fields = {
    orderRefNumber: orderRefNum, // EasyPaisa echoes back exactly what we sent as orderRefNum
    status,
    desc,
    transactionId: `TXN-${orderRefNum}`,
  };
  const orderedForHash = { desc: fields.desc, orderRefNumber: fields.orderRefNumber, status: fields.status, transactionId: fields.transactionId };
  fields.merchantHashedReq = computeMerchantHashedReq(orderedForHash, EASYPAISA_TEST_HASH_KEY);
  return fields;
}

describe('E2E: quote -> order -> EasyPaisa hosted-checkout -> signed IPN -> enrollment active -> invoice PDF -> notification', () => {
  test('the full EasyPaisa purchase flow (real driver, hand-signed IPN) leaves consistent DB + disk state', async () => {
    const email = uniqueEmail('e2e-easypaisa-flow');
    const { user } = await createVerifiedUser({ email, name: 'E2E EasyPaisa Student' });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-e2e-easypaisa' });
    const course = await createCourse({ price: 15000, validityDays: 180 });

    // 1. Create order against the real easypaisa driver.
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'easypaisa' });
    expect(orderRes.status).toBe(201);
    const { order, actionUrl, method, formFields } = orderRes.body.data;
    expect(order.status).toBe('pending');
    // Hosted-checkout form-POST shape (NOT a bare redirectUrl — see easypaisa.js's createCheckout doc comment).
    expect(actionUrl).toMatch(/^https:\/\/easypaystg\.easypaisa\.com\.pk\//);
    expect(method).toBe('POST');
    expect(formFields.storeId).toBe('JESTSTORE01');
    expect(formFields.amount).toBe('15000.0'); // 15000.00 PKR -> one-decimal PKR string

    // 2. Simulate EasyPaisa's server calling our IPN webhook with a
    // genuinely signed success response (server-to-server — not the browser return).
    const signedResponse = buildSignedGatewayResponse({ orderRefNum: formFields.orderRefNum });
    const webhookRes = await agent.post('/api/v1/webhooks/payments/easypaisa').send(signedResponse);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body).toEqual({ success: true, data: { received: true } });

    // 3. Order is paid, gateway_ref set to EasyPaisa's own transaction id (externalRef).
    const paidOrder = await Order.findByPk(order.id);
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.paidAt).not.toBeNull();
    expect(paidOrder.gatewayRef).toBe(`TXN-${formFields.orderRefNum}`);

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

    // 7. payment_events logged the verified success, raw payload included, signature_valid true.
    const event = await PaymentEvent.findOne({ where: { orderId: order.id, gateway: 'easypaisa', eventType: 'payment.success' } });
    expect(event).not.toBeNull();
    expect(event.signatureValid).toBe(true);
    expect(event.externalRef).toBe(`TXN-${formFields.orderRefNum}`);
    expect(event.payload).toMatchObject({ orderRefNumber: formFields.orderRefNum, desc: '0000' });
  });

  test('a replayed IDENTICAL signed IPN is a safe no-op: order paid once, exactly 1 enrollment, exactly 1 notification (idempotency proof for a real, non-mock driver)', async () => {
    const email = uniqueEmail('e2e-easypaisa-replay');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-easypaisa-replay' });
    const course = await createCourse({ price: 8000 });

    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'easypaisa' });
    expect(orderRes.status).toBe(201);
    const { order, formFields } = orderRes.body.data;

    const signedResponse = buildSignedGatewayResponse({ orderRefNum: formFields.orderRefNum });

    // First callback: real success path runs.
    const first = await agent.post('/api/v1/webhooks/payments/easypaisa').send(signedResponse);
    expect(first.status).toBe(200);
    const paidOnce = await Order.findByPk(order.id);
    expect(paidOnce.status).toBe('paid');
    const paidAtFirst = paidOnce.paidAt.getTime();

    // Second, IDENTICAL callback (same orderRefNumber/merchantHashedReq) — must be a no-op.
    const second = await agent.post('/api/v1/webhooks/payments/easypaisa').send(signedResponse);
    expect(second.status).toBe(200);
    const paidTwice = await Order.findByPk(order.id);
    expect(paidTwice.status).toBe('paid');
    expect(paidTwice.paidAt.getTime()).toBe(paidAtFirst); // unchanged — the update never re-ran

    const enrollments = await Enrollment.findAll({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
    expect(enrollments.length).toBe(1);

    const notifications = await Notification.findAll({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(notifications.length).toBe(1);

    // Every callback IS still logged (audit trail) — 2 rows, both verified — even though only the first drove any side effects.
    const events = await PaymentEvent.findAll({ where: { orderId: order.id, gateway: 'easypaisa', eventType: 'payment.success' } });
    expect(events.length).toBe(2);
    expect(events.every((e) => e.signatureValid === true)).toBe(true);
  });

  test('a forged merchantHashedReq on the IPN never pays the order (logged as an unverified attempt, order stays pending)', async () => {
    const email = uniqueEmail('e2e-easypaisa-forged');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-easypaisa-forged' });
    const course = await createCourse({ price: 5000 });

    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'easypaisa' });
    const { order, formFields } = orderRes.body.data;

    const forged = buildSignedGatewayResponse({ orderRefNum: formFields.orderRefNum });
    forged.merchantHashedReq = forged.merchantHashedReq.slice(0, -1) + (forged.merchantHashedReq.at(-1) === 'A' ? 'B' : 'A');

    const res = await agent.post('/api/v1/webhooks/payments/easypaisa').send(forged);
    expect(res.status).toBe(200); // always 200 to the gateway regardless of outcome

    const stillPending = await Order.findByPk(order.id);
    expect(stillPending.status).toBe('pending');

    const event = await PaymentEvent.findOne({ where: { orderId: order.id, gateway: 'easypaisa', eventType: 'payment.callback.invalid_signature' } });
    expect(event).not.toBeNull();
    expect(event.signatureValid).toBe(false);
  });
});
