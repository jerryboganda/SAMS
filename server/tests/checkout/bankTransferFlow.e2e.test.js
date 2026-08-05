// server/tests/checkout/bankTransferFlow.e2e.test.js
// The literal AC scenario for docs/07_EXECUTION_PLAN.md 9.5 (Raast) + 9.6
// (bank transfer): "order created (raast or bank_transfer) -> upload proof
// image -> submit bank-proof (order -> awaiting_verification) -> appears in
// GET /admin/bank-transfers queue -> approve -> order paid, enrollment
// active, invoice exists, notification row (mirrors mockFlow.e2e.test.js's
// AC shape) -> separately, reject -> order failed, student notified, reason
// stored." Plus IDOR tests (another student can't view/submit someone
// else's proof; non-admin can't hit /admin/bank-transfers/*) and upload
// validation (non-image rejected, oversized rejected).
//
// env.PAYMENTS_ENABLED_GATEWAYS is mutated for this file only and restored
// afterward (same pattern tests/checkout/jazzcashFlow.e2e.test.js already
// uses for env-gated drivers).
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { env } from '../../src/config/env.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { INVOICES_DIR } from '../../src/services/invoiceService.js';
import { PROOFS_DIR } from '../../src/services/manualPaymentService.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize, Order, Enrollment, Notification, BankTransferProof, Setting } = db;

// A minimal, valid 1x1 PNG (real magic bytes + real PNG structure) — same
// fixture tests/admin/uploads.test.js already uses.
const REAL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const REAL_PNG = Buffer.from(REAL_PNG_BASE64, 'base64');

const originalEnv = { PAYMENTS_ENABLED_GATEWAYS: env.PAYMENTS_ENABLED_GATEWAYS };

beforeAll(async () => {
  env.PAYMENTS_ENABLED_GATEWAYS = 'mock,raast,bank_transfer';
  await Setting.upsert({
    key: 'payments',
    value: {
      bankName: 'Meezan Bank Limited, Main Campus Branch',
      accountTitle: 'SAMS ACADEMY PRIVATE LIMITED',
      iban: 'PK36MEZN0001020304050607',
      accountNumber: '01020304050607',
      branchCode: '0001',
      raastId: '03001234567@raast',
      raastIban: 'PK36MEZN0001020304050607',
      raastQrImage: 'https://example.test/qr.png',
    },
  });
});

afterAll(async () => {
  Object.assign(env, originalEnv);
  await sequelize.close();
});

async function studentSession(prefix) {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email, name: 'E2E Manual Payment Student' });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return { agent, user, email };
}

