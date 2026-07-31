// server/src/services/deviceService.js
// Device resolution/registration for the 2-active-devices policy
// (docs/02_ARCHITECTURE.md §4, docs/10_SECURITY_CHECKLIST.md §C).
//
// Two-phase design (matchDevice = read-only, finalizeDevice = persists) is
// deliberate: the suspicious-login flow (authService.login) needs to know
// "would this be a new device?" BEFORE deciding whether to complete the
// login or divert to email reverification — and must NOT persist a new
// device row for an attempt that never completes (that would let repeated
// suspicious/abandoned attempts burn through the 2-device cap without ever
// actually logging in). The device row is only ever created/touched once a
// login is about to actually be completed (authService.completeLoginSession
// call sites), via finalizeDevice.
import { ApiError } from '../utils/apiError.js';
import { sha256Hex, randomTokenHex } from '../utils/crypto.js';
import { setDeviceTokenCookie } from '../utils/cookies.js';
import { MAX_ACTIVE_DEVICES } from '../config/constants.js';
import db from '../models/index.js';

const { UserDevice, RefreshToken } = db;

/**
 * Fingerprint = sha256(User-Agent + Accept-Language). Good-enough "probably
 * the same device even if its cookie got cleared" signal (not a security
 * boundary by itself — docs/10_SECURITY_CHECKLIST.md §C: "fingerprint match
 * reuses slot; mismatch counts as new").
 */
export function computeFingerprint(req) {
  const ua = req.get('user-agent') || '';
  const lang = req.get('accept-language') || '';
  return sha256Hex(`${ua}|${lang}`);
}

function deviceNameFromUserAgent(ua) {
  if (!ua) return 'Unknown device';
  if (/ipad|iphone/i.test(ua)) return 'iOS device';
  if (/android/i.test(ua)) return 'Android device';
  if (/windows/i.test(ua)) return 'Windows device';
  if (/macintosh|mac os/i.test(ua)) return 'Mac device';
  if (/linux/i.test(ua)) return 'Linux device';
  return 'Unknown device';
}

/**
 * Read-only device lookup for a login attempt. Resolution order: (1) device
 * cookie hash match on an active row — a verified match, genuinely the same
 * browser session; (2) fingerprint match on an active row with no cookie
 * match (cookie missing, cleared, or stale/invalid) — an UNVERIFIED match:
 * could be the same physical device with a cleared cookie, or could be a
 * different device that happens to collide on User-Agent+Accept-Language
 * (proven exploitable — security audit 2026-07-31, Finding 1). This case is
 * flagged via `isFingerprintOnlyMatch` so callers (a) still route it through
 * the suspicious-login/reverify gate like a new device, and (b) treat
 * completing the login as a TAKEOVER of that device slot (see
 * finalizeDevice) rather than a silent, unlimited share of it; (3) no match
 * at all => candidate for a brand-new device (subject to the device cap).
 */
export async function matchDevice(userId, req) {
  const fingerprintHash = computeFingerprint(req);
  const rawCookie = req.cookies?.device_token;
  let device = null;
  let matchedByCookie = false;

  if (rawCookie) {
    const deviceTokenHash = sha256Hex(rawCookie);
    device = await UserDevice.findOne({ where: { userId, deviceTokenHash, isActive: true } });
    if (device) matchedByCookie = true;
  }
  if (!device) {
    device = await UserDevice.findOne({ where: { userId, fingerprintHash, isActive: true } });
  }

  return {
    device,
    fingerprintHash,
    isNewCandidate: !device,
    isFingerprintOnlyMatch: Boolean(device) && !matchedByCookie,
  };
}

/** Throws 423 DEVICE_LIMIT_REACHED if a genuinely new device would exceed the cap. */
export async function assertDeviceCapacity(userId, isNewCandidate) {
  if (!isNewCandidate) return;
  const activeCount = await UserDevice.count({ where: { userId, isActive: true } });
  if (activeCount >= MAX_ACTIVE_DEVICES) {
    throw new ApiError(
      423,
      'DEVICE_LIMIT_REACHED',
      'Maximum of 2 registered devices reached. Contact support/admin to reset your devices.'
    );
  }
}

