// server/src/services/adminSettingsService.js
// GET/PUT /admin/settings business logic (docs/04_API_SPEC.md §7: "site info,
// legal pages, bank details, gateway+video+SMTP keys — returned masked,
// write-only fields"). Aggregates the `settings` table (one JSON row per
// key) into the section shape client/src/pages/admin/SettingsManagementPage.tsx
// expects (site/payments/video/smtp/legal), masks sensitive leaves on read,
// and — the classic bug this must NOT have — never lets a masked placeholder
// submitted back unedited clobber the real stored secret. See DECISIONS.md.
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { ADMIN_SETTINGS_SECTIONS, ADMIN_SETTINGS_RAW_KEYS } from '../config/constants.js';
import { sendMail as sendMailDefault } from '../utils/mailer.js';

const { Setting } = db;

// ---------------------------------------------------------------------------
// Section defaults — returned when no `settings` row exists yet for a
// section, so GET /admin/settings never errors on a fresh DB (only the
// legal.*/site.about keys are seeded by Phase 1; site/payments/video/smtp
// don't exist until an admin first saves them).
// ---------------------------------------------------------------------------
const SECTION_DEFAULTS = {
  site: {
    name: '',
    tagline: '',
    supportEmail: '',
    supportPhone: '',
    whatsapp: '',
    facebookUrl: '',
    instagramUrl: '',
    youtubeUrl: '',
  },
  payments: {
    bankName: '',
    accountTitle: '',
    iban: '',
    accountNumber: '',
    branchCode: '',
    raastId: '',
    raastIban: '',
    raastQrImage: '',
    enabledGateways: [],
    gatewayKeys: {
      jazzcashMerchantId: '',
      jazzcashPassword: '',
      jazzcashIntegritySalt: '',
      easypaisaStoreId: '',
      easypaisaHashKey: '',
      payfastMerchantId: '',
      payfastSecuredKey: '',
      safepayApiKey: '',
      safepaySecret: '',
    },
  },
  video: {
    bunnyLibraryId: '',
    bunnyCdnHostname: '',
    bunnyApiKey: '',
    bunnyTokenAuthKey: '',
  },
  smtp: {
    host: '',
    port: '',
    user: '',
    password: '',
    fromName: '',
    secure: false,
  },
};

// Explicit allowlist of dot-paths (within a section object) known today to
// hold a secret/sensitive value — never echoed back raw.
const SENSITIVE_PATHS = {
  site: new Set(),
  payments: new Set([
    'iban',
    'accountNumber',
    'raastId',
    'raastIban',
    'gatewayKeys.jazzcashMerchantId',
    'gatewayKeys.jazzcashPassword',
    'gatewayKeys.jazzcashIntegritySalt',
    'gatewayKeys.easypaisaStoreId',
    'gatewayKeys.easypaisaHashKey',
    'gatewayKeys.payfastMerchantId',
    'gatewayKeys.payfastSecuredKey',
    'gatewayKeys.safepayApiKey',
    'gatewayKeys.safepaySecret',
  ]),
  video: new Set(['bunnyApiKey', 'bunnyTokenAuthKey']),
  smtp: new Set(['password']),
  legal: new Set(),
};

// Forward-looking convention (task brief: "a naming convention... for future
// gateway/SMTP/video secret keys even though none exist yet"): any settings
// leaf whose key name looks secret-shaped is ALSO masked automatically, even
// before it's added to SENSITIVE_PATHS above — so a future gateway/SMTP/
// video field added in a later phase is masked by default rather than
// silently leaking raw until someone remembers to update this file.
const SENSITIVE_NAME_PATTERN =
  /secret|password|passwd|api[-_]?key|token|salt|iban|account[-_]?number|hash[-_]?key|private[-_]?key/i;

function isSensitivePath(section, dotPath) {
  if (SENSITIVE_PATHS[section]?.has(dotPath)) return true;
  const leaf = dotPath.split('.').pop();
  return SENSITIVE_NAME_PATTERN.test(leaf);
}

/** `"9001234567890123"` -> `"****0123"`; short/empty values are fully masked so no length leaks. */
function maskValue(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  const str = String(raw);
  if (str.length <= 4) return '*'.repeat(str.length);
  return `****${str.slice(-4)}`;
}

