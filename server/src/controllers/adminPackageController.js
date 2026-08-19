// server/src/controllers/adminPackageController.js
// Thin controller per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// Handles admin CRUD endpoints and public listing for subscription packages.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminPackageService from '../services/adminPackageService.js';

// --- Validation Schemas -----------------------------------------------------

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const slugField = z
  .string()
  .trim()
  .min(2)
  .max(190)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only.');

const createPackageSchema = z.object({
  title: z.string().trim().min(2).max(190),
  slug: slugField.optional().nullable(),
  description: z.string().trim().optional().nullable(),
  examCategory: z.string().trim().optional().default('NRE1'),
  price: z.coerce.number().min(0),
  originalPrice: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().trim().optional().default('PKR'),
  validityDays: z.coerce.number().int().positive().default(180),
  includedCourseIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  includesQbank: z.boolean().optional().default(true),
  includesMockExams: z.boolean().optional().default(true),
  maxDevices: z.coerce.number().int().positive().optional().default(2),
  features: z.array(z.string()).optional().default([]),
  badge: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
  isPopular: z.boolean().optional().default(false),
});

const updatePackageSchema = z
  .object({
    title: z.string().trim().min(2).max(190).optional(),
    slug: slugField.optional().nullable(),
    description: z.string().trim().optional().nullable(),
    examCategory: z.string().trim().optional(),
    price: z.coerce.number().min(0).optional(),
    originalPrice: z.coerce.number().min(0).optional().nullable(),
    currency: z.string().trim().optional(),
    validityDays: z.coerce.number().int().positive().optional(),
    includedCourseIds: z.array(z.coerce.number().int().positive()).optional(),
    includesQbank: z.boolean().optional(),
    includesMockExams: z.boolean().optional(),
    maxDevices: z.coerce.number().int().positive().optional(),
    features: z.array(z.string()).optional(),
    badge: z.string().trim().optional().nullable(),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
    isPopular: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

// --- Response Helper --------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Controller Handlers ----------------------------------------------------

export const listPackages = asyncHandler(async (_req, res) => {
  const data = await adminPackageService.listAllPackages();
  ok(res, data);
});

export const getPackage = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminPackageService.getPackageById(id);
  ok(res, data);
});

export const createPackage = asyncHandler(async (req, res) => {
  const body = validateBody(createPackageSchema, req.body);
  const data = await adminPackageService.createPackage(body, req.user?.id);
  ok(res, data, 201);
});

export const updatePackage = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(updatePackageSchema, req.body);
  const data = await adminPackageService.updatePackage(id, body, req.user?.id);
  ok(res, data);
});

export const togglePackage = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminPackageService.togglePackageActive(id, req.user?.id);
  ok(res, data);
});

export const deletePackage = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminPackageService.deletePackage(id, req.user?.id);
  ok(res, data);
});

export const listPublicPackages = asyncHandler(async (_req, res) => {
  const data = await adminPackageService.listPublicPackages();
  ok(res, data);
});

export default {
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
  togglePackage,
  deletePackage,
  listPublicPackages,
};
