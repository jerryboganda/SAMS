// server/src/routes/v1/student/index.js
// Mounts every /api/v1/student/* sub-router (docs/04_API_SPEC.md §3-§6).
// Unlike routes/v1/admin/index.js, this router does NOT apply a blanket
// auth/deviceCheck/requireRole chain at the top level — GET
// /student/lectures/:id/play must also serve unauthenticated requests for
// free-preview lectures (role P), so each sub-router composes its own
// per-route middleware. See routes/v1/student/lectures.js.
import { Router } from 'express';
import lecturesRouter from './lectures.js';

const router = Router();

router.use(lecturesRouter);

export default router;
