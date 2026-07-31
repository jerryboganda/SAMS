// server/src/middleware/upload.js
// Multer wiring for POST /admin/uploads/image (docs/04_API_SPEC.md §7).
// Memory storage only — files are buffered in RAM just long enough to be
// magic-byte-validated (server/src/utils/imageValidation.js) and re-written
// to disk under a fresh randomized filename by adminUploadService.js. Multer
// never writes the client's original filename/extension to disk itself
// (docs/10_SECURITY_CHECKLIST.md §G "randomized names" — never trust the
// original filename).
import multer from 'multer';
import { ApiError } from '../utils/apiError.js';
import { ADMIN_UPLOAD_MAX_BYTES } from '../config/constants.js';

const storage = multer.memoryStorage();

// Multipart field name is `file` — no existing contract to match (the
// already-built admin UI doesn't wire a real upload widget yet, per this
// task's frontend-contract findings; DECISIONS.md), so a plain generic name
// was chosen for an endpoint documented as reusable beyond course thumbnails
// (Phase 11 question images).
const imageUpload = multer({
  storage,
  limits: { fileSize: ADMIN_UPLOAD_MAX_BYTES, files: 1 },
}).single('file');

/**
 * Wraps multer's callback-style middleware so its errors (oversized file,
 * malformed multipart body, etc.) reach the standard `{success:false,error}`
 * envelope via the central error handler instead of multer's own thrown
 * error / Express's default HTML error page.
 */
export function handleImageUpload(req, res, next) {
  imageUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(422, 'VALIDATION_ERROR', 'File exceeds the 5 MB upload limit.'));
      }
      return next(new ApiError(422, 'VALIDATION_ERROR', `Upload failed: ${err.message}`));
    }
    if (err) return next(err);
    next();
  });
}

export default handleImageUpload;
