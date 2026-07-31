// server/src/utils/asyncHandler.js
// Express 4 doesn't auto-catch rejected promises from async route handlers —
// wrap every controller so a thrown/rejected error reaches errorHandler.js
// via next(err) instead of crashing the process / hanging the request.
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
