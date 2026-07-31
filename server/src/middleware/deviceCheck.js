// server/src/middleware/deviceCheck.js
// Stateful companion to middleware/auth.js: confirms the device cookie still
// maps to an `is_active=1` user_devices row for the authenticated user. This
// is what makes an admin device reset actually force re-login even though
// the access JWT itself remains cryptographically valid for up to 15 more
// minutes — docs/10_SECURITY_CHECKLIST.md §C. Must run AFTER auth (needs
// req.user).
import { ApiError } from '../utils/apiError.js';
import { findActiveDeviceByToken } from '../services/deviceService.js';

export async function deviceCheck(req, res, next) {
  try {
    const rawDeviceToken = req.cookies?.device_token;
    if (!req.user || !rawDeviceToken) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Device not recognized — please log in again.');
    }

    // Shared lookup with the soft/optional device check used by
    // GET /student/lectures/:id/play's free-preview branch (see
    // services/deviceService.js's findActiveDeviceByToken doc comment).
    const device = await findActiveDeviceByToken(req.user.id, rawDeviceToken);

    if (!device) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Device not recognized — please log in again.');
    }

    req.device = device;
    next();
  } catch (err) {
    next(err);
  }
}

export default deviceCheck;
