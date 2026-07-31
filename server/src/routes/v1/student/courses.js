// server/src/routes/v1/student/courses.js
// GET /student/courses, GET /student/courses/:courseId (docs/04_API_SPEC.md
// §3, docs/07_EXECUTION_PLAN.md 6.2-6.3). Role S only, standard
// `auth -> deviceCheck -> requireRole('student')` chain — unlike
// lectures.js's /play route, there is no anonymous path here.
import { Router } from 'express';
import auth from '../../../middleware/auth.js';
import deviceCheck from '../../../middleware/deviceCheck.js';
import requireRole from '../../../middleware/requireRole.js';
import * as studentCourseController from '../../../controllers/studentCourseController.js';

const router = Router();
const requireStudent = [auth, deviceCheck, requireRole('student')];

router.get('/courses', ...requireStudent, studentCourseController.listMyEnrollments);
router.get('/courses/:courseId', ...requireStudent, studentCourseController.getCourseCurriculum);

export default router;
