// server/src/middleware/errorHandler.js
// Central error-handling middleware (must be registered last, 4-arg form).
// Never leaks stack traces (or raw error messages from unexpected errors)
// when NODE_ENV=production.
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const code = err.code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'ERROR');
  const isServerError = statusCode >= 500;

  if (isServerError) {
    logger.error(err.stack || err.message || String(err));
  } else {
    logger.warn(`${code}: ${err.message}`);
  }

  const isProd = env.NODE_ENV === 'production';
  const message = isServerError && isProd ? 'Something went wrong. Please try again later.' : err.message || 'Error';

  const body = {
    success: false,
    error: { code, message },
  };

  if (err.details !== undefined) {
    body.error.details = err.details;
  }

  if (!isProd && isServerError) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

export default errorHandler;
