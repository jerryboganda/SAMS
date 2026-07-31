// server/src/routes/v1/mockExams.js
// Mounts the STUDENT mock-exam endpoints (docs/04_API_SPEC.md §4 `GET
// /mock-exams`, `POST /mock-exams/:id/start`; docs/07_EXECUTION_PLAN.md
// Phase 8.3) at the TOP-LEVEL `/api/v1/mock-exams/*` — NOT nested under
// `/api/v1/student/*` (like routes/v1/student/*.js) and NOT under
// `/api/v1/qbank/*` (like routes/v1/qbank.js), even though it's the same
// engine under the hood. This is deliberate, confirmed two ways, mirroring
// exactly how routes/v1/qbank.js itself confirmed its own top-level mount:
//   1. docs/04_API_SPEC.md §4's own path column lists `/mock-exams` with no
//      `/student` prefix (same table as `/qbank/...`, unlike §3's
//      `/student/dashboard` rows).
//   2. The already-built frontend's real call sites:
//      `client/src/api/endpoints/mock-exams.ts`'s `mockExamsApi` calls
//      `apiFetch("/mock-exams")` / `apiFetch(`/mock-exams/${id}/start`)`,
//      AND `client/src/api/endpoints/qbank.ts`'s `qbankApi.getMockExams()`
//      independently calls the SAME `apiFetch<MockExam[]>("/mock-exams")` —
//      both resolve to `${CONFIG.API_BASE_URL}/mock-exams/...` =
//      `/api/v1/mock-exams/...` (`CONFIG.API_BASE_URL === "/api/v1"`), never
//      `/api/v1/student/mock-exams/...` or `/api/v1/qbank/mock-exams/...`.
// See DECISIONS.md.
//
// The admin CRUD/question-picker/publish surface lives at
// routes/v1/admin/mockExams.js instead (mounted under /api/v1/admin, per
// docs/04_API_SPEC.md §7's own "CRUD /admin/mock-exams" wording) — a
// separate file, separate router, separate auth chain, not this one.
//
// Every route here is role S only — standard `auth -> deviceCheck ->
// requireRole('student')` chain (no anonymous path, unlike
// student/lectures.js's /play route) — mirrors routes/v1/qbank.js exactly.
import { Router } from 'express';
import auth from '../../middleware/auth.js';
import deviceCheck from '../../middleware/deviceCheck.js';
import requireRole from '../../middleware/requireRole.js';
import * as mockExamController from '../../controllers/mockExamController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.get('/', ...requireStudent, mockExamController.listMockExams);
router.post('/:id/start', ...requireStudent, mockExamController.startMockExam);

export default router;
