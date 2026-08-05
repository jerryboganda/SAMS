// server/src/controllers/adminTaxonomyController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/adminTaxonomyService.js.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js;
// audit() applied per-route at routes/v1/admin/taxonomy.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminTaxonomyService from '../services/adminTaxonomyService.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

// subjects.name/body_systems.name are both VARCHAR(120) UNIQUE
// (docs/03_DATABASE_SCHEMA.md) — the frontend only ever sends `{name}`
// (client/src/api/endpoints/admin.ts's createSubject/updateSubject/
// createSystem/updateSystem all take a bare `name: string`), so that is the
// only field this schema accepts.
const nameBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const getTaxonomy = asyncHandler(async (req, res) => {
  const data = await adminTaxonomyService.getTaxonomy();
  ok(res, data);
});

export const createSubject = asyncHandler(async (req, res) => {
  const { name } = validateBody(nameBodySchema, req.body);
  const data = await adminTaxonomyService.createSubject(name);
  ok(res, data, 201);
});

export const updateSubject = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { name } = validateBody(nameBodySchema, req.body);
  const data = await adminTaxonomyService.updateSubject(id, name);
  ok(res, data);
});

export const deleteSubject = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminTaxonomyService.deleteSubject(id);
  ok(res, { success: true });
});

export const createSystem = asyncHandler(async (req, res) => {
  const { name } = validateBody(nameBodySchema, req.body);
  const data = await adminTaxonomyService.createSystem(name);
  ok(res, data, 201);
});

export const updateSystem = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { name } = validateBody(nameBodySchema, req.body);
  const data = await adminTaxonomyService.updateSystem(id, name);
  ok(res, data);
});

export const deleteSystem = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await adminTaxonomyService.deleteSystem(id);
  ok(res, { success: true });
});

export default { getTaxonomy, createSubject, updateSubject, deleteSubject, createSystem, updateSystem, deleteSystem };
