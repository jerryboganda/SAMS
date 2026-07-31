// server/tests/helpers/loginFlow.js
// Shared login-flow helpers used by several auth test files. Centralized so
// the "every brand-new device triggers REVERIFY_REQUIRED" behavior (by
// design — see server/src/services/authService.js's detectSuspicious/
// DECISIONS.md) is driven through its real HTTP round trip exactly once,
// instead of every test file re-deriving it.
import request from 'supertest';
import { testOutbox } from '../../src/utils/mailer.js';

/**
 * Extracts the 6-digit reverify-login code emailed to `email` — searches the
 * in-test mailer outbox (server/src/utils/mailer.js `testOutbox`, populated
 * only under NODE_ENV=test) from most-recent to oldest so repeated
 * suspicious-login attempts in one test file still resolve the right code.
 */
export function extractReverifyCode(email) {
  const mail = [...testOutbox].reverse().find((m) => m.to === email && /login verification/i.test(m.subject));
  if (!mail) throw new Error(`No reverify-code email found in testOutbox for ${email}`);
  const match = mail.text.match(/\n\n(\d{6})\n\n/);
  if (!match) throw new Error(`Could not find a 6-digit code in reverify email text: ${mail.text}`);
  return match[1];
}

/** Extracts the raw verify-email token from the most recent verification email sent to `email`. */
export function extractVerifyEmailToken(email) {
  const mail = [...testOutbox].reverse().find((m) => m.to === email && /verify your/i.test(m.subject));
  if (!mail) throw new Error(`No verify-email email found in testOutbox for ${email}`);
  const match = mail.text.match(/token=([0-9a-f]+)/);
  if (!match) throw new Error(`Could not find a token in verify-email text: ${mail.text}`);
  return match[1];
}

/** Extracts the raw reset-password token from the most recent reset email sent to `email`. */
export function extractResetPasswordToken(email) {
  const mail = [...testOutbox].reverse().find((m) => m.to === email && /reset your/i.test(m.subject));
  if (!mail) throw new Error(`No password-reset email found in testOutbox for ${email}`);
  const match = mail.text.match(/token=([0-9a-f]+)/);
  if (!match) throw new Error(`Could not find a token in reset-password email text: ${mail.text}`);
  return match[1];
}

/**
 * Logs in from a genuinely brand-new "device" (fresh cookie jar + a distinct
 * User-Agent so the fingerprint is new too) and completes the mandatory
 * reverify-login step, returning a supertest agent that now holds a fully
 * authenticated session (access_token + refresh_token + device_token
 * cookies) plus the raw login/reverify responses for assertions.
 */
export async function loginNewDeviceAndReverify(app, { email, password, userAgent = 'jest-agent/1.0' }) {
  const agent = request.agent(app);

  const loginRes = await agent
    .post('/api/v1/auth/login')
    .set('User-Agent', userAgent)
    .send({ email, password });

  if (loginRes.status !== 401 || loginRes.body?.error?.code !== 'REVERIFY_REQUIRED') {
    throw new Error(
      `loginNewDeviceAndReverify: expected REVERIFY_REQUIRED on first login from a new device, got ` +
        `${loginRes.status} ${JSON.stringify(loginRes.body)}`
    );
  }

  const code = extractReverifyCode(email);
  const reverifyRes = await agent.post('/api/v1/auth/reverify').set('User-Agent', userAgent).send({ email, code });

  return { agent, loginRes, reverifyRes };
}

/** Parses a raw cookie value (e.g. "refresh_token") out of a supertest response's Set-Cookie headers. */
export function getCookieValue(res, name) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  const header = setCookie.find((c) => c.startsWith(`${name}=`));
  if (!header) return null;
  return header.split(';')[0].slice(name.length + 1);
}