/**
 * Persists the device (create if new, touch+rotate token if reused) and sets
 * the device cookie. Must be called only once a login is actually completing
 * (see module doc above). Re-checks capacity at commit time for correctness
 * under races between the earlier assertDeviceCapacity() precheck and now.
 *
 * Fingerprint-only-match slot takeover (security audit 2026-07-31, Finding
 * 1): when the match came from step (2) of matchDevice() — no verified
 * device-token cookie, only a fingerprint collision — completing the login
 * revokes every still-valid refresh_tokens row already issued for that
 * device slot BEFORE the new session's refresh token is created. This makes
 * "at most one live session per device slot" hold regardless of whether the
 * fingerprint match is really the same physical device (cookie merely
 * cleared) or a genuine collision with an unrelated device — mirrors the
 * existing "new stream kills old stream" takeover pattern used elsewhere for
 * video heartbeats. See DECISIONS.md for the full writeup.
 */
export async function finalizeDevice(userId, req, res, matchResult) {
  const { device, fingerprintHash, isNewCandidate, isFingerprintOnlyMatch } = matchResult;
  await assertDeviceCapacity(userId, isNewCandidate);

  const rawDeviceToken = randomTokenHex(64);
  const deviceTokenHash = sha256Hex(rawDeviceToken);
  const ip = req.ip || null;
  const userAgent = req.get('user-agent') || null;

  let row = device;
  if (isNewCandidate) {
    row = await UserDevice.create({
      userId,
      deviceTokenHash,
      fingerprintHash,
      deviceName: deviceNameFromUserAgent(userAgent),
      lastIp: ip,
      lastSeenAt: new Date(),
      isActive: true,
    });
  } else {
    if (isFingerprintOnlyMatch) {
      await RefreshToken.update({ revokedAt: new Date() }, { where: { deviceId: row.id, revokedAt: null } });
    }
    row.deviceTokenHash = deviceTokenHash;
    row.fingerprintHash = fingerprintHash;
    row.lastIp = ip;
    row.lastSeenAt = new Date();
    await row.save();
  }

  setDeviceTokenCookie(res, rawDeviceToken);
  return row;
}

/**
 * Read-only, non-throwing device-token lookup: the active `user_devices` row
 * for `userId` matching the raw device-token cookie value, or `null` if
 * missing/invalid. Extracted out of middleware/deviceCheck.js so both the
 * hard-fail middleware (throws 401 on null) and soft/optional call sites
 * (e.g. GET /student/lectures/:id/play's free-preview branch — an
 * authenticated viewer with an invalid device is still allowed to watch the
 * preview, just without a real stream lock, per DECISIONS.md Phase 5.2) can
 * share the exact same lookup logic.
 */
export async function findActiveDeviceByToken(userId, rawDeviceToken) {
  if (!userId || !rawDeviceToken) return null;
  const deviceTokenHash = sha256Hex(rawDeviceToken);
  return UserDevice.findOne({ where: { userId, deviceTokenHash, isActive: true } });
}

/** GET /auth/devices listing — masked (no token hash), current device flagged. */
export async function listDevicesForUser(userId, req) {
  const devices = await UserDevice.findAll({ where: { userId }, order: [['lastSeenAt', 'DESC']] });
  const rawCookie = req.cookies?.device_token;
  const currentHash = rawCookie ? sha256Hex(rawCookie) : null;

  return devices.map((d) => ({
    id: d.id,
    userId: d.userId,
    deviceName: d.deviceName,
    lastIp: d.lastIp,
    lastSeenAt: d.lastSeenAt,
    isActive: d.isActive,
    isCurrent: currentHash !== null && d.deviceTokenHash === currentHash,
    createdAt: d.createdAt,
  }));
}

export default {
  computeFingerprint,
  matchDevice,
  assertDeviceCapacity,
  finalizeDevice,
  findActiveDeviceByToken,
  listDevicesForUser,
};
