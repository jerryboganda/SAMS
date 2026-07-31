// server/src/services/studentCourseService.js
// Business logic for GET /student/courses and GET /student/courses/:courseId
// (docs/04_API_SPEC.md §3, docs/07_EXECUTION_PLAN.md 6.2-6.3). Response
// shapes are matched to the already-built frontend's contract per CLAUDE.md
// §1a — see client/src/types/index.ts's Enrollment/Course/CourseSection/
// Lecture interfaces and client/src/pages/student/{MyCoursesPage,
// CourseHomePage}.tsx (read-only checks, not modified — see DECISIONS.md
// 2026-07-31 Phase 6.1-6.3 entry for every contract finding below).
// Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
import { fn, col, literal } from 'sequelize';
import { ApiError } from '../utils/apiError.js';
import { serializeCourse } from './publicService.js';
import db from '../models/index.js';

const { Enrollment, Course, CourseSection, Lecture, LectureProgress, LectureBookmark } = db;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function remainingDaysFrom(expiresAt) {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
}

/**
 * Per-enrolled-course lecture progress in ONE grouped aggregate query: LEFT
 * JOINs lecture_progress (scoped to `userId` in the JOIN's ON clause, not a
 * WHERE — `where` on a `required:false` include is added to ON, preserving
 * LEFT JOIN semantics) onto every published lecture in `courseIds`, grouped
 * by course. This is what makes a lecture with zero progress rows still
 * count toward `totalLectures` (a naive query starting from lecture_progress
 * itself would miss it entirely). Returns
 * Map<courseId, {totalLectures, completedCount}> — empty courses/no
 * enrollments never appear in the map; callers default to 0.
 *
 * `col('Lecture.course_id')`/`col('Lecture.id')` deliberately reference the
 * physical (already-underscored) column names, not the camelCase JS
 * attribute names — verified empirically against a real MySQL run before
 * landing this: `col()` inside `attributes`/`group` is NOT run through the
 * model's underscored-mapping the way plain `where`/bare-string
 * `attributes`/`group` entries are (`col('Lecture.courseId')` throws
 * `ER_BAD_FIELD_ERROR: Unknown column 'Lecture.courseId'`); the literal CASE
 * fragment's `` `lectureProgresses`.`is_completed` `` reference is the
 * association's `as` alias (Sequelize aliases the joined table to the
 * include's `as`), also physical-column-named for the same reason. See
 * DECISIONS.md 2026-07-31.
 */
async function loadProgressByCourseId(userId, courseIds) {
  if (courseIds.length === 0) return new Map();

  const rows = await Lecture.findAll({
    attributes: [
      [col('Lecture.course_id'), 'courseId'],
      [fn('COUNT', col('Lecture.id')), 'totalLectures'],
      [fn('SUM', literal('CASE WHEN `lectureProgresses`.`is_completed` = 1 THEN 1 ELSE 0 END')), 'completedCount'],
    ],
    where: { courseId: courseIds, isPublished: true },
    include: [
      {
        model: LectureProgress,
        as: 'lectureProgresses',
        attributes: [],
        where: { userId },
        required: false,
      },
    ],
    group: [col('Lecture.course_id')],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.courseId), {
      totalLectures: Number(row.totalLectures) || 0,
      completedCount: Number(row.completedCount) || 0,
    });
  }
  return map;
}

function serializeEnrollment(enrollment, progressByCourseId) {
  const progress = progressByCourseId.get(enrollment.courseId);
  const progressPercent =
    progress && progress.totalLectures > 0 ? Math.round((progress.completedCount / progress.totalLectures) * 100) : 0;

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    courseTitle: enrollment.course ? enrollment.course.title : undefined,
    courseThumbnail: enrollment.course ? enrollment.course.thumbnailUrl : undefined,
    orderId: enrollment.orderId ?? undefined,
    source: enrollment.source,
    startsAt: enrollment.startsAt,
    expiresAt: enrollment.expiresAt,
    status: enrollment.status,
    progressPercent,
    remainingDays: remainingDaysFrom(enrollment.expiresAt),
  };
}

/**
 * Shared by GET /student/courses AND GET /student/dashboard's
 * `activeEnrollments` field (docs/04_API_SPEC.md §3) — exactly TWO queries
 * (enrollments+course, then the progress aggregate above); the dashboard
 * service reuses this instead of re-running them, which is most of what
 * keeps it inside its own <=8-query budget (see studentDashboardService.js).
 *
 * Returns every enrollment row for `userId` regardless of status (active
 * AND expired) — despite the field's "activeEnrollments" name in
 * StudentDashboardStats, client/src/pages/student/MyCoursesPage.tsx
 * client-side-filters the same flat list into "Active & Expiring Soon" vs
 * "Expired" sections via `status`/`remainingDays`
 * (client/src/components/student/CourseCard.tsx's `isExpiringSoon =
 * !isExpired && remainingDays <= 14`, which is also this project's answer to
 * "expiring soon window" — 14 days, matching the already-built frontend's
 * own threshold exactly, not a separately-computed/returned field since the
 * frontend type has none). So this must hand back the whole set, not a
 * pre-filtered "currently active only" list, or MyCoursesPage's "Expired
 * Subscriptions" section would always be empty.
 */
export async function getEnrollmentsWithProgress(userId) {
  const enrollments = await Enrollment.findAll({
    where: { userId },
    include: [{ model: Course, as: 'course' }],
    order: [['id', 'DESC']],
  });

  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  const progressByCourseId = await loadProgressByCourseId(userId, courseIds);

  return {
    enrollments,
    progressByCourseId,
    serialized: enrollments.map((e) => serializeEnrollment(e, progressByCourseId)),
  };
}

