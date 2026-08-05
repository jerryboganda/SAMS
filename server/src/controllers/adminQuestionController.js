// server/src/controllers/adminQuestionController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/adminQuestionService.js.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js;
// audit() applied per-route at routes/v1/admin/questions.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminQuestionService from '../services/adminQuestionService.js';
import { EXAM_CATEGORIES } from '../config/constants.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * `id` deliberately loose (not `.positive()`): per the task brief, a
 * genuinely NEW option added in the editor may arrive with `id` missing,
 * `null`, or `0` — all three (plus "not found among this question's
 * existing option ids", checked in the service layer) mean "insert this as
 * new". Rejecting `0`/`null` at the schema layer would break that contract
 * before the service ever gets a chance to interpret it.
 */
const questionOptionSchema = z.object({
  id: z.number().int().nullable().optional(),
  optionText: z.string().trim().min(1, 'Option text is required.'),
  isCorrect: z.coerce.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().optional(),
});

const questionCreateSchema = z.object({
  examCategory: z.enum(EXAM_CATEGORIES),
  subjectId: z.coerce.number().int().positive(),
  systemId: z.coerce.number().int().positive(),
  stem: z.string().trim().min(1, 'Stem is required.'),
  imageUrl: z.string().trim().max(300).optional().nullable(),
  explanation: z.string().trim().min(1, 'Explanation is required.'),
  referenceText: z.string().trim().optional().nullable(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  isActive: z.coerce.boolean().optional(),
  options: z.array(questionOptionSchema).min(2, 'At least 2 options are required.'),
});

const questionUpdateSchema = z
  .object({
    examCategory: z.enum(EXAM_CATEGORIES).optional(),
    subjectId: z.coerce.number().int().positive().optional(),
    systemId: z.coerce.number().int().positive().optional(),
    stem: z.string().trim().min(1, 'Stem is required.').optional(),
    imageUrl: z.string().trim().max(300).optional().nullable(),
    explanation: z.string().trim().min(1, 'Explanation is required.').optional(),
    referenceText: z.string().trim().optional().nullable(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    isActive: z.coerce.boolean().optional(),
    options: z.array(questionOptionSchema).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const listQuestions = asyncHandler(async (req, res) => {
  const data = await adminQuestionService.listQuestionsAdmin();
  ok(res, data);
});

export const createQuestion = asyncHandler(async (req, res) => {
  const body = validateBody(questionCreateSchema, req.body);
  const data = await adminQuestionService.createQuestionAdmin(body);
  ok(res, data, 201);
});

export const updateQuestion = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(questionUpdateSchema, req.body);
  const data = await adminQuestionService.updateQuestionAdmin(id, body);
  ok(res, data);
});

export const deleteQuestion = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminQuestionService.deleteQuestionAdmin(id);
  ok(res, data);
});

export const toggleQuestionActive = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminQuestionService.toggleQuestionActive(id);
  ok(res, data);
});

export default { listQuestions, createQuestion, updateQuestion, deleteQuestion, toggleQuestionActive };
