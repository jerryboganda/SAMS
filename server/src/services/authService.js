// server/src/services/authService.js
// Core auth business logic: register/verify-email, login (+lockout,
// 2FA, device limit, suspicious-login gate), refresh rotation + reuse
// detection, logout(-all), forgot/reset/change password, profile.
// docs/04_API_SPEC.md §1, docs/02_ARCHITECTURE.md §4.
import bcrypt from 'bcrypt';
import geoip from 'geoip-lite';
import { Op, UniqueConstraintError } from 'sequelize';
import { ApiError } from '../utils/apiError.js';
import { sha256Hex, randomTokenHex, randomNumericCode } from '../utils/crypto.js';
import { signAccessToken } from '../utils/jwt.js';
import { setAccessTokenCookie, setRefreshTokenCookie, clearSessionCookies } from '../utils/cookies.js';
import { sendMail, verifyEmailTemplate, passwordResetTemplate, reverifyCodeTemplate } from '../utils/mailer.js';
import { matchDevice, assertDeviceCapacity, finalizeDevice } from './deviceService.js';
import { verifyTwofaOrBackup } from './twofaService.js';
import * as notificationService from './notificationService.js';
import { env } from '../config/env.js';
import {
  REFRESH_TOKEN_TTL_MS,
  LOCKOUT_FAIL_THRESHOLD,
  LOCKOUT_WINDOW_MINUTES,
  SUSPICIOUS_FAIL_THRESHOLD,
  SUSPICIOUS_WINDOW_MINUTES,
  VERIFY_EMAIL_TOKEN_TTL_HOURS,
  RESET_PASSWORD_TOKEN_TTL_HOURS,
  REVERIFY_LOGIN_TOKEN_TTL_MINUTES,
  REVERIFY_FAIL_THRESHOLD,
  REVERIFY_LOCKOUT_WINDOW_MINUTES,
} from '../config/constants.js';
import db from '../models/index.js';

const { User, RefreshToken, LoginEvent, OneTimeToken, sequelize } = db;

const BCRYPT_ROUNDS = 12;

