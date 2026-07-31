// server/src/services/adminCourseService.js
// Business logic for admin course/section/lecture management
// (docs/04_API_SPEC.md §7 "Content"). Admin-facing serializers are fuller
// than services/publicService.js's — admins need to see draft/unpublished
// state and every field, not just what a public visitor may see.
import { Op } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { assertExactIdSet } from '../utils/reorder.js';

const { Course, CourseSection, Lecture, Order, Enrollment, LectureProgress, LectureBookmark, sequelize } = db;

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeCourseAdmin(course, extra = {}) {
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    examCategory: course.examCategory,
    shortDescription: course.shortDescription,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl,
    price: Number(course.price),
    currency: course.currency,
    validityDays: course.validityDays,
    includesQBank: course.includesQbank,
    isPublished: course.isPublished,
    sortOrder: course.sortOrder,
    sectionsCount: extra.sectionsCount ?? 0,
    lecturesCount: extra.lecturesCount ?? 0,
    totalDurationSeconds: extra.totalDurationSeconds ?? 0,
  };
}

function serializeLectureAdmin(lecture) {
  return {
    id: lecture.id,
    courseId: lecture.courseId,
    sectionId: lecture.sectionId,
    title: lecture.title,
    description: lecture.description,
    videoProvider: lecture.videoProvider,
    videoRef: lecture.videoRef,
    durationSeconds: lecture.durationSeconds,
    isFreePreview: lecture.isFreePreview,
    isPublished: lecture.isPublished,
    sortOrder: lecture.sortOrder,
  };
}

