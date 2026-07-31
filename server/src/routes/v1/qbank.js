// server/src/routes/v1/qbank.js
// Mounts the whole QBank engine (docs/04_API_SPEC.md §4,
// docs/07_EXECUTION_PLAN.md 7.1-7.4) at the TOP-LEVEL `/api/v1/qbank/*` — NOT
// nested under `/api/v1/student/*` like routes/v1/student/*.js. This is
// deliberate, not an oversight: §4's own path column has no `/student`
// prefix (unlike §3's `/student/dashboard`, `/student/courses`, ...), and
// the already-built frontend's real call sites confirm it —
// `client/src/api/endpoints/qbank.ts`'s `apiFetch("/qbank/meta")` resolves to
// `${CONFIG.API_BASE_URL}/qbank/meta` = `/api/v1/qbank/meta`
// (`CONFIG.API_BASE_URL === "/api/v1"`, `client/src/config.ts`) — never
// `/api/v1/student/qbank/meta`. See DECISIONS.md.
//
// Every route is role S only — standard `auth -> deviceCheck ->
// requireRole('student')` chain (no anonymous path here, unlike
// student/lectures.js's /play route).
import { Router } from 'express';
import auth from '../../middleware/auth.js';
import deviceCheck from '../../middleware/deviceCheck.js';
import requireRole from '../../middleware/requireRole.js';
import * as qbankController from '../../controllers/qbankController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.get('/meta', ...requireStudent, qbankController.getMeta);

router.post('/tests', ...requireStudent, qbankController.createTest);
router.get('/tests', ...requireStudent, qbankController.listTestHistory);
router.get('/tests/:id', ...requireStudent, qbankController.getTestSession);
router.patch('/tests/:id/answer', ...requireStudent, qbankController.answerQuestion);
router.post('/tests/:id/submit', ...requireStudent, qbankController.submitTest);
router.post('/tests/:id/abandon', ...requireStudent, qbankController.abandonTest);
router.get('/tests/:id/review', ...requireStudent, qbankController.getTestReview);

// Gap-closure listing endpoints (not in docs/04_API_SPEC.md's original §4
// table when Phase 7.1-7.4 shipped — added after the Phase 7.5-7.6 frontend
// review flagged the toggle-only bookmark endpoints + meta's COUNT-only
// pools as insufficient for the Bookmarks/Incorrect-Questions pages; see
// qbankService.js's dedicated doc comment above listBookmarkedQuestions and
// DECISIONS.md's dated entry). Registered before the `/questions/:id/...`
// param routes for readability (static-before-dynamic); no actual routing
// ambiguity either way since the path shapes differ (`/questions/bookmarked`
// is 2 segments, `/questions/:id/bookmark` is 3).
router.get('/questions/bookmarked', ...requireStudent, qbankController.listBookmarkedQuestions);
router.get('/questions/incorrect', ...requireStudent, qbankController.listIncorrectQuestions);

router.post('/questions/:id/bookmark', ...requireStudent, qbankController.addBookmark);
router.delete('/questions/:id/bookmark', ...requireStudent, qbankController.removeBookmark);

// Phase 8.1 — totals/%s, subject+system arrays, strengths/weaknesses, and a
// `?range=`-bucketed series from user_daily_stats. See
// services/analyticsService.js for the full design + DECISIONS.md.
router.get('/analytics', ...requireStudent, qbankController.getAnalytics);

export default router;
