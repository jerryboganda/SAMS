// server/src/controllers/mockExamController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/mockExamService.js. Mounted at
// the top-level `/api/v1/mock-exams/*` — see routes/v1/mockExams.js's header
// comment for why (NOT under `/api/v1/student/*` or `/api/v1/qbank/*`).
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as mockExamService from '../services/mockExamService.js';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const listMockExams = asyncHandler(async (req, res) => {
  const data = await mockExamService.listMockExamsForStudent(req.user.id);
  ok(res, data);
});

export const startMockExam = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await mockExamService.startMockExam(req.user.id, id);
  ok(res, data, 201);
});
