// server/tests/checkout/webhook.test.js
// POST /webhooks/payments/:gateway (docs/04_API_SPEC.md §5: "Always 200 to
// gateway"). Complements mockFlow.e2e.test.js (which exercises the browser
// GET-return path) by exercising the POST/IPN-webhook path specifically,
// and proves the "always 200" contract holds even for garbage input.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Order, PaymentEvent } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/webhooks/payments/:gateway', () => {
  test('a genuinely valid mock IPN body completes the order and still responds 200', async () => {
    const email = uniqueEmail('webhook-valid');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-webhook-valid' });
    const course = await createCourse({ price: 5000 });

    const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
    const { order, redirectUrl } = orderRes.body.data;
    const { orderId, token } = Object.fromEntries(new URL(redirectUrl).searchParams);

    const res = await request(app).post('/api/v1/webhooks/payments/mock').send({ orderId, token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const paidOrder = await Order.findByPk(order.id);
    expect(paidOrder.status).toBe('paid');
  });

  test('an unknown gateway code still responds 200 (never surfaces an error to the sender)', async () => {
    const res = await request(app).post('/api/v1/webhooks/payments/not-a-real-gateway').send({ foo: 'bar' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('a malformed/garbage body for a known gateway still responds 200 and logs the attempt', async () => {
    const res = await request(app).post('/api/v1/webhooks/payments/mock').send({ nonsense: true });
    expect(res.status).toBe(200);

    const events = await PaymentEvent.findAll({
      where: { gateway: 'mock', eventType: 'payment.callback.malformed' },
      order: [['id', 'DESC']],
      limit: 1,
    });
    expect(events.length).toBe(1);
    expect(events[0].signatureValid).toBe(false);
  });
});
