// server/src/services/twofaService.js
// TOTP 2FA setup/enable/disable + login-time verification
// (docs/04_API_SPEC.md §1, docs/10_SECURITY_CHECKLIST.md §B).
//
// Secret-at-rest size note: `users.twofa_secret` is VARCHAR(64)
// (docs/03_DATABASE_SCHEMA.md). otplib's default `authenticator.generateSecret()`
// in this project's pinned otplib version already produces a 16-char base32
// secret (80 bits of entropy — meets NIST SP 800-63B's 80-bit minimum for
// shared secrets). AES-256-GCM-encrypting that (12-byte IV + 16-byte tag +
// 16-byte ciphertext = 44 bytes -> 60 base64 chars) fits inside the 64-char
// column with room to spare — verified empirically; see DECISIONS.md for the
// byte-budget math and why a longer (e.g. 32-byte/160-bit) secret would NOT
// fit without a schema change, which the task brief says not to make.
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { ApiError } from '../utils/apiError.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { BACKUP_CODES_COUNT } from '../config/constants.js';

const ISSUER = 'SAMS Academy';
const BCRYPT_ROUNDS = 10; // backup codes are single-use + already high-entropy random; 10 rounds is ample

function generateBackupCode() {
  // 8 uppercase alphanumeric chars, formatted AAAA-AAAA for readability.
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 8);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

/** POST /auth/2fa/setup — generates a pending (not-yet-enabled) secret + QR. */
export async function setupTwofa(user) {
  if (user.twofaEnabled) {
    throw new ApiError(409, 'CONFLICT', '2FA is already enabled. Disable it before setting up a new secret.');
  }

  const secret = authenticator.generateSecret();
  user.twofaSecret = encrypt(secret); // pending — twofaEnabled flips true only in enableTwofa()
  await user.save();

  const otpauthUrl = authenticator.keyuri(user.email, ISSUER, secret);
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

  return { qrCodeUrl, secret, otpauthUrl };
}

/** POST /auth/2fa/enable {code} — verifies the pending secret, flips it on, issues backup codes once. */
export async function enableTwofa(user, code) {
  if (!user.twofaSecret) {
    throw new ApiError(409, 'CONFLICT', 'Start 2FA setup first (POST /auth/2fa/setup).');
  }
  if (user.twofaEnabled) {
    throw new ApiError(409, 'CONFLICT', '2FA is already enabled.');
  }

  const secret = decrypt(user.twofaSecret);
  if (!authenticator.check(code, secret)) {
    throw new ApiError(400, 'INVALID_2FA_CODE', 'Invalid verification code.');
  }

  const rawCodes = Array.from({ length: BACKUP_CODES_COUNT }, generateBackupCode);
  const hashedCodes = await Promise.all(rawCodes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));

  user.twofaEnabled = true;
  user.twofaBackupCodes = hashedCodes;
  await user.save();

  return { backupCodes: rawCodes };
}

/** POST /auth/2fa/disable {code|backupCode}. */
export async function disableTwofa(user, { code, backupCode }) {
  if (!user.twofaEnabled) {
    throw new ApiError(409, 'CONFLICT', '2FA is not enabled.');
  }

  let ok = false;
  if (code && user.twofaSecret) {
    ok = authenticator.check(code, decrypt(user.twofaSecret));
  }
  if (!ok && backupCode) {
    ok = (await findAndConsumeBackupCode(user, backupCode)) !== null;
  }
  if (!ok) {
    throw new ApiError(400, 'INVALID_2FA_CODE', 'Invalid verification code or backup code.');
  }

  user.twofaEnabled = false;
  user.twofaSecret = null;
  user.twofaBackupCodes = null;
  await user.save();
}

/**
 * Finds `raw` among the user's hashed backup codes; if found, removes it
 * (single-use) and persists, returning the remaining array. Returns null if
 * no match. Shared by login (2nd-factor via backup code) and 2fa/disable.
 */
async function findAndConsumeBackupCode(user, raw) {
  const hashes = Array.isArray(user.twofaBackupCodes) ? user.twofaBackupCodes : [];
  for (let i = 0; i < hashes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential is fine: at most 10 short bcrypt compares
    const match = await bcrypt.compare(raw, hashes[i]);
    if (match) {
      const remaining = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
      user.twofaBackupCodes = remaining;
      await user.save();
      return remaining;
    }
  }
  return null;
}

/**
 * Login-time 2nd-factor check: tries the TOTP code first, then falls back to
 * consuming a matching backup code. Returns true/false (never throws) so
 * authService can decide the exact error code/login_events reason.
 */
export async function verifyTwofaOrBackup(user, submittedCode) {
  if (!submittedCode) return false;

  if (user.twofaSecret) {
    const secret = decrypt(user.twofaSecret);
    if (authenticator.check(submittedCode, secret)) return true;
  }

  const consumed = await findAndConsumeBackupCode(user, submittedCode);
  return consumed !== null;
}

export default { setupTwofa, enableTwofa, disableTwofa, verifyTwofaOrBackup };
