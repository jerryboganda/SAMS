// server/src/config/constants.js
// Central home for Phase 2 (auth/devices/sessions) timing + policy constants,
// so magic numbers aren't scattered across services. See docs/04_API_SPEC.md
// §1/§8 and docs/02_ARCHITECTURE.md §4 for the values these encode.

// --- Sessions ---------------------------------------------------------------
export const ACCESS_TOKEN_TTL_MINUTES = 15;
export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;

export const REFRESH_TOKEN_TTL_DAYS = 30;
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export const DEVICE_COOKIE_TTL_DAYS = 365;
export const DEVICE_COOKIE_TTL_MS = DEVICE_COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;

// --- Devices ------------------------------------------------------------
export const MAX_ACTIVE_DEVICES = 2;

// --- Lockout / suspicious-login detection --------------------------------
// Both windows share the same 15-minute value deliberately (see DECISIONS.md)
// — the schema doesn't prescribe separate windows, and reusing one constant
// keeps lockout and suspicion counting consistent with each other.
export const LOCKOUT_FAIL_THRESHOLD = 6;
export const LOCKOUT_WINDOW_MINUTES = 15;
export const SUSPICIOUS_FAIL_THRESHOLD = 3;
export const SUSPICIOUS_WINDOW_MINUTES = 15;

// --- One-time tokens ------------------------------------------------------
export const VERIFY_EMAIL_TOKEN_TTL_HOURS = 24;
export const RESET_PASSWORD_TOKEN_TTL_HOURS = 1;
export const REVERIFY_LOGIN_TOKEN_TTL_MINUTES = 15;

// --- Rate limits ------------------------------------------------------------
export const RESEND_VERIFICATION_MAX_PER_HOUR = 3;
// Per-IP companion cap alongside the email-keyed limit above (security audit
// 2026-07-31, Finding 5) — bounds a single IP cycling through many target
// emails, which the email-keyed limiter alone can't catch.
export const RESEND_VERIFICATION_MAX_PER_IP_PER_HOUR = 30;

// --- Reverify-login brute-force lockout --------------------------------
// Account-keyed lockout for POST /auth/reverify (security audit 2026-07-31,
// Finding 3), analogous to LOCKOUT_FAIL_THRESHOLD/LOCKOUT_WINDOW_MINUTES for
// login itself but intentionally its own constants — the 6-digit reverify
// code has far less entropy than a password, so a stricter/independent knob
// is appropriate even though the window matches for consistency today.
export const REVERIFY_FAIL_THRESHOLD = 5;
export const REVERIFY_LOCKOUT_WINDOW_MINUTES = 15;

// --- 2FA --------------------------------------------------------------------
export const BACKUP_CODES_COUNT = 10;
