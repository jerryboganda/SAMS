// server/src/routes/v1/admin/courses.js
// Mounts /admin/courses(+publish/unpublish/sections), /admin/sections(+lectures),
// /admin/lectures (docs/04_API_SPEC.md §7 "Content"). auth/deviceCheck/
// requireRole('admin') are applied once at routes/v1/admin/index.js — every
// mutating route here additionally gets `audit(...)` (CLAUDE.md §6: "audit-
// log every admin mutation", non-negotiable).
import { Router } from 'express';
import * as adminCourseController from '../../../controllers/adminCourseController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

// --- Courses -----------------------------------------------------------
router.get('/courses', adminCourseController.listCourses);
router.get('/courses/:id', adminCourseController.getCourse);

router.post(
  '/courses',
  audit('course.create', 'course', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created course "${body?.data?.title ?? ''}"`,
  }),
  adminCourseController.createCourse
);

router.patch(
  '/courses/:id',
  audit('course.update', 'course', {
    entityId: (req) => Number(req.params.id),
    summary: (req, body) => `Updated course #${req.params.id}${body?.data?.title ? ` (${body.data.title})` : ''}`,
  }),
  adminCourseController.updateCourse
);

router.delete(
  '/courses/:id',
  audit('course.delete', 'course', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted course #${req.params.id}`,
  }),
  adminCourseController.deleteCourse
);

router.post(
  '/courses/:id/publish',
  audit('course.publish', 'course', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Published course #${req.params.id}`,
  }),
  adminCourseController.publishCourse
);

router.post(
  '/courses/:id/unpublish',
  audit('course.unpublish', 'course', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Unpublished course #${req.params.id}`,
  }),
  adminCourseController.unpublishCourse
);

// --- Sections (nested under a course) -----------------------------------
router.get('/courses/:courseId/sections', adminCourseController.listSections);

router.post(
  '/courses/:courseId/sections',
  audit('section.create', 'course_section', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created section "${body?.data?.title ?? ''}" in course #${req.params.courseId}`,
  }),
  adminCourseController.createSection
);

router.patch(
  '/courses/:courseId/sections/reorder',
  audit('section.reorder', 'course_section', {
    entityId: (req) => Number(req.params.courseId),
    summary: (req) => `Reordered sections for course #${req.params.courseId}`,
  }),
  adminCourseController.reorderSections
);

router.patch(
  '/sections/:id',
  audit('section.update', 'course_section', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Updated section #${req.params.id}`,
  }),
  adminCourseController.updateSection
);

router.delete(
  '/sections/:id',
  audit('section.delete', 'course_section', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted section #${req.params.id}`,
  }),
  adminCourseController.deleteSection
);

// --- Lectures (nested under a section) -----------------------------------
router.get('/sections/:sectionId/lectures', adminCourseController.listLectures);

router.post(
  '/sections/:sectionId/lectures',
  audit('lecture.create', 'lecture', {
    entityId: (req, body) => body?.data?.id ?? null,
    summary: (req, body) => `Created lecture "${body?.data?.title ?? ''}" in section #${req.params.sectionId}`,
  }),
  adminCourseController.createLecture
);

router.patch(
  '/sections/:sectionId/lectures/reorder',
  audit('lecture.reorder', 'lecture', {
    entityId: (req) => Number(req.params.sectionId),
    summary: (req) => `Reordered lectures for section #${req.params.sectionId}`,
  }),
  adminCourseController.reorderLectures
);

router.patch(
  '/lectures/:id',
  audit('lecture.update', 'lecture', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Updated lecture #${req.params.id}`,
  }),
  adminCourseController.updateLecture
);

router.delete(
  '/lectures/:id',
  audit('lecture.delete', 'lecture', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Deleted lecture #${req.params.id}`,
  }),
  adminCourseController.deleteLecture
);

export default router;
