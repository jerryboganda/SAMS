// server/src/utils/validate.js
// zod validation helper for controllers: parses+strips-unknown-keys (zod's
// default z.object() behavior — docs/10_SECURITY_CHECKLIST.md §G "unknown
// keys stripped") and throws the standard 422 VALIDATION_ERROR ApiError on
// failure so every route gets identical validation-error shape for free.
import { ApiError } from './apiError.js';

export function validateBody(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Validation failed.', result.error.flatten());
  }
  return result.data;
}

export default validateBody;
