// server/src/routes/v1/admin/questionImport.js
// Mounts the QBank CSV batch-import wizard's 3 routes (docs/04_API_SPEC.md
// §7 "QBank ... POST /admin/questions/import ... template downloadable
// GET /admin/questions/import-template"; docs/07_EXECUTION_PLAN.md Phase
// 11.4) — split from questions.js purely for file tidiness (both are
// mounted together in routes/v1/admin/index.js). auth/deviceCheck/
// requireRole('admin') are applied once at routes/v1/admin/index.js.
//
// Only the commit route is audited: dry-run is pure validation (writes
// nothing to the database), so it is not an "admin mutation" in the sense
// CLAUDE.md §6 means; commit is the one route that actually persists new
// Question/QuestionOption rows.
import { Router } from 'express';
import * as adminQuestionImportController from '../../../controllers/adminQuestionImportController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.post('/questions/import/dry-run', adminQuestionImportController.dryRunImport);

router.post(
  '/questions/import/commit',
  audit('question_import.commit', 'question', {
    entityId: () => null,
    summary: (req, body) => `Imported ${body?.data?.importedCount ?? 0} question(s) via CSV batch import`,
  }),
  adminQuestionImportController.commitImport
);

router.get('/questions/import-template', adminQuestionImportController.getImportTemplate);

export default router;
