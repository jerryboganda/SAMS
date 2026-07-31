// server/src/routes/v1/admin/uploads.js
// POST /admin/uploads/image (docs/04_API_SPEC.md §7). auth/deviceCheck/
// requireRole('admin') applied at routes/v1/admin/index.js.
import { Router } from 'express';
import * as adminUploadController from '../../../controllers/adminUploadController.js';
import { handleImageUpload } from '../../../middleware/upload.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.post(
  '/uploads/image',
  handleImageUpload,
  audit('upload.create', 'upload', {
    entityId: () => null,
    summary: (req, body) => `Uploaded image ${body?.data?.url ?? ''}`,
  }),
  adminUploadController.uploadImage
);

export default router;
