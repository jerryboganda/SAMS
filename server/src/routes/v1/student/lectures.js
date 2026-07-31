// server/src/routes/v1/student/lectures.js
// Mounts the secure video playback + progress/bookmark endpoints
// (docs/04_API_SPEC.md §3, docs/07_EXECUTION_PLAN.md 5.2-5.3). Layering:
// routes -> controllers -> services -> models (CLAUDE.md §4).
//
// GET /lectures/:id/play is the one route in this file that must also serve
// ANONYMOUS requests (role P for free-preview lectures per the API spec) —
// so it uses `optionalAuth` (populates req.user if a valid session exists,
// never rejects otherwise) instead of the mandatory `auth`/`deviceCheck`
// chain the rest of this router uses; the enrolled/non-preview access rules
// are enforced inline in services/videoService.js. Every other route here is
// role S only — standard `auth -> deviceCheck -> requireRole('student')`.
import { Router } from 'express';
import auth, { optionalAuth } from '../../../middleware/auth.js';
import deviceCheck from '../../../middleware/deviceCheck.js';
import requireRole from '../../../middleware/requireRole.js';
import { playLimiter, heartbeatLimiter } from '../../../middleware/rateLimits.js';
import * as studentVideoController from '../../../controllers/studentVideoController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.get('/lectures/:id/play', optionalAuth, playLimiter, studentVideoController.play);
router.put('/lectures/:id/heartbeat', ...requireStudent, heartbeatLimiter, studentVideoController.heartbeat);
router.post('/lectures/:id/complete', ...requireStudent, studentVideoController.complete);
router.post('/lectures/:id/bookmark', ...requireStudent, studentVideoController.addBookmark);
router.delete('/lectures/:id/bookmark', ...requireStudent, studentVideoController.removeBookmark);
router.get('/bookmarks/lectures', ...requireStudent, studentVideoController.listBookmarks);

export default router;
