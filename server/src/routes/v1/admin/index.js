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
import bankTransfersRouter from './bankTransfers.js';
import ordersRouter from './orders.js';
import couponsRouter from './coupons.js';
import announcementsRouter from './announcements.js';
import dashboardRouter from './dashboard.js';
import reportsRouter from './reports.js';
import auditLogsRouter from './auditLogs.js';
import studentsRouter from './students.js';
import enrollmentsRouter from './enrollments.js';
import questionsRouter from './questions.js';
import questionImportRouter from './questionImport.js';
import taxonomyRouter from './taxonomy.js';

const router = Router();

router.use(auth, deviceCheck, requireRole('admin'));

router.use(coursesRouter);
router.use(uploadsRouter);
router.use(facultyRouter);
router.use(faqsRouter);
router.use(messagesRouter);
router.use(settingsRouter);
router.use(mockExamsRouter);
// docs/07_EXECUTION_PLAN.md 9.5/9.6 — bank_transfer + raast manual-payment
// admin approval queue.
router.use(bankTransfersRouter);
// docs/07_EXECUTION_PLAN.md 9.8 — admin orders management + coupons CRUD.
router.use(ordersRouter);
router.use(couponsRouter);
// docs/07_EXECUTION_PLAN.md 10.2 — admin announcement composer/broadcast.
router.use(announcementsRouter);
// docs/07_EXECUTION_PLAN.md 11.2 — admin students management (search/detail,
// devices reset, login history, manual enrollment grant/extend/revoke).
router.use(studentsRouter);
router.use(enrollmentsRouter);
// docs/07_EXECUTION_PLAN.md 11.1 — admin KPI dashboard.
router.use(dashboardRouter);
// docs/07_EXECUTION_PLAN.md 11.5 — combined reports endpoint + audit-log viewer.
router.use(reportsRouter);
router.use(auditLogsRouter);
// docs/07_EXECUTION_PLAN.md 11.3/11.4 — QBank admin (question CRUD +
// taxonomy CRUD + CSV batch import).
router.use(questionsRouter);
router.use(questionImportRouter);
router.use(taxonomyRouter);

export default router;