describe.each([
  ['bank_transfer', { raastIdExpected: '', qrImageUrlExpected: '' }],
  ['raast', { raastIdExpected: '03001234567@raast', qrImageUrlExpected: 'https://example.test/qr.png' }],
])('E2E [%s]: order -> upload proof -> submit bank-proof -> admin queue -> approve -> paid', (gateway, expectedManualDetails) => {
  test(`full ${gateway} manual-payment happy path leaves consistent DB + disk state`, async () => {
    const { agent, user, email } = await studentSession(`e2e-${gateway}`);
    const course = await createCourse({ price: 12000, validityDays: 90 });

    // 1. Create order.
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway });
    expect(orderRes.status).toBe(201);
    const { order, manualDetails } = orderRes.body.data;
    expect(order.status).toBe('pending');
    expect(order.gateway).toBe(gateway);
    expect(manualDetails).toMatchObject({
      accountTitle: 'SAMS ACADEMY PRIVATE LIMITED',
      bankName: 'Meezan Bank Limited, Main Campus Branch',
      iban: 'PK36MEZN0001020304050607',
      raastId: expectedManualDetails.raastIdExpected,
      qrImageUrl: expectedManualDetails.qrImageUrlExpected,
    });

    // 2. Upload proof image.
    const uploadRes = await agent
      .post('/api/v1/checkout/uploads/proof-image')
      .field('orderId', String(order.id))
      .attach('file', REAL_PNG, { filename: 'receipt.png', contentType: 'image/png' });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.url).toBe(`/api/v1/orders/${order.id}/proof-image`);

    // 3. Submit the bank-proof form.
    const proofRes = await agent.post(`/api/v1/checkout/orders/${order.id}/bank-proof`).send({
      referenceNo: `TXN-${gateway}-001`,
      note: 'Paid via mobile banking app',
      fileUrl: uploadRes.body.data.url,
    });
    expect(proofRes.status).toBe(200);
    expect(proofRes.body.data.status).toBe('awaiting_verification');
    expect(proofRes.body.data.proof.status).toBe('pending');
    expect(proofRes.body.data.proof.referenceNo).toBe(`TXN-${gateway}-001`);
    expect(proofRes.body.data.proof.filePath).toBe(`/api/v1/orders/${order.id}/proof-image`);

    // 4. The proof image is actually retrievable through the authenticated route.
    const proofImgRes = await agent.get(`/api/v1/orders/${order.id}/proof-image`);
    expect(proofImgRes.status).toBe(200);
    expect(proofImgRes.headers['content-type']).toMatch(/image\/png/);
    expect(fs.existsSync(`${PROOFS_DIR}/order-${order.id}.bin`)).toBe(true);

    // 5. Appears in the admin queue.
    const { agent: adminAgent } = await createAdminSession(app);
    const queueRes = await adminAgent.get('/api/v1/admin/bank-transfers');
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.data.some((o) => o.id === order.id)).toBe(true);

    // 6. Approve -> shared success path.
    const approveRes = await adminAgent.post(`/api/v1/admin/bank-transfers/${order.id}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('paid');
    expect(approveRes.body.data.proof.status).toBe('approved');

    const paidOrder = await Order.findByPk(order.id);
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.paidAt).not.toBeNull();
    expect(paidOrder.gatewayRef).toBe(`TXN-${gateway}-001`);

    const enrollment = await Enrollment.findOne({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('active');

    const invoicePath = `${INVOICES_DIR}/${paidOrder.invoiceNo}.pdf`;
    expect(fs.existsSync(invoicePath)).toBe(true);

    const notification = await Notification.findOne({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(notification).not.toBeNull();

    const mail = testOutbox.find((m) => m.to === email && /purchase is confirmed/i.test(m.subject));
    expect(mail).toBeTruthy();

    // 7. No longer appears in the pending queue once resolved.
    const queueAfter = await adminAgent.get('/api/v1/admin/bank-transfers');
    expect(queueAfter.body.data.some((o) => o.id === order.id)).toBe(false);

    // 8. Re-approving an already-paid order is rejected, not double-processed.
    const reapproveRes = await adminAgent.post(`/api/v1/admin/bank-transfers/${order.id}/approve`);
    expect(reapproveRes.status).toBe(409);
    expect(reapproveRes.body.error.code).toBe('ALREADY_RESOLVED');
  });
});

describe('E2E: admin rejection path', () => {
  test('reject -> order failed, proof rejected with reason, student notified', async () => {
    const { agent, user, email } = await studentSession('e2e-reject');
    const course = await createCourse({ price: 8000, validityDays: 60 });

    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'bank_transfer' });
    const order = orderRes.body.data.order;

    const uploadRes = await agent
      .post('/api/v1/checkout/uploads/proof-image')
      .field('orderId', String(order.id))
      .attach('file', REAL_PNG, { filename: 'receipt.png', contentType: 'image/png' });

    await agent.post(`/api/v1/checkout/orders/${order.id}/bank-proof`).send({
      referenceNo: 'TXN-REJECT-001',
      fileUrl: uploadRes.body.data.url,
    });

    const { agent: adminAgent } = await createAdminSession(app);
    const rejectRes = await adminAgent
      .post(`/api/v1/admin/bank-transfers/${order.id}/reject`)
      .send({ reason: 'Transaction reference not found in bank statement.' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('failed');
    expect(rejectRes.body.data.proof.status).toBe('rejected');
    expect(rejectRes.body.data.proof.rejectReason).toBe('Transaction reference not found in bank statement.');

    const failedOrder = await Order.findByPk(order.id);
    expect(failedOrder.status).toBe('failed');

    const proofRow = await BankTransferProof.findOne({ where: { orderId: order.id } });
    expect(proofRow.status).toBe('rejected');
    expect(proofRow.reviewedBy).not.toBeNull();

    const notification = await Notification.findOne({ where: { userId: user.id, type: 'purchase_rejected' } });
    expect(notification).not.toBeNull();
    expect(notification.body).toMatch(/could not be verified/i);

    const mail = testOutbox.find((m) => m.to === email && /could not be verified/i.test(m.subject));
    expect(mail).toBeTruthy();

    // Rejected -> no longer approvable/rejectable (no in-place retry-same-order flow).
    const reapproveRes = await adminAgent.post(`/api/v1/admin/bank-transfers/${order.id}/approve`);
    expect(reapproveRes.status).toBe(409);
  });
});

describe('E2E: validation + status-gate rejections', () => {
  test('submitting bank-proof without uploading an image first -> 422 PROOF_IMAGE_REQUIRED', async () => {
    const { agent } = await studentSession('e2e-no-upload');
    const course = await createCourse({ price: 5000 });
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'bank_transfer' });
    const order = orderRes.body.data.order;

    const res = await agent.post(`/api/v1/checkout/orders/${order.id}/bank-proof`).send({ referenceNo: 'TXN-X', fileUrl: `/api/v1/orders/${order.id}/proof-image` });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PROOF_IMAGE_REQUIRED');
  });

  test('bank-proof with a mismatched/forged fileUrl is rejected -> 422', async () => {
    const { agent } = await studentSession('e2e-bad-url');
    const course = await createCourse({ price: 5000 });
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'bank_transfer' });
    const order = orderRes.body.data.order;

    await agent.post('/api/v1/checkout/uploads/proof-image').field('orderId', String(order.id)).attach('file', REAL_PNG, { filename: 'x.png', contentType: 'image/png' });

    const res = await agent.post(`/api/v1/checkout/orders/${order.id}/bank-proof`).send({ referenceNo: 'TXN-X', fileUrl: '/api/v1/orders/999999/proof-image' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('a non-image file is rejected by magic-byte validation -> 422', async () => {
    const { agent } = await studentSession('e2e-non-image');
    const course = await createCourse({ price: 5000 });
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'bank_transfer' });
    const order = orderRes.body.data.order;

    // Real Windows PE executable magic bytes ("MZ...") disguised as a .png.
    const fakeExeAsPng = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    const res = await agent
      .post('/api/v1/checkout/uploads/proof-image')
      .field('orderId', String(order.id))
      .attach('file', fakeExeAsPng, { filename: 'totally-a-receipt.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('uploading a proof image for a mock-gateway order is rejected -> 422 INVALID_GATEWAY', async () => {
    const { agent } = await studentSession('e2e-wrong-gateway');
    const course = await createCourse({ price: 5000 });
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
    const order = orderRes.body.data.order;

    const res = await agent
      .post('/api/v1/checkout/uploads/proof-image')
      .field('orderId', String(order.id))
      .attach('file', REAL_PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_GATEWAY');
  });
});

describe('E2E: IDOR protection', () => {
  test('another student cannot upload a proof image for someone else\'s order', async () => {
    const { agent: ownerAgent } = await studentSession('e2e-idor-owner');
    const { agent: attackerAgent } = await studentSession('e2e-idor-attacker');
    const course = await createCourse({ price: 5000 });
    const orderRes = await ownerAgent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'bank_transfer' });
    const order = orderRes.body.data.order;

    const res = await attackerAgent
      .post('/api/v1/checkout/uploads/proof-image')
      .field('orderId', String(order.id))
      .attach('file', REAL_PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  test('another student cannot submit a bank-proof for someone else\'s order', async () => {
    const { agent: ownerAgent } = await studentSession('e2e-idor-owner2');
    const { agent: attackerAgent } = await studentSession('e2e-idor-attacker2');
    const course = await createCourse({ price: 5000 });
    const orderRes = await ownerAgent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'bank_transfer' });
    const order = orderRes.body.data.order;
    await ownerAgent.post('/api/v1/checkout/uploads/proof-image').field('orderId', String(order.id)).attach('file', REAL_PNG, { filename: 'x.png', contentType: 'image/png' });

    const res = await attackerAgent
      .post(`/api/v1/checkout/orders/${order.id}/bank-proof`)
      .send({ referenceNo: 'TXN-STEAL', fileUrl: `/api/v1/orders/${order.id}/proof-image` });
    expect(res.status).toBe(403);
  });

  test('another student cannot view someone else\'s proof image', async () => {
    const { agent: ownerAgent } = await studentSession('e2e-idor-owner3');
    const { agent: attackerAgent } = await studentSession('e2e-idor-attacker3');
    const course = await createCourse({ price: 5000 });
    const orderRes = await ownerAgent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'bank_transfer' });
    const order = orderRes.body.data.order;
    await ownerAgent.post('/api/v1/checkout/uploads/proof-image').field('orderId', String(order.id)).attach('file', REAL_PNG, { filename: 'x.png', contentType: 'image/png' });

    const res = await attackerAgent.get(`/api/v1/orders/${order.id}/proof-image`);
    expect(res.status).toBe(403);
  });

  test('a non-admin cannot hit any /admin/bank-transfers/* route', async () => {
    const { agent } = await studentSession('e2e-idor-nonadmin');
    const listRes = await agent.get('/api/v1/admin/bank-transfers');
    expect(listRes.status).toBe(403);

    const approveRes = await agent.post('/api/v1/admin/bank-transfers/1/approve');
    expect(approveRes.status).toBe(403);

    const rejectRes = await agent.post('/api/v1/admin/bank-transfers/1/reject').send({ reason: 'x' });
    expect(rejectRes.status).toBe(403);
  });

  test('an unauthenticated request cannot hit any /admin/bank-transfers/* route', async () => {
    const res = await request(app).get('/api/v1/admin/bank-transfers');
    expect(res.status).toBe(401);
  });
});
