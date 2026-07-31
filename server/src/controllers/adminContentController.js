// server/src/controllers/adminContentController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminContentService from '../services/adminContentService.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const facultyCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().max(200).optional().nullable(),
  bio: z.string().trim().max(65535).optional().nullable(),
  photoUrl: z.string().trim().max(300).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
});
const facultyUpdateSchema = facultyCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

const faqCreateSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(65535),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
});
const faqUpdateSchema = faqCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

const reorderItemsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        sortOrder: z.coerce.number().int().min(0),
      })
    )
    .min(1),
});

const listMessagesQuerySchema = z.object({
  status: z.enum(['new', 'read', 'replied']).optional(),
});
const updateMessageStatusSchema = z.object({
  status: z.enum(['new', 'read', 'replied']),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Faculty ---------------------------------------------------------------

export const listFaculty = asyncHandler(async (req, res) => {
  const data = await adminContentService.listFaculty();
  ok(res, data);
});

export const createFaculty = asyncHandler(async (req, res) => {
  const body = validateBody(facultyCreateSchema, req.body);
  const data = await adminContentService.createFaculty(body);
  ok(res, data, 201);
});

export const updateFaculty = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(facultyUpdateSchema, req.body);
  const data = await adminContentService.updateFaculty(id, body);
  ok(res, data);
});

export const deleteFaculty = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminContentService.deleteFaculty(id);
  ok(res, { success: true });
});

export const reorderFaculty = asyncHandler(async (req, res) => {
  const { items } = validateBody(reorderItemsSchema, req.body);
  const data = await adminContentService.reorderFaculty(items);
  ok(res, data);
});

// --- FAQs ------------------------------------------------------------------

export const listFaqs = asyncHandler(async (req, res) => {
  const data = await adminContentService.listFaqs();
  ok(res, data);
});

export const createFaq = asyncHandler(async (req, res) => {
  const body = validateBody(faqCreateSchema, req.body);
  const data = await adminContentService.createFaq(body);
  ok(res, data, 201);
});

export const updateFaq = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(faqUpdateSchema, req.body);
  const data = await adminContentService.updateFaq(id, body);
  ok(res, data);
});

export const deleteFaq = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminContentService.deleteFaq(id);
  ok(res, { success: true });
});

export const reorderFaqs = asyncHandler(async (req, res) => {
  const { items } = validateBody(reorderItemsSchema, req.body);
  const data = await adminContentService.reorderFaqs(items);
  ok(res, data);
});

// --- Contact messages --------------------------------------------------

export const listContactMessages = asyncHandler(async (req, res) => {
  const query = validateBody(listMessagesQuerySchema, req.query);
  const data = await adminContentService.listContactMessages(query);
  ok(res, data);
});

export const updateContactMessageStatus = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { status } = validateBody(updateMessageStatusSchema, req.body);
  const data = await adminContentService.updateContactMessageStatus(id, status);
  ok(res, data);
});
