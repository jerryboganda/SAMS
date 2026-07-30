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

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('sams_academy'),
  DB_USER: z.string().default('root'),
  DB_PASS: z.string().default(''),
  // Test-only DB name (docs/08_TESTING_QA.md): jest+supertest run against a
  // dedicated test MySQL DB, migrated fresh per run. Name kept exactly as
  // specified (DB_NAME_test) — do not rename.
  DB_NAME_test: z.string().default('sams_academy_test'),

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
}

export default env;