// Fixed placeholder hash used ONLY to pay the same bcrypt cost on the
// "no such user" login branch as a real "wrong password" branch pays
// (security audit 2026-07-31, Finding 2 — login timing side-channel/user
// enumeration). Computed once at module load, never compared against real
// user data.
const LOGIN_TIMING_PLACEHOLDER_HASH = bcrypt.hashSync('placeholder-not-a-real-password', BCRYPT_ROUNDS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    twofaEnabled: user.twofaEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function normalizeIp(ip) {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

async function logEvent({ userId = null, emailTried = null, status, reason = null, ip = null, userAgent = null, country = null, fingerprintHash = null }) {
  await LoginEvent.create({
    userId,
    emailTried,
    status,
    reason,
    ip,
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
    country,
    fingerprintHash,
  });
}

async function isLockedOut(emailTried) {
  const normalized = normalizeEmail(emailTried);
  const user = await User.findOne({ where: { email: normalized }, attributes: ['id', 'role'] });
  if (user?.role === 'admin') return false;

  const count = await LoginEvent.count({
    where: {
      emailTried: normalized,
      status: 'failed',
      createdAt: { [Op.gte]: new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000) },
    },
  });
  return count >= LOCKOUT_FAIL_THRESHOLD;
}

/**
 * Account-keyed brute-force lockout for POST /auth/reverify (security audit
 * 2026-07-31, Finding 3), mirroring isLockedOut() above but counting
 * `reason='reverify_invalid_code'` login_events rows instead of generic
 * login failures — reverify's per-IP authLimiter alone is trivially evaded
 * by rotating source IPs, and the 6-digit code has far less entropy than a
 * password, so this needs its own (stricter) threshold/window.
 */
async function isReverifyLockedOut(emailTried) {
  const normalized = normalizeEmail(emailTried);
  const user = await User.findOne({ where: { email: normalized }, attributes: ['id', 'role'] });
  if (user?.role === 'admin') return false;

  const count = await LoginEvent.count({
    where: {
      emailTried: normalized,
      status: 'failed',
      reason: 'reverify_invalid_code',
      createdAt: { [Op.gte]: new Date(Date.now() - REVERIFY_LOCKOUT_WINDOW_MINUTES * 60 * 1000) },
    },
  });
  return count >= REVERIFY_FAIL_THRESHOLD;
}

async function detectSuspicious({ user, req, matchResult }) {
  // Admin accounts are completely unrestricted: no suspicious login gating or verification codes on new devices
  if (user.role === 'admin') {
    return { suspicious: false, reasons: [], country: null };
  }

  const reasons = [];
  if (matchResult.isNewCandidate) reasons.push('new_device');
  // Fingerprint-only match (no verified device-token cookie) gets the same
  // reverify treatment as a genuinely brand-new device (security audit
  // 2026-07-31, Finding 1) — previously exempted, which let an attacker with
  // a common UA/OS/locale combo silently reuse another user's device slot
  // with no suspicious-login gate at all. See DECISIONS.md.
  if (matchResult.isFingerprintOnlyMatch) reasons.push('device_takeover');

  const recentFails = await LoginEvent.count({
    where: {
      emailTried: normalizeEmail(user.email),
      status: 'failed',
      createdAt: { [Op.gte]: new Date(Date.now() - SUSPICIOUS_WINDOW_MINUTES * 60 * 1000) },
    },
  });
  if (recentFails >= SUSPICIOUS_FAIL_THRESHOLD) reasons.push('fail_burst');

  const currentCountry = geoip.lookup(normalizeIp(req.ip))?.country || null;
  if (currentCountry) {
    const lastSuccess = await LoginEvent.findOne({
      where: { userId: user.id, status: 'success' },
      order: [['createdAt', 'DESC']],
    });
    if (lastSuccess?.country && lastSuccess.country !== currentCountry) {
      reasons.push('country_change');
    }
  }

  return { suspicious: reasons.length > 0, reasons, country: currentCountry };
}

/**
 * Shared session-issuance path used by BOTH a direct (non-suspicious) login
 * and a completed reverify — deliberately factored out so there is exactly
 * one place that issues cookies/tokens (task brief: "factor this into a
 * shared service function, don't duplicate it").
 */
async function completeLoginSession(user, device, req, res) {
  const accessToken = signAccessToken(user);
  const rawRefresh = randomTokenHex(64);

  await RefreshToken.create({
    userId: user.id,
    deviceId: device.id,
    tokenHash: sha256Hex(rawRefresh),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    ip: normalizeIp(req.ip),
    userAgent: (req.get('user-agent') || '').slice(0, 255) || null,
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, rawRefresh);

  user.lastLoginAt = new Date();
  await user.save();

  // Fields exist only to satisfy the pre-existing frontend's LoginResponse
  // shape ({user, token, deviceToken}) — real session state lives entirely
  // in httpOnly cookies (docs/10_SECURITY_CHECKLIST.md §A: "no tokens in
  // localStorage"), so these two are intentionally non-secret placeholders,
  // not the actual JWT/device token. See DECISIONS.md.
  return { user: serializeUser(user), token: 'issued', deviceToken: 'issued' };
}

async function maybeSendNewDeviceAlert(user, req, matchResult, device) {
  if (!matchResult.isNewCandidate) return;
  await notificationService.notifyNewDeviceLogin({ user, ip: normalizeIp(req.ip), deviceName: device?.deviceName });
}

/**
 * Creates the reverify_login OneTimeToken row for a fresh 6-digit code,
 * retrying with a NEW random code on a token_hash collision instead of
 * letting it surface as a raw 500 to a legitimate user's login attempt.
 *
 * Security-audit finding (Phase 12.5, re-confirming a gap tracked since the
 * Phase 5 security-fix pass, HANDOFF.md): one_time_tokens.token_hash is a
 * single GLOBAL unique column shared by verify_email/reset_password (32-byte
 * randomTokenHex -> ~2^256 space, collision risk negligible) AND
 * reverify_login (only randomNumericCode(6) -> 1,000,000 possible values).
 * A birthday-paradox collision against some OTHER currently-active
 * reverify_login code is a real, previously-observed failure mode (see
 * DECISIONS.md's Phase 9.9 entry: an actual SequelizeUniqueConstraintError
 * on this exact column, caused by concurrent suspicious-login test traffic,
 * not a hypothetical). This bounded retry (default 5 attempts — the odds of
 * even a SECOND consecutive collision are astronomically small; a real,
 * unrelated DB error still propagates rather than looping forever) removes
 * the user-facing failure mode without touching the shared token_hash
 * column's uniqueness guarantee for the other two purposes.
 */
async function createReverifyLoginToken(userId, attemptsLeft = 5) {
  const rawCode = randomNumericCode(6);
  try {
    await OneTimeToken.create({
      userId,
      purpose: 'reverify_login',
      tokenHash: sha256Hex(rawCode),
      expiresAt: new Date(Date.now() + REVERIFY_LOGIN_TOKEN_TTL_MINUTES * 60 * 1000),
    });
    return rawCode;
  } catch (err) {
    if (err instanceof UniqueConstraintError && attemptsLeft > 1) {
      return createReverifyLoginToken(userId, attemptsLeft - 1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 2.1 Register + email verification
// ---------------------------------------------------------------------------

export async function register({ name, email, phone, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    // No user-enumeration: behave identically to a fresh registration. See
    // DECISIONS.md for the exact wording tradeoff.
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({
    name,
    email: normalizedEmail,
    phone: phone || null,
    passwordHash,
    role: 'student',
    status: 'pending',
  });

  const rawToken = randomTokenHex(32);
  await OneTimeToken.create({
    userId: user.id,
    purpose: 'verify_email',
    tokenHash: sha256Hex(rawToken),
    expiresAt: new Date(Date.now() + VERIFY_EMAIL_TOKEN_TTL_HOURS * 60 * 60 * 1000),
  });

  const link = `${env.APP_URL}/verify-email?token=${rawToken}`;
  await sendMail(verifyEmailTemplate({ user, link }));
}

export async function verifyEmail(token) {
  const tokenHash = sha256Hex(token);
  const ott = await OneTimeToken.findOne({ where: { tokenHash, purpose: 'verify_email' } });

  if (!ott || ott.usedAt || ott.expiresAt < new Date()) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired. Please request a new one.');
  }

  const user = await User.findByPk(ott.userId);
  if (!user) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired. Please request a new one.');
  }

  user.status = 'active';
  user.emailVerifiedAt = new Date();
  await user.save();

  ott.usedAt = new Date();
  await ott.save();
}

export async function resendVerification(email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ where: { email: normalizedEmail } });

  if (user && user.status === 'pending') {
    const rawToken = randomTokenHex(32);
    await OneTimeToken.create({
      userId: user.id,
      purpose: 'verify_email',
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(Date.now() + VERIFY_EMAIL_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    });
    const link = `${env.APP_URL}/verify-email?token=${rawToken}`;
    await sendMail(verifyEmailTemplate({ user, link }));
  }
  // Always resolves the same way regardless — no enumeration.
}

// ---------------------------------------------------------------------------
// 2.2 / 2.3 / 2.4 — Login core, devices, suspicious-login gate
// ---------------------------------------------------------------------------

export async function login({ email, password, twofaCode }, req, res) {
  const normalizedEmail = normalizeEmail(email);
  const ip = normalizeIp(req.ip);
  const userAgent = req.get('user-agent') || null;

  if (await isLockedOut(normalizedEmail)) {
    await logEvent({ emailTried: normalizedEmail, status: 'blocked', reason: 'account_locked', ip, userAgent });
    throw new ApiError(
      423,
      'ACCOUNT_LOCKED',
      'Account temporarily locked after too many failed login attempts. Try again in 15 minutes or reset your password.'
    );
  }

  const user = await User.findOne({ where: { email: normalizedEmail } });
  if (!user) {
    // Pay the same bcrypt cost as the real "wrong password" branch below so
    // response latency doesn't leak whether this email is registered (Finding
    // 2). Result is intentionally discarded.
    await bcrypt.compare(password, LOGIN_TIMING_PLACEHOLDER_HASH);
    await logEvent({ emailTried: normalizedEmail, status: 'failed', reason: 'no_such_user', ip, userAgent });
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    await logEvent({ userId: user.id, emailTried: normalizedEmail, status: 'failed', reason: 'bad_password', ip, userAgent });
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  if (user.status === 'pending') {
    await logEvent({ userId: user.id, emailTried: normalizedEmail, status: 'blocked', reason: 'email_not_verified', ip, userAgent });
    throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address before logging in.');
  }
  if (user.status === 'suspended') {
    await logEvent({ userId: user.id, emailTried: normalizedEmail, status: 'blocked', reason: 'account_suspended', ip, userAgent });
    throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Contact support.');
  }

  if (user.twofaEnabled) {
    if (!twofaCode) {
      await logEvent({ userId: user.id, emailTried: normalizedEmail, status: 'blocked', reason: 'twofa_required', ip, userAgent });
      throw new ApiError(401, 'TWOFA_REQUIRED', '2FA code required. Please enter your 6-digit authentication code.');
    }
    const twofaOk = await verifyTwofaOrBackup(user, twofaCode);
    if (!twofaOk) {
      await logEvent({ userId: user.id, emailTried: normalizedEmail, status: 'failed', reason: 'twofa_invalid', ip, userAgent });
      throw new ApiError(401, 'TWOFA_INVALID', 'Invalid 2FA code.');
    }
  }

  const matchResult = await matchDevice(user.id, req);

  try {
    if (user.role !== 'admin') {
      await assertDeviceCapacity(user.id, matchResult.isNewCandidate, user);
    }
  } catch (err) {
    await logEvent({
      userId: user.id,
      emailTried: normalizedEmail,
      status: 'blocked',
      reason: 'device_limit',
      ip,
      userAgent,
      fingerprintHash: matchResult.fingerprintHash,
    });
    throw err;
  }

  const suspiciousResult = await detectSuspicious({ user, req, matchResult });
  if (suspiciousResult.suspicious) {
    const rawCode = await createReverifyLoginToken(user.id);
    await sendMail(reverifyCodeTemplate({ user, code: rawCode }));
    await logEvent({
      userId: user.id,
      emailTried: normalizedEmail,
      status: 'suspicious',
      reason: suspiciousResult.reasons.join(','),
      ip,
      userAgent,
      country: suspiciousResult.country,
      fingerprintHash: matchResult.fingerprintHash,
    });
    throw new ApiError(401, 'REVERIFY_REQUIRED', 'Suspicious login detected. A verification code has been emailed to you.');
  }

  const device = await finalizeDevice(user.id, req, res, matchResult, user);
  const sessionResult = await completeLoginSession(user, device, req, res);
  await logEvent({
    userId: user.id,
    emailTried: normalizedEmail,
    status: 'success',
    ip,
    userAgent,
    country: suspiciousResult.country,
    fingerprintHash: matchResult.fingerprintHash,
  });
  await maybeSendNewDeviceAlert(user, req, matchResult, device);

  return sessionResult;
}

export async function reverifyLogin({ email, code }, req, res) {
  const normalizedEmail = normalizeEmail(email);
  const ip = normalizeIp(req.ip);
  const userAgent = req.get('user-agent') || null;

  if (await isReverifyLockedOut(normalizedEmail)) {
    await logEvent({ emailTried: normalizedEmail, status: 'blocked', reason: 'reverify_locked', ip, userAgent });
    throw new ApiError(
      423,
      'ACCOUNT_LOCKED',
      'Too many invalid verification codes. Please log in again to request a new code.'
    );
  }

  const user = await User.findOne({ where: { email: normalizedEmail } });
  if (!user) {
    await logEvent({ emailTried: normalizedEmail, status: 'failed', reason: 'reverify_invalid_code', ip, userAgent });
    throw new ApiError(400, 'INVALID_CODE', 'Invalid or expired verification code.');
  }

  // TEMPORARY manual-QA escape hatch (2026-08-08, user-requested — see the
  // loud env.js startup warning and DECISIONS.md's 2026-08-08 entry). Empty
  // by default; only trips when BOTH DEV_FIXED_OTP_CODE and
  // DEV_FIXED_OTP_EMAILS are explicitly set AND this exact user+code match.
  // Skips the real one-time-token check entirely for this one request —
  // does not touch/consume any real OneTimeToken row, no other user or
  // flow is affected. Remove the two env vars to fully disable.
  const devBypassEmails = env.DEV_FIXED_OTP_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isDevOtpBypass =
    env.DEV_FIXED_OTP_CODE && code === env.DEV_FIXED_OTP_CODE && devBypassEmails.includes(normalizedEmail);

  if (!isDevOtpBypass) {
    const tokenHash = sha256Hex(code);
    const ott = await OneTimeToken.findOne({
      where: { userId: user.id, purpose: 'reverify_login', tokenHash },
      order: [['createdAt', 'DESC']],
    });
    if (!ott || ott.usedAt || ott.expiresAt < new Date()) {
      await logEvent({
        userId: user.id,
        emailTried: normalizedEmail,
        status: 'failed',
        reason: 'reverify_invalid_code',
        ip,
        userAgent,
      });
      throw new ApiError(400, 'INVALID_CODE', 'Invalid or expired verification code.');
    }

    ott.usedAt = new Date();
    await ott.save();
  }

  const matchResult = await matchDevice(user.id, req);
  if (user.role !== 'admin') {
    await assertDeviceCapacity(user.id, matchResult.isNewCandidate, user);
  }

  const device = await finalizeDevice(user.id, req, res, matchResult, user);
  const sessionResult = await completeLoginSession(user, device, req, res);
  await logEvent({
    userId: user.id,
    emailTried: normalizedEmail,
    status: 'success',
    reason: 'reverified',
    ip,
    userAgent,
    fingerprintHash: matchResult.fingerprintHash,
  });
  await maybeSendNewDeviceAlert(user, req, matchResult, device);

  return sessionResult;
}

// ---------------------------------------------------------------------------
// Refresh / logout
// ---------------------------------------------------------------------------

export async function refreshSession(req, res) {
  const rawRefresh = req.cookies?.refresh_token;
  if (!rawRefresh) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Missing refresh token.');
  }

  const tokenHash = sha256Hex(rawRefresh);
  const tokenRow = await RefreshToken.findOne({ where: { tokenHash } });
  if (!tokenRow) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid refresh token.');
  }

  // Reuse detection: a previously rotated-away-from (revoked or replaced)
  // token being presented again means the token was stolen/replayed —
  // revoke the whole family and force re-login.
  if (tokenRow.revokedAt || tokenRow.replacedBy) {
    await RefreshToken.update(
      { revokedAt: new Date() },
      {
        where: {
          userId: tokenRow.userId,
          ...(tokenRow.deviceId ? { deviceId: tokenRow.deviceId } : {}),
          revokedAt: null,
        },
      }
    );
    clearSessionCookies(res);
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session invalid — please log in again.');
  }

  if (tokenRow.expiresAt < new Date()) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Refresh token expired — please log in again.');
  }

  const user = await User.findByPk(tokenRow.userId);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid session.');
  }

  if (tokenRow.deviceId) {
    const device = await db.UserDevice.findByPk(tokenRow.deviceId);
    if (!device || !device.isActive) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Device no longer registered — please log in again.');
    }
  }

  const newRaw = randomTokenHex(64);
  const newHash = sha256Hex(newRaw);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await sequelize.transaction(async (t) => {
    await RefreshToken.create(
      {
        userId: user.id,
        deviceId: tokenRow.deviceId,
        tokenHash: newHash,
        expiresAt: newExpiresAt,
        ip: normalizeIp(req.ip),
        userAgent: (req.get('user-agent') || '').slice(0, 255) || null,
      },
      { transaction: t }
    );
    tokenRow.replacedBy = newHash;
    tokenRow.revokedAt = new Date();
    await tokenRow.save({ transaction: t });
  });

  const accessToken = signAccessToken(user);
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, newRaw);

  return { user: serializeUser(user) };
}

