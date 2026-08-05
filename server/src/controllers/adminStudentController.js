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
  updateStatus,
  listDevices,
  resetDevices,
  listLoginEvents,
  listOrders,
  listEnrollments,
  grantEnrollment,
};
