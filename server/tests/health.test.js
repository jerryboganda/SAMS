// server/tests/health.test.js
// Smoke test: GET /api/v1/health must return the standard envelope.
// docs/08_TESTING_QA.md requires the test suite to run against a real,
// dedicated DB_NAME_test MySQL database (migrated fresh per run) — so
// db:true is the expected, meaningful result here. If this ever comes back
// false, that means the test MySQL DB itself isn't reachable/configured,
// which is a real test-environment problem worth failing loudly on rather
// than masking with a db:false expectation.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { sequelize } from '../src/db/sequelize.js';

describe('GET /api/v1/health', () => {
  test('returns the standard success envelope with db:true', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', db: true },
    });
  });
});

// Close the (unconnected) Sequelize connection pool so Jest can exit
// cleanly instead of hanging on open handles.
afterAll(async () => {
  await sequelize.close();
});
