// server/tests/checkout/mockFlow.e2e.test.js
// The literal AC scenario for docs/07_EXECUTION_PLAN.md 9.2:
// "e2e test: quote -> order -> mock pay -> enrollment active -> invoice PDF
// exists -> notification row". Drives the real HTTP endpoints exactly as a
// browser would (quote -> create order -> follow the mock gateway's
// redirectUrl to GET /checkout/return/:gateway), then asserts DB + disk
// state, mirroring this codebase's established e2e-via-supertest style
// (tests/student/video/streamLockConcurrency.test.js etc.).
import fs from 'node:fs';
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { env } from '../../src/config/env.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { INVOICES_DIR } from '../../src/services/invoiceService.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Order, Enrollment, Notification, PaymentEvent } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('E2E: quote -> order -> mock pay -> enrollment active -> invoice PDF -> notification', () => {
  test('the full mock-gateway purchase flow leaves consistent DB + disk state', async () => {
    const email = uniqueEmail('e2e-mock-flow');
    const { user } = await createVerifiedUser({ email, name: 'E2E Test Student' });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-e2e-mock' });
    const course = await createCourse({ price: 15000, validityDays: 180 });

    // 1. Quote
    const quoteRes = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id });
    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.data.finalAmount).toBe(15000);

    // 2. Create order (mock gateway)
    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
    expect(orderRes.status).toBe(201);
    const { order, redirectUrl } = orderRes.body.data;
    expect(order.status).toBe('pending');
    expect(redirectUrl).toBeTruthy();

    // 3. Follow the mock gateway's redirect back to our own return route —
    // exactly the same request shape a real browser bounce-back would make.
    // Uses the ACTUAL returned redirectUrl's path+query verbatim (not a
    // hardcoded '/api/v1/checkout/return/mock' guess) so this test would have
    // caught the real missing-'/api/v1'-prefix bug a live browser hit
    // (docs/07_EXECUTION_PLAN.md 9.7 live-verification find, DECISIONS.md
    // 2026-08-05) — before this fix, redirectUrl's pathname was the WRONG
    // '/checkout/return/mock' (no /api/v1), which 404s against the real
    // mount (server/src/routes/v1/index.js), but this test's own hardcoded
    // literal silently papered over that.
    const returnUrl = new URL(redirectUrl);
    const returnRes = await agent.get(`${returnUrl.pathname}${returnUrl.search}`);
    expect(returnRes.status).toBe(302);
    expect(returnRes.headers.location).toBe(`${env.APP_URL}/order/${order.id}/status`);

    // 4. Order is paid.
    const paidOrder = await Order.findByPk(order.id);
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.paidAt).not.toBeNull();
    expect(paidOrder.gatewayRef).toBe(`mock-${order.id}`);

    // 5. Enrollment is active with the right validity window.
    const enrollment = await Enrollment.findOne({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('active');
    expect(enrollment.source).toBe('purchase');
    const expectedExpiryMs = new Date(enrollment.startsAt).getTime() + 180 * 24 * 60 * 60 * 1000;
    expect(Math.abs(new Date(enrollment.expiresAt).getTime() - expectedExpiryMs)).toBeLessThan(5000);

    // 6. Invoice PDF exists on disk (not a public path — see invoiceService.js).
    const invoicePath = `${INVOICES_DIR}/${paidOrder.invoiceNo}.pdf`;
    expect(fs.existsSync(invoicePath)).toBe(true);
    expect(fs.statSync(invoicePath).size).toBeGreaterThan(0);

    // 7. The authenticated invoice route actually streams it.
    const invoiceRes = await agent.get(`/api/v1/orders/${order.id}/invoice.pdf`);
    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.headers['content-type']).toMatch(/application\/pdf/);

    // 8. Notification row created.
    const notification = await Notification.findOne({ where: { userId: user.id, type: 'purchase_paid' } });
    expect(notification).not.toBeNull();
    expect(notification.title).toMatch(/purchase confirmed/i);

    // 9. Confirmation email sent (minimal Phase 9.2 mailer call — see orderService.js).
    const mail = testOutbox.find((m) => m.to === email && /purchase is confirmed/i.test(m.subject));
    expect(mail).toBeTruthy();

    // 10. payment_events logged the verified success, raw payload included.
    const event = await PaymentEvent.findOne({ where: { orderId: order.id, gateway: 'mock', eventType: 'payment.success' } });
    expect(event).not.toBeNull();
    expect(event.signatureValid).toBe(true);
    expect(event.payload).toMatchObject({ orderId: String(order.id) });

    // 11. GET /orders and GET /orders/:id reflect the paid state.
    const listRes = await agent.get('/api/v1/orders');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.find((o) => o.id === order.id).status).toBe('paid');

    const detailRes = await agent.get(`/api/v1/orders/${order.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.status).toBe('paid');
  });
});
