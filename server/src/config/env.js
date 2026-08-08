// server/src/config/env.js
// Zod-validated environment loader. Every variable has a safe dev default
// EXCEPT true secrets (JWT_SECRET / JWT_REFRESH_SECRET), which get an
// insecure-but-functional dev default so the app can boot with zero config —
// using that default outside test is logged loudly.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/src/config -> server/src -> server
export const SERVER_ROOT = path.resolve(__dirname, '..', '..');
// server -> repo root
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

// Load server/.env first (preferred), then fall back to a repo-root .env.
// Both are optional: in production (Hostinger), env vars are injected
// directly into process.env by the host, no .env file is required.
dotenv.config({ path: path.join(SERVER_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

export const DEV_INSECURE_JWT_SECRET = 'dev-insecure-jwt-secret-change-me';
export const DEV_INSECURE_JWT_REFRESH_SECRET = 'dev-insecure-jwt-refresh-secret-change-me';
// 32 bytes / 64 hex chars of zeroes — obviously insecure, same pattern as the
// JWT secrets above: lets the app boot with zero config in dev/test, but a
// loud startup warning (below) makes it impossible to miss in a real deploy.
export const DEV_INSECURE_APP_ENCRYPTION_KEY = '0'.repeat(64);

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['true', '1', 'yes', 'on'].includes(v.toLowerCase())))
  .default(false);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_URL: z.string().min(1).default('http://localhost:5000'),

  JWT_SECRET: z.string().min(1).default(DEV_INSECURE_JWT_SECRET),
  JWT_REFRESH_SECRET: z.string().min(1).default(DEV_INSECURE_JWT_REFRESH_SECRET),
  COOKIE_SECURE: boolFromEnv,
  // AES-256-GCM key for encrypting secrets at rest (currently: users.twofa_secret
  // — docs/10_SECURITY_CHECKLIST.md §B). Must be exactly 32 bytes, hex-encoded
  // (64 hex chars) — generate a real one with `openssl rand -hex 32`.
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    .default(DEV_INSECURE_APP_ENCRYPTION_KEY),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('sams_academy'),
  DB_USER: z.string().default('root'),
  DB_PASS: z.string().default(''),
  // Test-only DB name (docs/08_TESTING_QA.md): jest+supertest run against a
  // dedicated test MySQL DB, migrated fresh per run. Name kept exactly as
  // specified (DB_NAME_test) — do not rename.
  DB_NAME_test: z.string().default('sams_academy_test'),
  // Perf-only DB name (docs/07_EXECUTION_PLAN.md 12.4): the synthetic-load
  // scripts under server/scripts/perf/ connect to this THIRD, dedicated
  // database — never DB_NAME (dev) or DB_NAME_test (jest, reset by
  // server/tests/globalSetup.cjs on every `npm test` run) — same isolation
  // pattern as DB_NAME_test, one env var lower.
  DB_NAME_PERF: z.string().default('sams_academy_perf'),
  // Executable used by services/backupService.js (Phase 12.3) to run
  // mysqldump. Defaults to the bare command name, which resolves via PATH on
  // Hostinger's Linux shared hosting (and most CI/dev boxes) with zero
  // config. Only needed as an absolute path override on a machine where
  // mysqldump isn't on PATH (e.g. a Windows dev box with a MySQL install
  // that didn't add its `bin/` to PATH) — set it in `server/.env`.
  MYSQLDUMP_PATH: z.string().default('mysqldump'),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: boolFromEnv,
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('"SAMS Academy" <no-reply@example.com>'),

  VIDEO_PROVIDER: z.enum(['bunny', 'mock']).default('mock'),
  BUNNY_LIBRARY_ID: z.string().default(''),
  BUNNY_API_KEY: z.string().default(''),
  BUNNY_TOKEN_AUTH_KEY: z.string().default(''),
  BUNNY_CDN_HOSTNAME: z.string().default(''),

  PAYMENTS_ENABLED_GATEWAYS: z.string().default('mock'),
  JAZZCASH_MERCHANT_ID: z.string().default(''),
  JAZZCASH_PASSWORD: z.string().default(''),
  JAZZCASH_INTEGRITY_SALT: z.string().default(''),
  JAZZCASH_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  EASYPAISA_STORE_ID: z.string().default(''),
  EASYPAISA_HASH_KEY: z.string().default(''),
  EASYPAISA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PAYFAST_MERCHANT_ID: z.string().default(''),
  PAYFAST_SECURED_KEY: z.string().default(''),
  SAFEPAY_API_KEY: z.string().default(''),
  SAFEPAY_SECRET: z.string().default(''),

  ADMIN_ALERT_EMAIL: z.string().default('admin@example.com'),

  // TEMPORARY manual-QA escape hatch (2026-08-08, user-requested) — see the
  // loud production warning below and DECISIONS.md's 2026-08-08 entry.
  // Empty by default (feature is a no-op unless BOTH vars are set); only
  // bypasses the login-reverify (new-device/suspicious-login) email-code
  // check in authService.js#reverifyLogin, and only for the exact emails
  // listed. Delete DEV_FIXED_OTP_CODE/DEV_FIXED_OTP_EMAILS from the
  // deployment's env vars (or set DEV_FIXED_OTP_CODE='') to remove.
  DEV_FIXED_OTP_CODE: z.string().default(''),
  DEV_FIXED_OTP_EMAILS: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env] Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration — see printed field errors above.');
}

