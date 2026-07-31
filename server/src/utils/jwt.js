// server/src/utils/jwt.js
// Access-token JWT sign/verify. Refresh tokens are deliberately NOT JWTs —
// per docs/02_ARCHITECTURE.md §4 they're random 64-byte tokens hashed at
// rest in `refresh_tokens` (stateful, revocable, rotating) — only the short-
// lived access token is a signed, stateless JWT. (JWT_REFRESH_SECRET stays
// defined in config/env.js for forward-compatibility but is intentionally
// unused by this phase — see DECISIONS.md.)
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_MINUTES } from '../config/constants.js';

/** Signs a short-lived access token: payload {sub:userId, role}. */
export function signAccessToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, env.JWT_SECRET, {
    expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

/** Verifies + decodes an access token. Throws on invalid/expired. */
export function verifyAccessToken(token) {
  // Explicitly pin the algorithm allow-list rather than relying on
  // jsonwebtoken's library-inferred default (security audit 2026-07-31,
  // Finding 4) — no behavior change, tokens are already signed HS256.
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}
