// server/src/middleware/requireRole.js
// Role gate for protected routes — must run after middleware/auth.js (needs
// req.user). Reusable scaffolding for Phase 4+ /admin routes; exercised in
// this phase by a throwaway test route (see tests/requireRole.test.js).
import { ApiError } from '../utils/apiError.js';

export function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    next();
  };
}

export default requireRole;