export const env = parsed.data;

if (env.NODE_ENV !== 'test') {
  if (env.JWT_SECRET === DEV_INSECURE_JWT_SECRET) {
    console.warn(
      '[env] WARNING: JWT_SECRET is using the insecure development default. ' +
        'Set a real secret via JWT_SECRET before deploying to production.'
    );
  }
  if (env.JWT_REFRESH_SECRET === DEV_INSECURE_JWT_REFRESH_SECRET) {
    console.warn(
      '[env] WARNING: JWT_REFRESH_SECRET is using the insecure development default. ' +
        'Set a real secret via JWT_REFRESH_SECRET before deploying to production.'
    );
  }
  if (env.APP_ENCRYPTION_KEY === DEV_INSECURE_APP_ENCRYPTION_KEY) {
    console.warn(
      '[env] WARNING: APP_ENCRYPTION_KEY is using the insecure development default. ' +
        'Set a real 32-byte hex key (openssl rand -hex 32) before deploying to production.'
    );
  }
}

// `mock` (adapters/payments/mock.js) is a deliberately zero-credential,
// always-auto-succeeds gateway — exactly what dev/test needs, and exactly
// what must never be reachable in production: any student could select
// gateway:'mock' via POST /checkout/orders and get any course for free,
// with no forgery required since the driver is *designed* to always
// succeed. Phase 9.10 security audit finding M-2 — unlike the insecure-
// default warnings above (fine to leave as warnings even in dev), this one
// only fires for NODE_ENV==='production' specifically, since 'mock' being
// enabled is the CORRECT, desired default everywhere else. Warn loudly
// rather than hard-crash the process: an operator might have intentionally
// scripted a mixed real+mock config for a controlled pilot, and refusing
// to boot at all would be a worse failure mode than a loud warning for a
// single-process Hostinger deployment with no separate staging tier.
if (env.NODE_ENV === 'production' && env.PAYMENTS_ENABLED_GATEWAYS.split(',').map((s) => s.trim()).includes('mock')) {
  console.warn(
    '[env] WARNING: PAYMENTS_ENABLED_GATEWAYS includes "mock" while NODE_ENV=production. ' +
      'The mock gateway always auto-succeeds with zero payment verification — any student can get ' +
      'any course for free. Remove "mock" from PAYMENTS_ENABLED_GATEWAYS before going live.'
  );
}

// Same pattern as the "mock" gateway warning above, for the same reason:
// a deliberate, narrowly-scoped dev/QA convenience that must never be
// forgotten in a real production deploy. Fires on every boot as long as
// the vars are set, specifically so it can't go unnoticed in the logs.
if (env.DEV_FIXED_OTP_CODE && env.DEV_FIXED_OTP_EMAILS) {
  console.warn(
    `[env] WARNING: DEV_FIXED_OTP_CODE is active for login-reverify on: ${env.DEV_FIXED_OTP_EMAILS}. ` +
      'This is a manual-QA-only bypass of a real security check (new-device/suspicious-login email ' +
      'verification) — remove DEV_FIXED_OTP_CODE and DEV_FIXED_OTP_EMAILS from the environment as soon ' +
      'as manual testing is done.'
  );
}

export default env;
