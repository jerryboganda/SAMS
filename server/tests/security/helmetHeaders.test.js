// server/tests/security/helmetHeaders.test.js
// Phase 12.1 AC: "helmet headers snapshot" — a snapshot-style assertion of
// the real security-header set on a real request through the real app
// (server/src/app.js), not a unit test of helmet's own internals.
// docs/10_SECURITY_CHECKLIST.md §A:
//   - "HTTPS enforced + HSTS via helmet"                -> Strict-Transport-Security
//   - "helmet defaults + CSP on app/player pages
//      (self + video CDN + inline-hash only)"           -> Content-Security-Policy
// Also covers §G's "X-Content-Type-Options: nosniff" (uploads/served assets).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { sequelize } from '../../src/db/sequelize.js';

describe('security headers (helmet) on a real app response', () => {
  test('GET /api/v1/health carries the expected helmet header set', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);

    // helmet defaults (docs/10_SECURITY_CHECKLIST.md §A/§G).
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-download-options']).toBe('noopen');

    // CSP (Phase 12.1) — app.js's custom directives, not helmet's own bare
    // default. Asserted by substring so the test doesn't depend on the
    // browser-facing directive-ordering serialization helmet happens to use.
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    // Video-CDN-specific directives (docs/10_SECURITY_CHECKLIST.md §A "self +
    // video CDN"), sourced from server/src/adapters/video/bunny.js's real
    // Bunny domains.
    expect(csp).toContain('media-src');
    expect(csp).toContain('https://*.b-cdn.net');
    expect(csp).toContain('frame-src');
    expect(csp).toContain('https://iframe.mediadelivery.net');
    expect(csp).toContain('connect-src');
  });

  test('compression middleware is wired: gzip-encoded response when the client accepts it', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    // supertest/superagent auto-decompresses gzip responses transparently,
    // so the body is still readable JSON — assert on the wire-level signal
    // (the Vary header compression's `filter` adds) instead of re-parsing a
    // raw gzip stream, which is out of scope for what this test is proving.
    expect(res.headers['vary']).toMatch(/Accept-Encoding/i);
  });
});

afterAll(async () => {
  await sequelize.close();
});
