// server/src/routes/v1/admin/index.js
// Mounts every /api/v1/admin/* sub-router (docs/04_API_SPEC.md §7 —
// Phase 4.1 + the Faculty/FAQs/contact-messages/Settings CRUD 4.4's frontend
// wiring needs, merged into one backend pass; see DECISIONS.md). Every route
// under here requires a valid session + recognized active device + the
// admin role — composed once here (docs/02_ARCHITECTURE.md §3's documented
// chain: `auth -> deviceCheck -> requireRole`) rather than repeated per
// route; docs/10_SECURITY_CHECKLIST.md §E: "Role middleware on all /admin".
import { Router } from 'express';
import auth from '../../../middleware/auth.js';
import deviceCheck from '../../../middleware/deviceCheck.js';
import requireRole from '../../../middleware/requireRole.js';
import coursesRouter from './courses.js';
import uploadsRouter from './uploads.js';
import facultyRouter from './faculty.js';
import faqsRouter from './faqs.js';
import messagesRouter from './messages.js';
import settingsRouter from './settings.js';
import mockExamsRouter from './mockExams.js';

const router = Router();

router.use(auth, deviceCheck, requireRole('admin'));

router.use(coursesRouter);
router.use(uploadsRouter);
router.use(facultyRouter);
router.use(faqsRouter);
router.use(messagesRouter);
router.use(settingsRouter);
router.use(mockExamsRouter);

export default router;
