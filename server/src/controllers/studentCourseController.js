// server/src/controllers/studentCourseController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/studentCourseService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as studentCourseService from '../services/studentCourseService.js';

const courseIdParamSchema = z.object({
  courseId: z.coerce.number().int().positive(),
});

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const listMyEnrollments = asyncHandler(async (req, res) => {
  const data = await studentCourseService.listMyEnrollments(req.user.id);
  ok(res, data);
});

export const getCourseCurriculum = asyncHandler(async (req, res) => {
  const { courseId } = validateBody(courseIdParamSchema, req.params);
  const data = await studentCourseService.getCourseCurriculum(req.user.id, courseId);
  ok(res, data);
});
