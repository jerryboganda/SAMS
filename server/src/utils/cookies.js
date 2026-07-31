// server/src/utils/cookies.js
// Central place for the three auth cookies' options, so every issuer/clearer
// agrees on flags (httpOnly, sameSite, secure) — docs/10_SECURITY_CHECKLIST.md
// §A "Cookies: httpOnly, Secure (prod), SameSite=Lax; no tokens in localStorage".
import { env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS, DEVICE_COOKIE_TTL_MS } from '../config/constants.js';

const BASE_OPTS = Object.freeze({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/',
});

export function setAccessTokenCookie(res, token) {
  res.cookie('access_token', token, { ...BASE_OPTS, maxAge: ACCESS_TOKEN_TTL_MS });
}

export function setRefreshTokenCookie(res, token) {
  res.cookie('refresh_token', token, { ...BASE_OPTS, maxAge: REFRESH_TOKEN_TTL_MS });
}

export function setDeviceTokenCookie(res, token) {
  res.cookie('device_token', token, { ...BASE_OPTS, maxAge: DEVICE_COOKIE_TTL_MS });
}

/**
 * Clears the session cookies (access + refresh) on logout. Deliberately does
 * NOT clear device_token — the device cookie identifies the physical
 * browser/device across logout+login cycles, which is the whole point of the
 * 2-active-devices limit; clearing it on every logout would let a user dodge
 * the limit for free by logging out and back in. See DECISIONS.md.
 */
export function clearSessionCookies(res) {
  res.clearCookie('access_token', BASE_OPTS);
  res.clearCookie('refresh_token', BASE_OPTS);
}
