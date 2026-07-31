// server/src/controllers/adminCourseController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/adminCourseService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminCourseService from '../services/adminCourseService.js';
import { EXAM_CATEGORIES } from '../config/constants.js';

// --- Schemas ---------------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const courseIdParamSchema = z.object({ courseId: z.coerce.number().int().positive() });
const sectionIdParamSchema = z.object({ sectionId: z.coerce.number().int().positive() });

const slugField = z
  .string()
  .trim()
  .min(1)
  .max(190)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only.');

const listCoursesQuerySchema = z.object({
  q: z.string().trim().max(190).optional(),
  status: z.enum(['all', 'published', 'draft']).optional().default('all'),
});

const courseCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: slugField,
  examCategory: z.enum(EXAM_CATEGORIES),
  shortDescription: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().max(65535).optional().nullable(),
  thumbnailUrl: z.string().trim().max(300).optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  validityDays: z.coerce.number().int().min(1).optional(),
  includesQBank: z.coerce.boolean().optional(),
  isPublished: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const courseUpdateSchema = courseCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

const sectionCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
const sectionUpdateSchema = sectionCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

const lectureCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(65535).optional().nullable(),
  videoProvider: z.enum(['bunny', 'mock']).optional(),
  videoRef: z.string().trim().max(120).optional().nullable(),
  durationSeconds: z.coerce.number().int().min(0).optional(),
  isFreePreview: z.coerce.boolean().optional(),
  isPublished: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
const lectureUpdateSchema = lectureCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

const reorderBodySchema = z.object({
  orderedIds: z.array(z.coerce.number().int().positive()).min(1),
});

// --- Helpers -----------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Courses ---------------------------------------------------------------

export const listCourses = asyncHandler(async (req, res) => {
  const query = validateBody(listCoursesQuerySchema, req.query);
  const data = await adminCourseService.listCourses(query);
  ok(res, data);
});

export const getCourse = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminCourseService.getCourseById(id);
  ok(res, data);
});

export const createCourse = asyncHandler(async (req, res) => {
  const body = validateBody(courseCreateSchema, req.body);
  const data = await adminCourseService.createCourse(body);
  ok(res, data, 201);
});

export const updateCourse = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(courseUpdateSchema, req.body);
  const data = await adminCourseService.updateCourse(id, body);
  ok(res, data);
});

export const deleteCourse = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminCourseService.deleteCourse(id);
  ok(res, { success: true });
});

export const publishCourse = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminCourseService.setCoursePublished(id, true);
  ok(res, data);
});

export const unpublishCourse = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminCourseService.setCoursePublished(id, false);
  ok(res, data);
});

// --- Sections ----------------------------------------------------------

export const listSections = asyncHandler(async (req, res) => {
  const { courseId } = validateBody(courseIdParamSchema, req.params);
  const data = await adminCourseService.listSections(courseId);
  ok(res, data);
});

export const createSection = asyncHandler(async (req, res) => {
  const { courseId } = validateBody(courseIdParamSchema, req.params);
  const body = validateBody(sectionCreateSchema, req.body);
  const data = await adminCourseService.createSection(courseId, body);
  ok(res, data, 201);
});

export const updateSection = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(sectionUpdateSchema, req.body);
  const data = await adminCourseService.updateSection(id, body);
  ok(res, data);
});

export const deleteSection = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminCourseService.deleteSection(id);
  ok(res, { success: true });
});

export const reorderSections = asyncHandler(async (req, res) => {
  const { courseId } = validateBody(courseIdParamSchema, req.params);
  const { orderedIds } = validateBody(reorderBodySchema, req.body);
  const data = await adminCourseService.reorderSections(courseId, orderedIds);
  ok(res, data);
});

// --- Lectures ------------------------------------------------------------

export const listLectures = asyncHandler(async (req, res) => {
  const { sectionId } = validateBody(sectionIdParamSchema, req.params);
  const data = await adminCourseService.listLectures(sectionId);
  ok(res, data);
});

export const createLecture = asyncHandler(async (req, res) => {
  const { sectionId } = validateBody(sectionIdParamSchema, req.params);
  const body = validateBody(lectureCreateSchema, req.body);
  const data = await adminCourseService.createLecture(sectionId, body);
  ok(res, data, 201);
});

export const updateLecture = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(lectureUpdateSchema, req.body);
  const data = await adminCourseService.updateLecture(id, body);
  ok(res, data);
});

export const deleteLecture = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminCourseService.deleteLecture(id);
  ok(res, { success: true });
});

export const reorderLectures = asyncHandler(async (req, res) => {
  const { sectionId } = validateBody(sectionIdParamSchema, req.params);
  const { orderedIds } = validateBody(reorderBodySchema, req.body);
  const data = await adminCourseService.reorderLectures(sectionId, orderedIds);
  ok(res, data);
});
