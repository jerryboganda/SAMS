// server/tests/public/contact.test.js
// POST /public/contact (docs/04_API_SPEC.md §2, task 3.1).
//
// IMPORTANT — shared rate-limit budget across this file: contactLimiter caps
// at 5 requests/hour/IP (server/src/middleware/rateLimits.js), and — unlike
// the /auth/* limiters — is deliberately NOT raised under NODE_ENV=test (see
// that file's comment), so the acceptance criteria's "6th request" 429 can be
// proven directly. Every `request(app).post('/api/v1/public/contact')` call
// in this file (success or 422) consumes one unit of that same 5/hour budget,
// since express-rate-limit counts a request before the route handler's own
// validation runs. The tests below are written in a fixed order and budget
// exactly 6 requests total across the whole file — do not add another
// contact POST call to this file without re-accounting for the rate-limit
// test's cumulative count.
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';

const { sequelize, ContactMessage } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/public/contact', () => {
  // Request #1 of this file's 5/hour budget.
  test('happy path: creates a contact_messages row and emails the admin', async () => {
    const payload = {
      name: 'Dr. Test User',
      email: 'test-contact@example.test',
      subject: 'Enrollment Question',
      message: 'I would like to know more about the NRE Step 1 course, please.',
    };

    const res = await request(app).post('/api/v1/public/contact').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({ success: true, message: expect.any(String) })
    );

    const row = await ContactMessage.findOne({ where: { email: payload.email }, order: [['id', 'DESC']] });
    expect(row).not.toBeNull();
    expect(row.status).toBe('new');
    expect(row.subject).toBe(payload.subject);
    expect(row.message).toBe(payload.message);

    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0].text).toContain(payload.message);
    expect(testOutbox[0].text).toContain(payload.email);
  });

  // Request #2 of this file's 5/hour budget (still counts even though it 422s).
  test('validation: missing/invalid fields are rejected with 422 and no row is created', async () => {
    const before = await ContactMessage.count();

    const res = await request(app)
      .post('/api/v1/public/contact')
      .send({ name: '', email: 'not-an-email', message: 'short' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const after = await ContactMessage.count();
    expect(after).toBe(before);
  });

  // Requests #3, #4, #5, then #6 of this file's 5/hour budget — proves the
  // 6th request from the same IP within the window gets 429 RATE_LIMITED.
  test('rate limit: the 6th contact request from this IP within the window gets 429 RATE_LIMITED', async () => {
    const payload = {
      name: 'Rate Limit Tester',
      email: 'rate-limit-tester@example.test',
      message: 'This message is long enough to pass server-side validation checks.',
    };

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).post('/api/v1/public/contact').send(payload);
      expect(res.status).toBe(201);
    }

    const sixth = await request(app).post('/api/v1/public/contact').send(payload);
    expect(sixth.status).toBe(429);
    expect(sixth.body.success).toBe(false);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
  });
});
