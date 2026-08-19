// server/src/controllers/adminStudentController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/adminStudentService.js.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js;
// audit() applied per-route at routes/v1/admin/students.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminStudentService from '../services/adminStudentService.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const statusBodySchema = z.object({ status: z.enum(['active', 'suspended']) });

const createStudentBodySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name cannot exceed 120 characters'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().trim().nullable().optional(),
  status: z.enum(['active', 'pending', 'suspended']).default('active'),
  emailVerified: z.boolean().default(true),
  enrollments: z
    .array(
      z.object({
        courseId: z.coerce.number().int().positive(),
        days: z.coerce.number().int().positive().optional(),
        expiresAt: z.string().optional(),
        validityMode: z.enum(['days', 'date']).optional(),
      })
    )
    .optional()
    .default([]),
  sendWelcomeEmail: z.boolean().optional().default(false),
});

const updateStudentBodySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name cannot exceed 120 characters').optional(),
  email: z.string().trim().email('Invalid email address').optional(),
  phone: z.string().trim().nullable().optional(),
  status: z.enum(['active', 'pending', 'suspended']).optional(),
  emailVerified: z.boolean().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

const grantEnrollmentBodySchema = z.object({
  courseId: z.coerce.number().int().positive(),
  days: z.coerce.number().int().positive(),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const listStudents = asyncHandler(async (req, res) => {
  const data = await adminStudentService.listAllStudents();
  ok(res, data);
});

export const getStudent = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.getStudentById(id);
  ok(res, data);
});

export const createStudent = asyncHandler(async (req, res) => {
  const body = validateBody(createStudentBodySchema, req.body);
  const data = await adminStudentService.createStudentManually({
    ...body,
    adminUserId: req.user.id,
  });
  ok(res, data, 201);
});

export const updateStudent = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(updateStudentBodySchema, req.body);
  const data = await adminStudentService.updateStudentProfile(id, {
    ...body,
    adminUserId: req.user.id,
  });
  ok(res, data, 200);
});

export const deleteStudent = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.deleteOrAnonymizeStudent(id);
  ok(res, data, 200);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { status } = validateBody(statusBodySchema, req.body);
  const data = await adminStudentService.updateStudentStatus(id, status);
  ok(res, data);
});

export const listDevices = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.listDevicesForStudent(id, req);
  ok(res, data);
});

export const resetDevices = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.resetDevicesForStudent(id);
  ok(res, data);
});

export const anonymize = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.anonymizeStudentAccount(id);
  ok(res, data);
});

export const listLoginEvents = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.listLoginEventsForStudent(id);
  ok(res, data);
});

export const listOrders = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.listOrdersForStudent(id);
  ok(res, data);
});

export const listEnrollments = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await adminStudentService.listEnrollmentsForStudent(id);
  ok(res, data);
});

export const grantEnrollment = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const { courseId, days } = validateBody(grantEnrollmentBodySchema, req.body);
  const data = await adminStudentService.grantEnrollment({ studentId: id, courseId, days, adminUserId: req.user.id });
  ok(res, data, 201);
});

export default {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  updateStatus,
  listDevices,
  resetDevices,
  anonymize,
  listLoginEvents,
  listOrders,
  listEnrollments,
  grantEnrollment,
};
