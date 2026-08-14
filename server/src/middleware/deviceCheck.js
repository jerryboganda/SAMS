// server/src/middleware/deviceCheck.js
// Stateful companion to middleware/auth.js: confirms the device cookie still
// maps to an `is_active=1` user_devices row for the authenticated user. This
// is what makes an admin device reset actually force re-login even though
// the access JWT itself remains cryptographically valid for up to 15 more
// minutes — docs/10_SECURITY_CHECKLIST.md §C. Must run AFTER auth (needs
// req.user). Admin users are exempt from candidate device restrictions.
import { ApiError } from '../utils/apiError.js';
import { findActiveDeviceByToken } from '../services/deviceService.js';

export async function deviceCheck(req, res, next) {
  try {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const rawDeviceToken = req.cookies?.device_token;
    if (rawDeviceToken) {
      const device = await findActiveDeviceByToken(req.user.id, rawDeviceToken);
      if (device) {
        req.device = device;
      }
    }

    // Admin users are exempt from candidate device lockouts / device checks
    if (req.user.role === 'admin') {
      return next();
    }

    if (!rawDeviceToken || !req.device) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Device not recognized — please log in again.');
    }

    next();
  } catch (err) {
    next(err);
  }
}

export default deviceCheck;
