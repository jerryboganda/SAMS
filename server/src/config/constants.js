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

// --- Public catalog & site (docs/04_API_SPEC.md §2) --------------------------
// Shared with the Course/Question models' own `exam_category` ENUM — kept
// here too since publicController.js validates the `?category=` query param
// against this same list before it ever reaches a DB query.
export const EXAM_CATEGORIES = ['NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'];

// The only settings keys GET /public/pages/:key may read — see DECISIONS.md
// 2026-07-31 (Phase 3.1): Phase 9 will add sensitive settings keys (gateway
// secrets, SMTP creds, bank details) to this same `settings` table, so this
// route must never generically resolve an arbitrary key by name.
export const PUBLIC_PAGE_KEYS = ['legal.privacy', 'legal.terms', 'legal.refund', 'site.about'];

export const PUBLIC_HOME_FEATURED_COURSES_LIMIT = 6;
export const PUBLIC_HOME_FACULTY_PREVIEW_LIMIT = 4;
export const PUBLIC_HOME_FAQ_PREVIEW_LIMIT = 4;

export const PUBLIC_COURSES_DEFAULT_LIMIT = 100;
export const PUBLIC_COURSES_MAX_LIMIT = 100;

export const PUBLIC_SAMPLE_QUESTIONS_COUNT = 5;

// POST /public/contact: 5 requests / hour / IP (docs/04_API_SPEC.md §8).
export const CONTACT_MAX_PER_HOUR = 5;

// --- Admin (docs/04_API_SPEC.md §7, Phase 4.1+4.4-merge — see DECISIONS.md) --

// docs/10_SECURITY_CHECKLIST.md §G: "5 MB cap". Magic-byte-verified image
// types only — server/src/utils/imageValidation.js sniffs the real content,
// the client-declared mimetype/extension is never trusted alone.
export const ADMIN_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

// The 5 aggregated "sections" GET/PUT /admin/settings groups the `settings`
// table into, matching client/src/pages/admin/SettingsManagementPage.tsx's
// tab structure exactly (site/payments/video/smtp) plus `legal`, which is
// itself backed by the pre-existing granular legal.*/site.about keys below.
export const ADMIN_SETTINGS_SECTIONS = ['site', 'payments', 'video', 'smtp', 'legal'];

// Individual `settings` table keys (beyond the 5 sections above) the generic
// bulk `PUT /admin/settings` may write directly — allowlisted so that route
// can never be used to write an arbitrary key by name. These are the same
// legal/about keys PUBLIC_PAGE_KEYS above reads (Phase 1 seeded, Phase 3.1
// public route) — docs/04_API_SPEC.md §7 explicitly calls out legal pages as
// editable "via this same admin endpoint".
export const ADMIN_SETTINGS_RAW_KEYS = ['legal.privacy', 'legal.terms', 'legal.refund', 'site.about'];
