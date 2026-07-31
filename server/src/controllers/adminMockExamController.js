// server/src/controllers/adminMockExamController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/adminMockExamService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminMockExamService from '../services/adminMockExamService.js';
import { EXAM_CATEGORIES } from '../config/constants.js';

// --- Schemas ---------------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const listQuerySchema = z.object({
  q: z.string().trim().max(190).optional(),
  status: z.enum(['all', 'published', 'draft']).optional().default('all'),
});

const mockExamCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  examCategory: z.enum(EXAM_CATEGORIES),
  // Arbitrary generous bound (up to 10 hours) — not spec-prescribed, just a
  // sanity cap so a fat-fingered value can't silently create a nonsensical
  // paper; mirrors the "reject, don't clamp" stance QBANK_TEST_COUNT_MIN/MAX
  // already established for POST /qbank/tests's `count`.
  durationMinutes: z.coerce.number().int().min(1).max(600),
  passPercent: z.coerce.number().min(0).max(100).optional(),
  isPublished: z.coerce.boolean().optional(),
});

const mockExamUpdateSchema = mockExamCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

const questionIdsBodySchema = z.object({
  questionIds: z
    .array(z.coerce.number().int().positive())
    .min(1, 'At least one question is required.')
    .refine((arr) => new Set(arr).size === arr.length, { message: 'questionIds must not contain duplicates.' }),
});

// --- Helpers -----------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const listMockExams = asyncHandler(async (req, res) => {
  const query = validateBody(listQuerySchema, req.query);
  const data = await adminMockExamService.listMockExams(query);
  ok(res, data);
});

export const getMockExam = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminMockExamService.getMockExamById(id);
  ok(res, data);
});

export const createMockExam = asyncHandler(async (req, res) => {
  const body = validateBody(mockExamCreateSchema, req.body);
  const data = await adminMockExamService.createMockExam(body);
  ok(res, data, 201);
});

export const updateMockExam = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(mockExamUpdateSchema, req.body);
  const data = await adminMockExamService.updateMockExam(id, body);
  ok(res, data);
});

export const deleteMockExam = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminMockExamService.deleteMockExam(id);
  ok(res, { success: true });
});

export const publishMockExam = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminMockExamService.setMockExamPublished(id, true);
  ok(res, data);
});

export const unpublishMockExam = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminMockExamService.setMockExamPublished(id, false);
  ok(res, data);
});

export const replaceMockExamQuestions = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { questionIds } = validateBody(questionIdsBodySchema, req.body);
  const data = await adminMockExamService.replaceMockExamQuestions(id, questionIds);
  ok(res, data);
});
