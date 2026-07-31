// server/src/controllers/qbankController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/qbankService.js. Mounted at the
// top-level `/api/v1/qbank/*` — see routes/v1/qbank.js's header comment for
// why (NOT under `/api/v1/student/*`).
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import { EXAM_CATEGORIES, QBANK_TEST_COUNT_MIN, QBANK_TEST_COUNT_MAX } from '../config/constants.js';
import * as qbankService from '../services/qbankService.js';

// --- Schemas ----------------------------------------------------------------

const testIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const questionIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createTestBodySchema = z
  .object({
    examCategory: z.enum(EXAM_CATEGORIES),
    subjectIds: z.array(z.coerce.number().int().positive()).optional(),
    systemIds: z.array(z.coerce.number().int().positive()).optional(),
    // Rejected (422), not silently clamped, outside [5,200] — see
    // services/qbankService.js's createTest doc comment + DECISIONS.md.
    count: z.coerce.number().int().min(QBANK_TEST_COUNT_MIN).max(QBANK_TEST_COUNT_MAX),
    mode: z.enum(['practice', 'exam', 'mock']),
    timed: z.boolean(),
    timeLimitSeconds: z.coerce.number().int().positive().optional(),
    pool: z.enum(['all', 'unused', 'incorrect', 'bookmarked']),
    // Not in docs/04_API_SPEC.md's literal body shorthand but a real,
    // already-wired frontend field — see services/qbankService.js's
    // createTest doc comment + DECISIONS.md.
    forceNew: z.boolean().optional().default(false),
  })
  .refine((data) => !data.timed || (data.timeLimitSeconds && data.timeLimitSeconds > 0), {
    message: 'timeLimitSeconds is required when timed is true.',
    path: ['timeLimitSeconds'],
  });

const answerBodySchema = z.object({
  questionId: z.coerce.number().int().positive(),
  optionId: z.coerce.number().int().positive().nullable().optional(),
  timeSpent: z.coerce.number().finite().nonnegative(),
  flagged: z.boolean().optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

// --- Helpers ------------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers -----------------------------------------------------------------

export const getMeta = asyncHandler(async (req, res) => {
  const data = await qbankService.getQbankMeta(req.user.id);
  ok(res, data);
});

export const createTest = asyncHandler(async (req, res) => {
  const body = validateBody(createTestBodySchema, req.body);
  const data = await qbankService.createTest(req.user.id, body);
  ok(res, data, 201);
});

export const listTestHistory = asyncHandler(async (req, res) => {
  const query = validateBody(historyQuerySchema, req.query);
  const data = await qbankService.listTestHistory(req.user.id, query);
  ok(res, data);
});

export const getTestSession = asyncHandler(async (req, res) => {
  const { id } = validateBody(testIdParamSchema, req.params);
  const data = await qbankService.getTestSession(req.user.id, id);
  ok(res, data);
});

export const answerQuestion = asyncHandler(async (req, res) => {
  const { id } = validateBody(testIdParamSchema, req.params);
  const body = validateBody(answerBodySchema, req.body);
  const data = await qbankService.answerQuestion(req.user.id, id, body);
  ok(res, data);
});

export const submitTest = asyncHandler(async (req, res) => {
  const { id } = validateBody(testIdParamSchema, req.params);
  const data = await qbankService.submitTest(req.user.id, id);
  ok(res, data);
});

export const abandonTest = asyncHandler(async (req, res) => {
  const { id } = validateBody(testIdParamSchema, req.params);
  const data = await qbankService.abandonTest(req.user.id, id);
  ok(res, data);
});

export const getTestReview = asyncHandler(async (req, res) => {
  const { id } = validateBody(testIdParamSchema, req.params);
  const data = await qbankService.getTestReview(req.user.id, id);
  ok(res, data);
});

export const listBookmarkedQuestions = asyncHandler(async (req, res) => {
  const data = await qbankService.listBookmarkedQuestions(req.user.id);
  ok(res, data);
});

export const listIncorrectQuestions = asyncHandler(async (req, res) => {
  const data = await qbankService.listIncorrectQuestions(req.user.id);
  ok(res, data);
});

export const addBookmark = asyncHandler(async (req, res) => {
  const { id } = validateBody(questionIdParamSchema, req.params);
  const data = await qbankService.addQuestionBookmark(req.user.id, id);
  ok(res, data, 201);
});

export const removeBookmark = asyncHandler(async (req, res) => {
  const { id } = validateBody(questionIdParamSchema, req.params);
  const data = await qbankService.removeQuestionBookmark(req.user.id, id);
  ok(res, data);
});