export async function logout(req, res) {
  const rawRefresh = req.cookies?.refresh_token;
  if (rawRefresh) {
    const tokenHash = sha256Hex(rawRefresh);
    await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash, revokedAt: null } });
  }
  clearSessionCookies(res);
}

export async function logoutAll(userId, res) {
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
  clearSessionCookies(res);
}

// ---------------------------------------------------------------------------
// 2.5 Session mgmt — profile, password
// ---------------------------------------------------------------------------

export async function getMe(userId) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session invalid.');
  }
  return {
    ...serializeUser(user),
    // TODO(Phase 6): populate from enrollmentService once it exists.
    enrollmentSummary: [],
    unreadNotifications: await notificationService.getUnreadNotificationCount(userId),
  };
}

export async function updateMe(userId, { name, phone }) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session invalid.');
  }
  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  await user.save();
  return serializeUser(user);
}

export async function changePassword(userId, { current, new: nextPassword }, req) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session invalid.');
  }

  const ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  user.passwordHash = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);
  await user.save();

  // Logout-all *other* sessions: revoke every refresh token except the one
  // presented on this very request (the caller's own session survives).
  const rawRefresh = req.cookies?.refresh_token;
  const keepHash = rawRefresh ? sha256Hex(rawRefresh) : null;
  await RefreshToken.update(
    { revokedAt: new Date() },
    {
      where: {
        userId,
        revokedAt: null,
        ...(keepHash ? { tokenHash: { [Op.ne]: keepHash } } : {}),
      },
    }
  );

  await notificationService.notifyPasswordChanged({ user });
}