function serializeSectionAdmin(section) {
  const lectures = (section.lectures || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map(serializeLectureAdmin);
  return {
    id: section.id,
    courseId: section.courseId,
    title: section.title,
    sortOrder: section.sortOrder,
    lectures,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function nextSortOrder(Model, where) {
  const max = await Model.max('sortOrder', { where });
  return (Number.isFinite(max) ? max : -1) + 1;
}

async function findCourseOrThrow(id) {
  const course = await Course.findByPk(id);
  if (!course) throw new ApiError(404, 'NOT_FOUND', 'Course not found.');
  return course;
}

async function findSectionOrThrow(id) {
  const section = await CourseSection.findByPk(id);
  if (!section) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');
  return section;
}

async function findLectureOrThrow(id) {
  const lecture = await Lecture.findByPk(id);
  if (!lecture) throw new ApiError(404, 'NOT_FOUND', 'Lecture not found.');
  return lecture;
}

async function courseAggregate(courseId) {
  const sectionsCount = await CourseSection.count({ where: { courseId } });
  const lectures = await Lecture.findAll({ where: { courseId }, attributes: ['durationSeconds'] });
  const lecturesCount = lectures.length;
  const totalDurationSeconds = lectures.reduce((sum, l) => sum + (l.durationSeconds || 0), 0);
  return { sectionsCount, lecturesCount, totalDurationSeconds };
}

/**
 * A course with real student-facing history (an order or an active
 * enrollment) must never be hard-deleted — `courses` cascades to
 * `course_sections`/`lectures`/`enrollments` at the DB level
 * (docs/03_DATABASE_SCHEMA.md), so an unguarded delete would silently strip
 * paying students of access. Orders themselves aren't even DB-cascaded
 * (`fk_o_course` has no ON DELETE clause → RESTRICT), so without this guard
 * a course with orders would 500 on a raw FK violation instead of a clean
 * 409. A fresh draft course with zero orders/enrollments is always safely
 * hard-deletable. See DECISIONS.md.
 */
async function assertCourseDeletable(courseId) {
  const [orderCount, enrollmentCount] = await Promise.all([
    Order.count({ where: { courseId } }),
    Enrollment.count({ where: { courseId } }),
  ]);
  if (orderCount > 0 || enrollmentCount > 0) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Cannot delete a course that has existing orders or enrollments — unpublish it instead.'
    );
  }
}

/** Symmetric guard for a single lecture — see assertCourseDeletable's reasoning; lecture_progress/lecture_bookmarks cascade-delete too. */
async function assertLectureDeletable(lectureId) {
  const [progressCount, bookmarkCount] = await Promise.all([
    LectureProgress.count({ where: { lectureId } }),
    LectureBookmark.count({ where: { lectureId } }),
  ]);
  if (progressCount > 0 || bookmarkCount > 0) {
    throw new ApiError(409, 'CONFLICT', 'Cannot delete a lecture that has recorded student progress or bookmarks.');
  }
}

/** Symmetric guard for a section — blocks if ANY child lecture is individually undeletable. */
async function assertSectionDeletable(sectionId) {
  const lectureIds = (await Lecture.findAll({ where: { sectionId }, attributes: ['id'] })).map((l) => l.id);
  if (lectureIds.length === 0) return;
  const [progressCount, bookmarkCount] = await Promise.all([
    LectureProgress.count({ where: { lectureId: lectureIds } }),
    LectureBookmark.count({ where: { lectureId: lectureIds } }),
  ]);
  if (progressCount > 0 || bookmarkCount > 0) {
    throw new ApiError(409, 'CONFLICT', 'Cannot delete a section containing lectures with recorded student progress or bookmarks.');
  }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export async function listCourses({ q, status } = {}) {
  const where = {};
  if (status === 'published') where.isPublished = true;
  if (status === 'draft') where.isPublished = false;
  if (q) where.title = { [Op.like]: `%${q}%` };

  const courses = await Course.findAll({
    where,
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);
  const [sections, lectures] = await Promise.all([
    CourseSection.findAll({ where: { courseId: courseIds }, attributes: ['courseId'] }),
    Lecture.findAll({ where: { courseId: courseIds }, attributes: ['courseId', 'durationSeconds'] }),
  ]);

  const sectionsCountByCourse = new Map();
  for (const s of sections) sectionsCountByCourse.set(s.courseId, (sectionsCountByCourse.get(s.courseId) || 0) + 1);

  const lecturesCountByCourse = new Map();
  const durationByCourse = new Map();
  for (const l of lectures) {
    lecturesCountByCourse.set(l.courseId, (lecturesCountByCourse.get(l.courseId) || 0) + 1);
    durationByCourse.set(l.courseId, (durationByCourse.get(l.courseId) || 0) + (l.durationSeconds || 0));
  }

  return courses.map((c) =>
    serializeCourseAdmin(c, {
      sectionsCount: sectionsCountByCourse.get(c.id) || 0,
      lecturesCount: lecturesCountByCourse.get(c.id) || 0,
      totalDurationSeconds: durationByCourse.get(c.id) || 0,
    })
  );
}

export async function getCourseById(id) {
  const course = await findCourseOrThrow(id);
  const extra = await courseAggregate(id);
  return serializeCourseAdmin(course, extra);
}

export async function createCourse(data) {
  try {
    const course = await Course.create({
      title: data.title,
      slug: data.slug,
      examCategory: data.examCategory,
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      price: data.price ?? 0,
      currency: data.currency ?? 'PKR',
      validityDays: data.validityDays ?? 180,
      includesQbank: data.includesQBank ?? true,
      isPublished: data.isPublished ?? false,
      sortOrder: data.sortOrder ?? (await nextSortOrder(Course, {})),
    });
    return serializeCourseAdmin(course, { sectionsCount: 0, lecturesCount: 0, totalDurationSeconds: 0 });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(409, 'CONFLICT', 'A course with this slug already exists.');
    }
    throw err;
  }
}

export async function updateCourse(id, data) {
  const course = await findCourseOrThrow(id);
  const patch = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.slug !== undefined) patch.slug = data.slug;
  if (data.examCategory !== undefined) patch.examCategory = data.examCategory;
  if (data.shortDescription !== undefined) patch.shortDescription = data.shortDescription;
  if (data.description !== undefined) patch.description = data.description;
  if (data.thumbnailUrl !== undefined) patch.thumbnailUrl = data.thumbnailUrl;
  if (data.price !== undefined) patch.price = data.price;
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.validityDays !== undefined) patch.validityDays = data.validityDays;
  if (data.includesQBank !== undefined) patch.includesQbank = data.includesQBank;
  if (data.isPublished !== undefined) patch.isPublished = data.isPublished;
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

  try {
    await course.update(patch);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(409, 'CONFLICT', 'A course with this slug already exists.');
    }
    throw err;
  }
  return getCourseById(id);
}

