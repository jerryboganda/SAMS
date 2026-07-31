// server/src/routes/v1/index.js
// Mounts every /api/v1/* sub-router. Later phases add auth.js, courses.js,
// qbank.js, etc. here per docs/04_API_SPEC.md.
import { Router } from 'express';
import health from './health.js';
import auth from './auth.js';
import publicRouter from './public.js';
import adminRouter from './admin/index.js';
import studentRouter from './student/index.js';
import qbankRouter from './qbank.js';

const router = Router();

router.use('/health', health);
router.use('/auth', auth);
router.use('/public', publicRouter);
router.use('/admin', adminRouter);
router.use('/student', studentRouter);
// Top-level, NOT under /student — see routes/v1/qbank.js's header comment.
router.use('/qbank', qbankRouter);

export default router;
