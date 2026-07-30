// server/src/utils/apiError.js
// Thin typed error for the central error handler. Routes/services can throw
// `new ApiError(422, 'VALIDATION_ERROR', 'message', details)` and the
// errorHandler middleware will translate it into the standard API envelope.
export class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export default ApiError;