// ---------------------------------------------------------------------------
// GET /student/courses
// ---------------------------------------------------------------------------

export async function listMyEnrollments(userId) {
  const { serialized } = await getEnrollmentsWithProgress(userId);
  return serialized;
}

// ---------------------------------------------------------------------------
// GET /student/courses/:courseId
// ---------------------------------------------------------------------------

/**
 * Enrollment gate for the course-detail endpoint below — the same
 * NOT_ENROLLED/ENROLLMENT_EXPIRED distinction as
 * services/videoService.js#assertEnrolled, reimplemented locally rather than
 * cross-imported: different concern/module (per this task's brief), and this
 * service has no other reason to depend on the video service.
 */
async function assertEnrolledInCourse(userId, courseId) {
  const enrollments = await Enrollment.findAll({ where: { userId, courseId } });
  if (enrollments.length === 0) {
    throw new ApiError(403, 'NOT_ENROLLED', 'You are not enrolled in this course.');
  }
  const now = new Date();
  const active = enrollments.find((e) => e.status === 'active' && new Date(e.expiresAt) > now);
  if (!active) {
    throw new ApiError(403, 'ENROLLMENT_EXPIRED', 'Your enrollment for this course has expired.');
  }
  return active;
}

function serializeCurriculumLecture(lecture, progressByLectureId, bookmarkedLectureIds) {
  const progress = progressByLectureId.get(lecture.id);
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
    // Beyond client/src/types/index.ts's `Lecture` interface (which only has
    // watchedSeconds/isCompleted/isBookmarked) — `lastPositionSeconds` is
    // this task's explicit ask (the curriculum-drawer/checkmark UI Phase
    // 5.4-5.5 flagged as needing it, per DECISIONS.md's Phase 5.4-5.5 entry)
    // and a harmless extra field for a `getEnrolledCourseDetails` call typed
    // `Promise<any>` on the client side today.
    watchedSeconds: progress ? progress.watchedSeconds : 0,
    lastPositionSeconds: progress ? progress.lastPositionSeconds : 0,
    isCompleted: progress ? progress.isCompleted : false,
    isBookmarked: bookmarkedLectureIds.has(lecture.id),
  };
}

/**
 * `GET /student/courses/:courseId` — full curriculum (sections + lectures)
 * for one enrolled course, with per-lecture progress + bookmark state merged
 * in bulk (no per-lecture query loop). Query budget: course (1) + enrollment
 * gate (1) + sections-with-lectures (1, single JOIN) + progress-for-these-
 * lectures (1) + bookmarks-for-these-lectures (1) = 5 queries, none of them
 * repeated per lecture/section.
 *
 * Unpublished/nonexistent course id -> 404 NOT_FOUND BEFORE the enrollment
 * check runs, same "don't leak existence" convention as
 * services/videoService.js#loadPlayableLecture (an unpublished course's
 * existence is never distinguishable from a nonexistent id, even to a
 * formerly/currently-enrolled student).
 */
export async function getCourseCurriculum(userId, courseId) {
  const course = await Course.findOne({ where: { id: courseId, isPublished: true } });
  if (!course) {
    throw new ApiError(404, 'NOT_FOUND', 'Course not found.');
  }

  await assertEnrolledInCourse(userId, courseId);

  const sections = await CourseSection.findAll({
    where: { courseId },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
      [{ model: Lecture, as: 'lectures' }, 'sortOrder', 'ASC'],
      [{ model: Lecture, as: 'lectures' }, 'id', 'ASC'],
    ],
    include: [{ model: Lecture, as: 'lectures', where: { isPublished: true }, required: false }],
  });

  const lectureIds = sections.flatMap((s) => (s.lectures || []).map((l) => l.id));

  const [progressRows, bookmarkRows] = await Promise.all([
    lectureIds.length ? LectureProgress.findAll({ where: { userId, lectureId: lectureIds } }) : Promise.resolve([]),
    lectureIds.length ? LectureBookmark.findAll({ where: { userId, lectureId: lectureIds } }) : Promise.resolve([]),
  ]);

  const progressByLectureId = new Map(progressRows.map((p) => [p.lectureId, p]));
  const bookmarkedLectureIds = new Set(bookmarkRows.map((b) => b.lectureId));

  let lecturesCount = 0;
  let completedCount = 0;
  let totalDurationSeconds = 0;
  const serializedSections = sections.map((section) => {
    const lectures = (section.lectures || []).map((lecture) => {
      lecturesCount += 1;
      totalDurationSeconds += lecture.durationSeconds || 0;
      const progress = progressByLectureId.get(lecture.id);
      if (progress && progress.isCompleted) completedCount += 1;
      return serializeCurriculumLecture(lecture, progressByLectureId, bookmarkedLectureIds);
    });
    return {
      id: section.id,
      courseId: section.courseId,
      title: section.title,
      sortOrder: section.sortOrder,
      lectures,
    };
  });

  const progressPercent = lecturesCount > 0 ? Math.round((completedCount / lecturesCount) * 100) : 0;

  return {
    course: serializeCourse(course, { sectionsCount: sections.length, lecturesCount, totalDurationSeconds }),
    sections: serializedSections,
    progressPercent,
  };
}

export default { getEnrollmentsWithProgress, listMyEnrollments, getCourseCurriculum };
