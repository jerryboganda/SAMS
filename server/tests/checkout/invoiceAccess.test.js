// server/tests/checkout/invoiceAccess.test.js
// docs/07_EXECUTION_PLAN.md 9.2 AC: "invoice PDF access control (a different
// user or anonymous request 403/401s)". GET /orders/:id/invoice.pdf and
// GET /orders/:id are owner-or-admin only (docs/04_API_SPEC.md §5) — the
// classic IDOR check.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

async function createOrderAsOwner() {
  const email = uniqueEmail('invoice-owner');
  await createVerifiedUser({ email });
  const { agent: ownerAgent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-invoice-owner' });
  const course = await createCourse({ price: 5000 });
  const orderRes = await ownerAgent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
  return { ownerAgent, orderId: orderRes.body.data.order.id };
}

describe('GET /api/v1/orders/:id and GET /api/v1/orders/:id/invoice.pdf — owner or admin only', () => {
  test('the owning student can view the order and download its invoice PDF', async () => {
    const { ownerAgent, orderId } = await createOrderAsOwner();

    const detailRes = await ownerAgent.get(`/api/v1/orders/${orderId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.id).toBe(orderId);

    const invoiceRes = await ownerAgent.get(`/api/v1/orders/${orderId}/invoice.pdf`);
    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('a DIFFERENT student gets 403 FORBIDDEN for both routes', async () => {
    const { orderId } = await createOrderAsOwner();

    const email = uniqueEmail('invoice-other-student');
    await createVerifiedUser({ email });
    const { agent: otherAgent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-invoice-other' });

    const detailRes = await otherAgent.get(`/api/v1/orders/${orderId}`);
    expect(detailRes.status).toBe(403);
    expect(detailRes.body.error.code).toBe('FORBIDDEN');

    const invoiceRes = await otherAgent.get(`/api/v1/orders/${orderId}/invoice.pdf`);
    expect(invoiceRes.status).toBe(403);
  });

  test('an anonymous (unauthenticated) request gets 401 for both routes', async () => {
    const { orderId } = await createOrderAsOwner();

    const detailRes = await request(app).get(`/api/v1/orders/${orderId}`);
    expect(detailRes.status).toBe(401);

    const invoiceRes = await request(app).get(`/api/v1/orders/${orderId}/invoice.pdf`);
    expect(invoiceRes.status).toBe(401);
  });

  test('an admin can view ANY order and download its invoice PDF', async () => {
    const { orderId } = await createOrderAsOwner();
    const { agent: adminAgent } = await createAdminSession(app);

    const detailRes = await adminAgent.get(`/api/v1/orders/${orderId}`);
    expect(detailRes.status).toBe(200);

    const invoiceRes = await adminAgent.get(`/api/v1/orders/${orderId}/invoice.pdf`);
    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('GET /orders/:id for a nonexistent order 404s even for an authenticated owner-candidate', async () => {
    const email = uniqueEmail('invoice-nonexistent');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-invoice-nonexistent' });

    const res = await agent.get('/api/v1/orders/999999999');
    expect(res.status).toBe(404);
  });
});
