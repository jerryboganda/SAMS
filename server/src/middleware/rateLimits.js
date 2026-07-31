// server/src/middleware/rateLimits.js
// Auth-specific rate limiters, additive on top of app.js's global 300/15min
// limiter (docs/02_ARCHITECTURE.md §3, docs/04_API_SPEC.md §8). Responses use
// the standard error envelope (the global limiter in app.js predates this
// phase and is left as-is — out of scope here).
//
// Test-environment note: `max` is raised sharply under NODE_ENV=test so the
// many-requests-per-scenario nature of this phase's own test suite (e.g. 6
// failed logins to prove lockout) doesn't trip the limiter and produce
// spurious 429s unrelated to what a given test is asserting. The limiter
// *mechanism* itself (429 + envelope shape) is still exercised directly by
// tests/rateLimits.test.js against an isolated small-window instance — see
// DECISIONS.md.
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import {
  RESEND_VERIFICATION_MAX_PER_HOUR,
  RESEND_VERIFICATION_MAX_PER_IP_PER_HOUR,
  CONTACT_MAX_PER_HOUR,
} from '../config/constants.js';

// Exported (not just used locally) so tests/rateLimits.test.js can mount the
// exact same 429-envelope handler on an isolated, small-window limiter
// instance — the production limiters above have their `max` raised sharply
// under NODE_ENV=test (see file header) so they can't be exercised for a
// real 429 in-process; this lets the handler's shape be verified directly.
export function envelopeHandler(code, message) {
  return (req, res) => {
    res.status(429).json({ success: false, error: { code, message } });
  };
}

const IS_TEST = env.NODE_ENV === 'test';

/** General /auth/* abuse limiter: 10 requests / 15 min / IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_TEST ? 100000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: envelopeHandler('RATE_LIMITED', 'Too many requests. Please try again later.'),
});

/** POST /auth/resend-verification: 3 / hour, keyed by the target email (not just IP). */
export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: IS_TEST ? 100000 : RESEND_VERIFICATION_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || req.ip;
  },
  handler: envelopeHandler('RATE_LIMITED', 'Too many verification requests for this email. Please try again later.'),
});

/**
 * POST /auth/resend-verification: per-IP companion limiter (security audit
 * 2026-07-31, Finding 5). The email-keyed limiter above bounds abuse of any
 * *single* target email, but one IP could otherwise cycle through many
 * different target emails with only the global 300/15min app-wide limiter as
 * a backstop. Stacked (both must run via the route's middleware chain) so a
 * single IP is separately capped regardless of which emails it targets.
 */
export const resendVerificationIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: IS_TEST ? 100000 : RESEND_VERIFICATION_MAX_PER_IP_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  handler: envelopeHandler('RATE_LIMITED', 'Too many verification requests from this network. Please try again later.'),
});

/**
 * POST /public/contact: 5 requests / hour / IP (docs/04_API_SPEC.md §8).
 *
 * Deliberately NOT raised under NODE_ENV=test like the limiters above — Phase
 * 3.1's acceptance criteria requires a supertest asserting the 6th request in
 * an hour actually gets a real 429 (server/tests/public/contact.test.js), so
 * this one keeps its real production `max` in every environment. Safe to do
 * because only that one test file's requests ever hit `/public/contact`
 * (Jest gives each test file — and therefore each fresh `import` of `app.js`
 * and this limiter's in-memory store — its own module registry, confirmed by
 * the pattern already relied on by `tests/rateLimits.test.js`), so it can't
 * produce a spurious 429 in any other suite the way authLimiter's real 10/15
 * min cap could if left unraised.
 */
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: CONTACT_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  handler: envelopeHandler('RATE_LIMITED', 'Too many messages sent. Please try again later.'),
});

/**
 * GET /student/lectures/:id/play: 30 requests / min, keyed per authenticated
 * user (falls back to per-IP for the anonymous free-preview case, since
 * there's no user id to key on) — docs/04_API_SPEC.md §8 "play endpoint
 * 30/min/user". `max` raised under NODE_ENV=test for the same reason as the
 * other limiters in this file (a security-critical-endpoint test suite hits
 * /play many times per scenario — session-steal, resume, etc. — and a real
 * 30/min cap would produce spurious 429s unrelated to what each test is
 * actually asserting).
 */
export const playLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_TEST ? 100000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
  handler: envelopeHandler('RATE_LIMITED', 'Too many playback requests. Please slow down.'),
});

/**
 * PUT /student/lectures/:id/heartbeat: 8 requests / min / user (security
 * audit 2026-07-31, Finding 2 — Medium). The real player heartbeats every
 * ~15s (client/src/components/player/SecurePlayer.tsx), i.e. ~4/min steady
 * state; 8/min gives ~2x slack for reconnects/retries/clock jitter while
 * still bounding scripted rapid-fire abuse that the elapsed-time cross-check
 * in videoService.heartbeat() also guards against independently (defense in
 * depth — this limiter bounds request volume, the cross-check bounds what
 * each individual call can credit). Mounted only on the authenticated
 * heartbeat route (after `auth`), so it can always key by user id like
 * `playLimiter` does for its authenticated case. `max` raised under
 * NODE_ENV=test for the same reason as the other limiters in this file.
 */
export const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_TEST ? 100000 : 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
  handler: envelopeHandler('RATE_LIMITED', 'Too many heartbeat requests. Please slow down.'),
});

export default {
  authLimiter,
  resendVerificationLimiter,
  resendVerificationIpLimiter,
  contactLimiter,
  playLimiter,
  heartbeatLimiter,
};