export async function forgotPassword(email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ where: { email: normalizedEmail } });

  if (user) {
    const rawToken = randomTokenHex(32);
    await OneTimeToken.create({
      userId: user.id,
      purpose: 'reset_password',
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(Date.now() + RESET_PASSWORD_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    });
    const link = `${env.APP_URL}/reset-password?token=${rawToken}`;
    await sendMail(passwordResetTemplate({ user, link }));
  }
  // Always resolves the same way — no enumeration.
}

export async function resetPassword({ token, newPassword }) {
  const tokenHash = sha256Hex(token);
  const ott = await OneTimeToken.findOne({ where: { tokenHash, purpose: 'reset_password' } });

  if (!ott || ott.usedAt || ott.expiresAt < new Date()) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This password reset link is invalid or has expired.');
  }

  const user = await User.findByPk(ott.userId);
  if (!user) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This password reset link is invalid or has expired.');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.save();

  ott.usedAt = new Date();
  await ott.save();

  // Password reset kills ALL sessions (unlike change-password, there is no
  // "current session" to preserve — the user isn't logged in during this flow).
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null } });
}

export default {
  register,
  verifyEmail,
  resendVerification,
  login,
  reverifyLogin,
  refreshSession,
  logout,
  logoutAll,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  serializeUser,
};
