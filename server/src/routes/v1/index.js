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
import mockExamsRouter from './mockExams.js';
import checkoutRouter from './checkout.js';
import ordersRouter from './orders.js';
import webhooksRouter from './webhooks.js';
import notificationsRouter from './notifications.js';
import announcementsRouter from './announcements.js';
import packagesRouter from './packages.js';

const router = Router();

router.use('/health', health);
router.use('/auth', auth);
router.use('/public', publicRouter);
router.use('/packages', packagesRouter);
router.use('/admin', adminRouter);
router.use('/student', studentRouter);
// Top-level, NOT under /student — see routes/v1/qbank.js's header comment.
router.use('/qbank', qbankRouter);
// Top-level, NOT under /student or /qbank — see routes/v1/mockExams.js's
// header comment (Phase 8.3).
router.use('/mock-exams', mockExamsRouter);
// Top-level per docs/04_API_SPEC.md §5 — checkout/orders/webhooks are their
// own resource families, not nested under /student (docs/07_EXECUTION_PLAN.md 9.1-9.2).
router.use('/checkout', checkoutRouter);
router.use('/orders', ordersRouter);
router.use('/webhooks', webhooksRouter);
// Top-level per docs/07_EXECUTION_PLAN.md 10.1/10.2 — same "own resource
// family, not nested under /student" rationale as /checkout, /orders above.
router.use('/notifications', notificationsRouter);
router.use('/announcements', announcementsRouter);

export default router;
