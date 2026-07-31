// server/src/routes/v1/student/index.js
// Mounts every /api/v1/student/* sub-router (docs/04_API_SPEC.md §3-§6).
// Unlike routes/v1/admin/index.js, this router does NOT apply a blanket
// auth/deviceCheck/requireRole chain at the top level — GET
// /student/lectures/:id/play must also serve unauthenticated requests for
// free-preview lectures (role P), so each sub-router composes its own
// per-route middleware. See routes/v1/student/lectures.js. dashboard.js and
// courses.js (Phase 6.1-6.3) have no anonymous path, but keep the same
// per-router composition style for consistency.
import { Router } from 'express';
import lecturesRouter from './lectures.js';
import dashboardRouter from './dashboard.js';
import coursesRouter from './courses.js';

const router = Router();

router.use(lecturesRouter);
router.use(dashboardRouter);
router.use(coursesRouter);

export default router;
