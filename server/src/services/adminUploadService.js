// server/src/services/adminUploadService.js
// POST /admin/uploads/image business logic (docs/04_API_SPEC.md §7):
// magic-byte-validate the uploaded buffer, write it under a randomized
// filename to storage/uploads/ (never the client's original filename), and
// return a URL the frontend can use directly (e.g. as a course thumbnailUrl).
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { randomTokenHex } from '../utils/crypto.js';
import { sniffImageType } from '../utils/imageValidation.js';

export const UPLOADS_DIR = path.join(REPO_ROOT, 'storage', 'uploads');

/**
 * @param {import('multer').File | undefined} file - multer's in-memory file object (`req.file`).
 */
export async function saveImageUpload(file) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'No file uploaded (expected multipart field "file").');
  }

  // Authoritative check: real file-signature bytes, not the client-declared
  // Content-Type or filename extension — a renamed `.exe` with a fake
  // `image/png` mimetype and `.png` extension fails here.
  const sniffed = sniffImageType(file.buffer);
  if (!sniffed) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Uploaded file is not a recognized image format (jpeg, png, gif, webp).');
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${randomTokenHex(16)}.${sniffed.ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), file.buffer);

  return {
    url: `/uploads/${filename}`,
    mime: sniffed.mime,
    size: file.buffer.length,
  };
}

export default saveImageUpload;
