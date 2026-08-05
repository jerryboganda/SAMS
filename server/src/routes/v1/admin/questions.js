// server/src/routes/v1/admin/questions.js
// Mounts /admin/questions CRUD + /admin/questions/:id/toggle-active
// (docs/04_API_SPEC.md §7 "QBank"; docs/07_EXECUTION_PLAN.md Phase 11.3).
// auth/deviceCheck/requireRole('admin') are applied once at
// routes/v1/admin/index.js — every mutating route here additionally gets
// `audit(...)` (CLAUDE.md §6: "audit-log every admin mutation",
// non-negotiable), mirroring routes/v1/admin/coupons.js's pattern exactly.
// CSV import routes live in the sibling questionImport.js (kept separate for
// tidiness — see that file).
import { Router } from 'express';
import * as adminQuestionController from '../../../controllers/adminQuestionController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/questions', adminQuestionController.listQuestions);

router.post(
  '/questions',
  audit('question.create', 'question', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created question #${body?.data?.id ?? ''}`,
  }),
  adminQuestionController.createQuestion
);

router.patch(
  '/questions/:id',
  audit('question.update', 'question', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Updated question #${req.params.id}`,
  }),
  adminQuestionController.updateQuestion
);

router.delete(
  '/questions/:id',
  audit('question.delete', 'question', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) =>
      `Deleted question #${req.params.id}${body?.data?.softDeleted ? ' (soft-deleted — has attempt history)' : ''}`,
  }),
  adminQuestionController.deleteQuestion
);

router.post(
  '/questions/:id/toggle-active',
  audit('question.toggle_active', 'question', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Toggled question #${req.params.id}, isActive=${body?.data?.isActive}`,
  }),
  adminQuestionController.toggleQuestionActive
);

export default router;
