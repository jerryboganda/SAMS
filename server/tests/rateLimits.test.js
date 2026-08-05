// server/tests/rateLimits.test.js
// Verifies the rate-limit 429 envelope mechanism itself, referenced from
// server/src/middleware/rateLimits.js's header comment. The production
// /auth/* limiters have their `max` raised sharply under NODE_ENV=test (see
// that file) so a real 429 can't be triggered through the live app in-process
// without an impractically large request burst — instead, this mounts the
// exact same `envelopeHandler` (imported from the real module, not
// reimplemented) on an isolated Express app with a tiny window/max, proving
// the shape and status code independent of production wiring.
import { describe, expect, test } from '@jest/globals';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { envelopeHandler } from '../src/middleware/rateLimits.js';

function buildIsolatedLimiterApp(message = 'Too many requests. Please try again later.') {
  const app = express();
  const tinyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    handler: envelopeHandler('RATE_LIMITED', message),
  });
  app.get('/test/limited', tinyLimiter, (req, res) => {
    res.status(200).json({ success: true, data: { ok: true } });
  });
  return app;
}

describe('rate limit 429 envelope', () => {
  test('requests under the cap succeed; the request that exceeds it gets the standard 429 envelope', async () => {
    const app = buildIsolatedLimiterApp();

    const first = await request(app).get('/test/limited');
    expect(first.status).toBe(200);

    const second = await request(app).get('/test/limited');
    expect(second.status).toBe(200);

    const third = await request(app).get('/test/limited');
    expect(third.status).toBe(429);
    expect(third.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
  });
});

// Phase 12.1 — importLimiter (POST /admin/questions/import/dry-run + commit,
// docs/10_SECURITY_CHECKLIST.md §H "import 10/h") and checkoutLimiter
// (POST /checkout/quote + POST /checkout/orders, DECISIONS.md 2026-08-05
// Finding L-2). Both have `max` raised sharply under NODE_ENV=test (same
// reason as authLimiter/playLimiter/heartbeatLimiter — see this file's own
// header comment), so — same as the block above — each is exercised here via
// an isolated small-window instance mounting the exact same `envelopeHandler`
// imported from the real module, proving the shape/status code of each
// limiter's own message independent of production wiring/`max`.
describe('importLimiter 429 envelope', () => {
  test('the request that exceeds the cap gets the standard 429 envelope with the import-specific message', async () => {
    const app = buildIsolatedLimiterApp('Too many import requests. Please try again later.');

    expect((await request(app).get('/test/limited')).status).toBe(200);
    expect((await request(app).get('/test/limited')).status).toBe(200);

    const third = await request(app).get('/test/limited');
    expect(third.status).toBe(429);
    expect(third.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many import requests. Please try again later.' },
    });
  });
});

describe('checkoutLimiter 429 envelope', () => {
  test('the request that exceeds the cap gets the standard 429 envelope with the checkout-specific message', async () => {
    const app = buildIsolatedLimiterApp('Too many checkout requests. Please try again later.');

    expect((await request(app).get('/test/limited')).status).toBe(200);
    expect((await request(app).get('/test/limited')).status).toBe(200);

    const third = await request(app).get('/test/limited');
    expect(third.status).toBe(429);
    expect(third.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many checkout requests. Please try again later.' },
    });
  });
});
