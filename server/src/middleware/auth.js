// server/src/middleware/auth.js
// Verifies the access-JWT (httpOnly `access_token` cookie, or an
// `Authorization: Bearer` header per docs/04_API_SPEC.md's "Auth = access-JWT
// cookie (or Authorization: Bearer)") and attaches req.user = {id, role}.
// Does NOT check device state — see middleware/deviceCheck.js for that
// separate, stateful check (protected routes compose both).
import { ApiError } from '../utils/apiError.js';
import { verifyAccessToken } from '../utils/jwt.js';

export function auth(req, res, next) {
  const header = req.headers.authorization;
  const bearerToken = header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = req.cookies?.access_token || bearerToken;

  if (!token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired session.'));
  }
}

/**
 * Soft companion to `auth` for routes that must work both anonymously (role
 * P) and authenticated (e.g. GET /student/lectures/:id/play's free-preview
 * branch, docs/04_API_SPEC.md §3): populates `req.user` from a valid
 * access-JWT if one is present, but — unlike `auth` — never rejects the
 * request when the token is missing, expired, or malformed. Callers that
 * need to branch on "authenticated vs anonymous" read `req.user` themselves;
 * callers that need a hard auth requirement still use `auth` (or check
 * `req.user` and throw their own 401) further down the chain.
 */
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  const bearerToken = header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = req.cookies?.access_token || bearerToken;

  if (!token) {
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: Number(payload.sub), role: payload.role };
  } catch {
    // Invalid/expired token on an optional-auth route: treat as anonymous
    // rather than failing the whole request.
  }
  next();
}

export default auth;
