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

function buildIsolatedLimiterApp() {
  const app = express();
  const tinyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    handler: envelopeHandler('RATE_LIMITED', 'Too many requests. Please try again later.'),
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
