// server/src/controllers/adminUploadController.js
// Thin per docs/02_ARCHITECTURE.md: multer (middleware/upload.js) -> service -> respond.
import { asyncHandler } from '../utils/asyncHandler.js';
import * as adminUploadService from '../services/adminUploadService.js';

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const uploadImage = asyncHandler(async (req, res) => {
  const data = await adminUploadService.saveImageUpload(req.file);
  ok(res, data, 201);
});
