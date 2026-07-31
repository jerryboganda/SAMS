// server/src/routes/v1/admin/mockExams.js
// Mounts /admin/mock-exams (+publish/unpublish/questions) — docs/04_API_SPEC.md
// §7 "Mock exams — CRUD /admin/mock-exams; PUT /admin/mock-exams/:id/questions
// {questionIds ordered}; /publish"; docs/07_EXECUTION_PLAN.md Phase 8.3.
// auth/deviceCheck/requireRole('admin') are applied once at
// routes/v1/admin/index.js — every mutating route here additionally gets
// `audit(...)` (CLAUDE.md §6: "audit-log every admin mutation",
// non-negotiable), mirroring routes/v1/admin/courses.js's pattern exactly.
import { Router } from 'express';
import * as adminMockExamController from '../../../controllers/adminMockExamController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/mock-exams', adminMockExamController.listMockExams);
router.get('/mock-exams/:id', adminMockExamController.getMockExam);

router.post(
  '/mock-exams',
  audit('mockExam.create', 'mock_exam', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created mock exam "${body?.data?.title ?? ''}"`,
  }),
  adminMockExamController.createMockExam
);

router.patch(
  '/mock-exams/:id',
  audit('mockExam.update', 'mock_exam', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Updated mock exam #${req.params.id}${body?.data?.title ? ` (${body.data.title})` : ''}`,
  }),
  adminMockExamController.updateMockExam
);

router.delete(
  '/mock-exams/:id',
  audit('mockExam.delete', 'mock_exam', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted mock exam #${req.params.id}`,
  }),
  adminMockExamController.deleteMockExam
);

router.post(
  '/mock-exams/:id/publish',
  audit('mockExam.publish', 'mock_exam', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Published mock exam #${req.params.id}`,
  }),
  adminMockExamController.publishMockExam
);

router.post(
  '/mock-exams/:id/unpublish',
  audit('mockExam.unpublish', 'mock_exam', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Unpublished mock exam #${req.params.id}`,
  }),
  adminMockExamController.unpublishMockExam
);

router.put(
  '/mock-exams/:id/questions',
  audit('mockExam.questions.replace', 'mock_exam', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Replaced question set for mock exam #${req.params.id} (${body?.data?.questionsCount ?? '?'} questions)`,
  }),
  adminMockExamController.replaceMockExamQuestions
);

export default router;
