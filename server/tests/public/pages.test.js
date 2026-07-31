// server/tests/public/pages.test.js
// GET /public/pages/:key (docs/04_API_SPEC.md §2, task 3.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';

const { sequelize, Setting } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/public/pages/:key', () => {
  test('happy path: returns {key,title,content} for an allowed key that has a settings row', async () => {
    await Setting.create({
      key: 'legal.terms',
      value: { title: 'Terms & Conditions', content: 'Sample terms content for the test suite.' },
    });

    const res = await request(app).get('/api/v1/public/pages/legal.terms');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      key: 'legal.terms',
      title: 'Terms & Conditions',
      content: 'Sample terms content for the test suite.',
    });
  });

  test('validation: a key outside the allowed enum is rejected with 422, never queried', async () => {
    const res = await request(app).get('/api/v1/public/pages/some.random.key');

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation: attempting to read an unrelated future admin-only settings key by name is rejected with 422, not 404', async () => {
    // Guards against this route ever becoming a generic settings-read oracle
    // (Phase 9 adds gateway/SMTP/bank-detail keys to this same `settings`
    // table) — must fail validation before any DB lookup, not merely 404.
    const res = await request(app).get('/api/v1/public/pages/payments.jazzcash_secret');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('an allowed key with no settings row 404s', async () => {
    const res = await request(app).get('/api/v1/public/pages/site.about');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
