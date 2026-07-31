// server/src/controllers/publicController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/publicService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as publicService from '../services/publicService.js';
import { EXAM_CATEGORIES, PUBLIC_PAGE_KEYS, PUBLIC_COURSES_DEFAULT_LIMIT, PUBLIC_COURSES_MAX_LIMIT } from '../config/constants.js';

// --- Schemas -----------------------------------------------------------
// validateBody() is reused for query/params too — it's just a zod
// safeParse+422 helper, not body-specific (server/src/utils/validate.js).

const coursesQuerySchema = z.object({
  category: z
    .union([z.enum(EXAM_CATEGORIES), z.literal('ALL')])
    .optional()
    .transform((v) => (v === 'ALL' ? undefined : v)),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(PUBLIC_COURSES_MAX_LIMIT).optional().default(PUBLIC_COURSES_DEFAULT_LIMIT),
});

const courseSlugParamSchema = z.object({
  slug: z.string().trim().min(1).max(190),
});

const pageKeyParamSchema = z.object({
  key: z.enum(PUBLIC_PAGE_KEYS),
});

const contactBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(150),
  email: z.string().trim().toLowerCase().email().max(190),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(10, 'Message must be at least 10 characters.').max(5000),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const getHome = asyncHandler(async (req, res) => {
  const data = await publicService.getHome();
  ok(res, data);
});

export const listCourses = asyncHandler(async (req, res) => {
  const query = validateBody(coursesQuerySchema, req.query);
  const data = await publicService.listCourses(query);
  ok(res, data);
});

export const getCourseBySlug = asyncHandler(async (req, res) => {
  const { slug } = validateBody(courseSlugParamSchema, req.params);
  const data = await publicService.getCourseBySlug(slug);
  ok(res, data);
});

export const listFaculty = asyncHandler(async (req, res) => {
  const data = await publicService.listFaculty();
  ok(res, data);
});

export const listFaqs = asyncHandler(async (req, res) => {
  const data = await publicService.listFaqs();
  ok(res, data);
});

export const getPage = asyncHandler(async (req, res) => {
  const { key } = validateBody(pageKeyParamSchema, req.params);
  const data = await publicService.getPage(key);
  ok(res, data);
});

export const submitContact = asyncHandler(async (req, res) => {
  const body = validateBody(contactBodySchema, req.body);
  const data = await publicService.submitContact(body);
  ok(res, data, 201);
});

export const getSampleQuestions = asyncHandler(async (req, res) => {
  const data = await publicService.getSampleQuestions();
  ok(res, data);
});