/** Deep-clone `obj`, replacing every sensitive leaf (by dot-path) with its mask. Non-plain-object values (arrays, primitives) pass through untouched. */
function maskSection(section, obj, prefix = '') {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = maskSection(section, value, dotPath);
    } else if (isSensitivePath(section, dotPath)) {
      out[key] = maskValue(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Deep-merge `incoming` onto `current`: plain objects merge key-by-key recursively; arrays/primitives replace wholesale. `undefined` in `incoming` leaves `current` untouched. */
function deepMerge(current, incoming) {
  if (incoming === undefined) return current;
  const bothPlainObjects =
    current !== null &&
    typeof current === 'object' &&
    !Array.isArray(current) &&
    incoming !== null &&
    typeof incoming === 'object' &&
    !Array.isArray(incoming);
  if (!bothPlainObjects) return incoming;
  const out = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    out[key] = deepMerge(current[key], value);
  }
  return out;
}

/**
 * Applies an admin-submitted section update onto the currently-stored raw
 * section object. For every sensitive leaf, if the submitted value is
 * exactly the mask GET would currently render for it, the real stored value
 * is preserved instead of being overwritten with literal asterisks — this is
 * what makes "admin opens Settings, doesn't touch the password field, saves"
 * a safe no-op instead of destroying the real secret. A submitted value that
 * differs from the mask is treated as a genuine new secret and stored as-is.
 */
function applySectionUpdate(section, current, incoming, prefix = '') {
  if (incoming === undefined) return current;
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;

  const base = current !== null && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const out = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = applySectionUpdate(section, base[key], value, dotPath);
    } else if (isSensitivePath(section, dotPath)) {
      const currentRaw = base[key];
      out[key] = value === maskValue(currentRaw) ? currentRaw : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function getRawSection(section) {
  const row = await Setting.findByPk(section);
  return deepMerge(SECTION_DEFAULTS[section] || {}, row ? row.value : undefined);
}

async function getLegalSection() {
  const [privacy, terms, refund] = await Promise.all([
    Setting.findByPk('legal.privacy'),
    Setting.findByPk('legal.terms'),
    Setting.findByPk('legal.refund'),
  ]);
  return {
    privacyPolicy: privacy?.value?.content ?? '',
    termsAndConditions: terms?.value?.content ?? '',
    refundPolicy: refund?.value?.content ?? '',
  };
}

async function putLegalSection(incoming) {
  const updates = [
    ['legal.privacy', 'Privacy Policy', incoming.privacyPolicy],
    ['legal.terms', 'Terms & Conditions', incoming.termsAndConditions],
    ['legal.refund', 'Refund Policy', incoming.refundPolicy],
  ];
  for (const [key, defaultTitle, content] of updates) {
    if (content === undefined) continue;
    const existing = await Setting.findByPk(key);
    const title = existing?.value?.title || defaultTitle;
    await Setting.upsert({ key, value: { title, content } });
  }
  return getLegalSection();
}

// ---------------------------------------------------------------------------
// GET /admin/settings
// ---------------------------------------------------------------------------

export async function getAllSettings() {
  const [site, payments, video, smtp, legal] = await Promise.all([
    getRawSection('site'),
    getRawSection('payments'),
    getRawSection('video'),
    getRawSection('smtp'),
    getLegalSection(),
  ]);
  return {
    site: maskSection('site', site),
    payments: maskSection('payments', payments),
    video: maskSection('video', video),
    smtp: maskSection('smtp', smtp),
    legal, // legal-page text is never sensitive — returned raw
  };
}

// ---------------------------------------------------------------------------
// PUT /admin/settings/:section — one section at a time (matches
// client/src/api/endpoints/admin.ts's updateSettings(section, data)).
// ---------------------------------------------------------------------------

export async function updateSection(section, incoming) {
  if (!ADMIN_SETTINGS_SECTIONS.includes(section)) {
    throw new ApiError(404, 'NOT_FOUND', `Unknown settings section "${section}".`);
  }
  if (section === 'legal') {
    return putLegalSection(incoming);
  }
  const current = await getRawSection(section);
  const merged = applySectionUpdate(section, current, incoming);
  await Setting.upsert({ key: section, value: merged });
  return maskSection(section, merged);
}

// ---------------------------------------------------------------------------
// PUT /admin/settings — bulk, one-or-more keys per docs/04_API_SPEC.md §7's
// literal `GET/PUT /admin/settings` contract (aggregated sections and/or
// individual allowlisted legal/about keys in one call).
// ---------------------------------------------------------------------------

export async function updateMany(payload) {
  const result = {};
  for (const [key, value] of Object.entries(payload)) {
    if (ADMIN_SETTINGS_SECTIONS.includes(key)) {
      result[key] = await updateSection(key, value);
    } else if (ADMIN_SETTINGS_RAW_KEYS.includes(key)) {
      const existing = await Setting.findByPk(key);
      const title = value?.title ?? existing?.value?.title ?? key;
      const content = value?.content ?? existing?.value?.content ?? '';
      await Setting.upsert({ key, value: { title, content } });
      result[key] = { title, content };
    } else {
      // Defensive — the controller's per-key validation should already
      // reject this before the service is ever called with it.
      throw new ApiError(422, 'VALIDATION_ERROR', `Unknown or disallowed settings key "${key}".`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// POST /admin/settings/smtp/test (Phase 13.3 — see DECISIONS.md's
// pre-Phase-13.3 entry: this was flagged as a real gap, deliberately not
// built during Phase 4.4, "SMTP hardening" territory. This closes it.)
// ---------------------------------------------------------------------------

/**
 * Sends a real test email through the app's already-configured mail
 * transport (server/src/utils/mailer.js — driven by the `SMTP_*` env vars
 * per docs/09_DEPLOYMENT_HOSTINGER.md, falling back to nodemailer's
 * jsonTransport "log instead of send" behavior when unconfigured, exactly
 * like every other transactional email this app sends). Deliberately does
 * NOT read SMTP credentials from the request body (that would let anyone
 * with admin access relay test mail through an arbitrary attacker-supplied
 * SMTP host — a real security hole) and does NOT rebuild a transport from
 * the `settings` table's `smtp` section either: that DB row is this app's
 * Settings-UI DISPLAY/edit copy of the intended SMTP config (masked on read,
 * merge-on-write — see updateSection above), but it is NOT itself wired to
 * reconfigure the live mailer transport at runtime (the live transport is
 * built once, from `env.SMTP_*`, at process start — see mailer.js's own
 * header comment). Treating the DB row as authoritative here would let this
 * endpoint report a misleading "using host X" when the real delivery path
 * may be using a completely different (or no) SMTP host — flagged as a
 * known architecture gap for a future pass, not papered over here. Always
 * sends to the CALLING admin's own account email (loaded fresh from
 * `users` by id — `req.user` only carries `{id, role}`, never a
 * request-body-supplied address) — this is a self-service "does outbound
 * mail actually work" check, not a general-purpose mail-relay endpoint.
 *
 * `sendMailFn` is test-only dependency injection (defaults to the real
 * mailer's `sendMail`) so a supertest spec can simulate a genuine SMTP
 * failure without needing a real unreachable mail server; production call
 * sites never pass it. mailer.js's own `sendMail` never throws (it catches
 * internally and resolves `null` on failure, logging server-side) — this
 * function treats BOTH a caught-and-swallowed `null`/falsy return AND a
 * directly-thrown error from an injected test double as the same "failed to
 * send" outcome, so either failure-simulation style works correctly.
 */
export async function sendSmtpTest(user, { sendMailFn = sendMailDefault } = {}) {
  let info;
  try {
    info = await sendMailFn({
      to: user.email,
      subject: 'SAMS Academy — SMTP test email',
      text:
        `This is a test email confirming your SAMS Academy SMTP configuration is working.\n\n` +
        `Sent to ${user.email} at ${new Date().toISOString()}.`,
    });
  } catch {
    info = null;
  }
  if (!info) {
    // 422 (not 5xx): errorHandler.js replaces 5xx messages with a generic
    // "Something went wrong" string in production, which would bury this
    // deliberately-crafted, non-leaky-but-still-useful message exactly when
    // an admin needs to see it. Mirrors this codebase's existing
    // GATEWAY_NOT_CONFIGURED precedent (adapters/payments/index.js) for
    // "an external/configured integration isn't working right now".
    throw new ApiError(
      422,
      'SMTP_TEST_FAILED',
      'Could not send the test email. Check your SMTP host, port, and credentials, then try again.'
    );
  }
  return { success: true, message: `Test email sent to ${user.email}.` };
}
