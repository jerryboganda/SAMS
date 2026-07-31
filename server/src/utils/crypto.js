// server/src/utils/crypto.js
// Node built-in `crypto` helpers used throughout auth: sha256 hashing for
// token-at-rest storage (refresh/device/one-time tokens — schema stores only
// the hash, never the raw token), random token generation, and AES-256-GCM
// encrypt/decrypt for secrets-at-rest (currently: TOTP 2FA secret,
// docs/10_SECURITY_CHECKLIST.md §B "secrets encrypted at rest AES-256-GCM").
// No new dependency — Node's built-in `crypto` module covers all of this.
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const GCM_ALGO = 'aes-256-gcm';
const GCM_IV_BYTES = 12; // 96-bit IV — the recommended/standard size for GCM

function keyBuffer() {
  return Buffer.from(env.APP_ENCRYPTION_KEY, 'hex');
}

/**
 * sha256(input) -> 64-char lowercase hex digest. Used to hash tokens before
 * storing them (refresh_tokens.token_hash, user_devices.device_token_hash,
 * one_time_tokens.token_hash — all CHAR(64) per docs/03_DATABASE_SCHEMA.md).
 */
export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

/**
 * Cryptographically random token, hex-encoded (2 hex chars per byte). The
 * raw value is what's emailed/cookied; only its sha256 hash is ever stored.
 */
export function randomTokenHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Random n-digit numeric code (e.g. for the reverify-login email code).
 * Uses crypto.randomInt for uniform, non-biased randomness.
 */
export function randomNumericCode(digits = 6) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(crypto.randomInt(min, max));
}

/**
 * A fresh CHAR(36) UUID (v4) — used for `playback_sessions.session_key`
 * (docs/03_DATABASE_SCHEMA.md) and for the unlocked, non-persisted session
 * key handed to anonymous free-preview viewers (Phase 5.2 — see DECISIONS.md).
 */
export function randomUuid() {
  return crypto.randomUUID();
}

/**
 * AES-256-GCM encrypt. Output is base64(iv(12B) || authTag(16B) || ciphertext),
 * a single self-contained string. Deliberately compact: `users.twofa_secret`
 * is VARCHAR(64) (see DECISIONS.md for the byte-budget math that shaped the
 * 2FA secret length choice in services/twofaService.js).
 */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(GCM_ALGO, keyBuffer(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Inverse of encrypt(). Throws if the key/tag don't match (tampered or wrong key). */
export function decrypt(payload) {
  const blob = Buffer.from(String(payload), 'base64');
  const iv = blob.subarray(0, GCM_IV_BYTES);
  const tag = blob.subarray(GCM_IV_BYTES, GCM_IV_BYTES + 16);
  const ciphertext = blob.subarray(GCM_IV_BYTES + 16);
  const decipher = crypto.createDecipheriv(GCM_ALGO, keyBuffer(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