export async function setCoursePublished(id, isPublished) {
  const course = await findCourseOrThrow(id);
  await course.update({ isPublished });
  return getCourseById(id);
}

export async function deleteCourse(id) {
  await findCourseOrThrow(id);
  await assertCourseDeletable(id);
  await Course.destroy({ where: { id } });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function listSections(courseId) {
  await findCourseOrThrow(courseId);
  const sections = await CourseSection.findAll({
    where: { courseId },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
    include: [{ model: Lecture, as: 'lectures' }],
  });
  return sections.map(serializeSectionAdmin);
}

export async function createSection(courseId, data) {
  await findCourseOrThrow(courseId);
  const sortOrder = data.sortOrder ?? (await nextSortOrder(CourseSection, { courseId }));
  const section = await CourseSection.create({ courseId, title: data.title, sortOrder });
  return serializeSectionAdmin({ ...section.get({ plain: true }), lectures: [] });
}

export async function updateSection(id, data) {
  const section = await findSectionOrThrow(id);
  const patch = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
  await section.update(patch);
  const withLectures = await CourseSection.findByPk(id, { include: [{ model: Lecture, as: 'lectures' }] });
  return serializeSectionAdmin(withLectures);
}

export async function deleteSection(id) {
  await findSectionOrThrow(id);
  await assertSectionDeletable(id);
  await CourseSection.destroy({ where: { id } });
}

export async function reorderSections(courseId, orderedIds) {
  await findCourseOrThrow(courseId);
  const existing = await CourseSection.findAll({ where: { courseId }, attributes: ['id'] });
  assertExactIdSet(
    existing.map((s) => s.id),
    orderedIds
  );

  await sequelize.transaction(async (transaction) => {
    await Promise.all(
      orderedIds.map((id, index) =>
        CourseSection.update({ sortOrder: index }, { where: { id, courseId }, transaction })
      )
    );
  });

  return listSections(courseId);
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

export async function listLectures(sectionId) {
  await findSectionOrThrow(sectionId);
  const lectures = await Lecture.findAll({
    where: { sectionId },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return lectures.map(serializeLectureAdmin);
}

export async function createLecture(sectionId, data) {
  const section = await findSectionOrThrow(sectionId);
  const sortOrder = data.sortOrder ?? (await nextSortOrder(Lecture, { sectionId }));
  const lecture = await Lecture.create({
    courseId: section.courseId,
    sectionId,
    title: data.title,
    description: data.description ?? null,
    videoProvider: data.videoProvider ?? 'bunny',
    videoRef: data.videoRef ?? null,
    durationSeconds: data.durationSeconds ?? 0,
    isFreePreview: data.isFreePreview ?? false,
    isPublished: data.isPublished ?? false,
    sortOrder,
  });
  return serializeLectureAdmin(lecture);
}

export async function updateLecture(id, data) {
  const lecture = await findLectureOrThrow(id);
  const patch = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.videoProvider !== undefined) patch.videoProvider = data.videoProvider;
  if (data.videoRef !== undefined) patch.videoRef = data.videoRef;
  if (data.durationSeconds !== undefined) patch.durationSeconds = data.durationSeconds;
  if (data.isFreePreview !== undefined) patch.isFreePreview = data.isFreePreview;
  if (data.isPublished !== undefined) patch.isPublished = data.isPublished;
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
  await lecture.update(patch);
  return serializeLectureAdmin(lecture);
}

export async function deleteLecture(id) {
  await findLectureOrThrow(id);
  await assertLectureDeletable(id);
  await Lecture.destroy({ where: { id } });
}

export async function reorderLectures(sectionId, orderedIds) {
  await findSectionOrThrow(sectionId);
  const existing = await Lecture.findAll({ where: { sectionId }, attributes: ['id'] });
  assertExactIdSet(
    existing.map((l) => l.id),
    orderedIds
  );

  await sequelize.transaction(async (transaction) => {
    await Promise.all(
      orderedIds.map((id, index) => Lecture.update({ sortOrder: index }, { where: { id, sectionId }, transaction }))
    );
  });

  return listLectures(sectionId);
}
