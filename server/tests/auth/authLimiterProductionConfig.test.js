// server/tests/auth/authLimiterProductionConfig.test.js
// docs/08_TESTING_QA.md's "Rate limits: 11th login attempt in window -> 429"
// row. `authLimiter` (src/middleware/rateLimits.js) deliberately raises its
// `max` sky-high under NODE_ENV=test (see that file's own header comment) so
// the many-requests-per-scenario auth test suite doesn't trip a spurious 429
// — which also means no other test file can ever observe the REAL production
// boundary (max:10 / 15min window).
//
// This file proves that real boundary WITHOUT mutating the real
// process.env.NODE_ENV (which would risk repointing config/database.js's
// DB_NAME_test selection for this whole worker process) and without booting
// the full app/DB at all: it uses `jest.unstable_mockModule` to replace ONLY
// `src/config/env.js`'s `NODE_ENV` field for THIS test file's own isolated
// ESM module registry (Jest gives every test file a fresh module registry —
// confirmed by rateLimits.js's own contactLimiter doc comment, which relies
// on the exact same isolation guarantee), then dynamically imports the REAL,
// unmodified `rateLimits.js` module so its `IS_TEST` constant evaluates
// false and `authLimiter` is exported with its real max:10 config. A
// throwaway isolated Express route (same pattern tests/rateLimits.test.js
// already establishes for the tiny-window mechanism check) is enough to
// prove the exact boundary — no app.js/DB required, so this can never leak
// into or be affected by any other test file/worker.
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';

let authLimiter;

beforeAll(async () => {
  jest.unstable_mockModule('../../src/config/env.js', () => ({
    env: { NODE_ENV: 'production' },
    default: { NODE_ENV: 'production' },
  }));
  ({ authLimiter } = await import('../../src/middleware/rateLimits.js'));
});

afterAll(() => {
  jest.resetModules();
});

function buildApp() {
  const app = express();
  app.post('/test/auth-limited', authLimiter, (req, res) => {
    res.status(200).json({ success: true, data: { ok: true } });
  });
  return app;
}

describe('authLimiter — real (non-test) production config: max:10 requests / 15 min window', () => {
  test('the 10th request in the window still succeeds; the 11th gets a real 429 RATE_LIMITED envelope', async () => {
    const app = buildApp();

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/test/auth-limited');
      expect(res.status).toBe(200);
    }

    const eleventh = await request(app).post('/test/auth-limited');
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
  });
});
