// server/src/services/studentDashboardService.js
// GET /student/dashboard aggregate (docs/04_API_SPEC.md §3,
// docs/07_EXECUTION_PLAN.md 6.1). Hard AC: <=8 total DB queries for this one
// endpoint — see server/tests/student/dashboard.test.js's query-count
// assertion (counted via a temporary `sequelize.options.logging` hook around
// the real HTTP request, so the number is proven, not eyeballed). This
// service alone issues exactly 6:
//   1-2. Enrollments+course, then the grouped progress aggregate
//        (services/studentCourseService.js#getEnrollmentsWithProgress,
//        reused rather than re-queried — see that module's doc comment).
//   3. Continue-watching: most-recently-updated INCOMPLETE lecture_progress
//      row for this user, with lecture+course via nested belongsTo includes
//      (one query, two SQL JOINs).
//   4. Study hours 7d/total in ONE conditionally-aggregated query
//      (CASE-WHEN SUM alongside a plain SUM), not two separate queries.
//   5. Top-5 announcements (audience='all' OR audience='course' AND
//      courseId IN <enrolled course ids>), with course/creator joined in.
//   6. Unread notification count.
// (The remaining 1-2 queries in the <=8 budget headroom are middleware's
// auth/deviceCheck device lookup, not this service's own cost.)
//
// Response shape matched to the already-built frontend's contract per
// CLAUDE.md §1a — see client/src/types/index.ts's `StudentDashboardStats`
// and client/src/pages/student/StudentDashboardPage.tsx (read-only checks,
// not modified). See DECISIONS.md 2026-07-31 (Phase 6.1-6.3) for the
// specific findings this shape is built from.
import { fn, literal, Op } from 'sequelize';
import db from '../models/index.js';
import { getEnrollmentsWithProgress } from './studentCourseService.js';

const { Lecture, Course, LectureProgress, UserDailyStat, Announcement, Notification, User } = db;

const SECONDS_PER_HOUR = 3600;

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Query 3/6. Filtered in JS (no extra query) against the enrolled-and-
 * currently-active course ids already loaded by queries 1-2, so a lecture
 * whose course enrollment has since expired (or was revoked) never surfaces
 * as "continue watching".
 */
async function loadContinueWatching(userId, activeCourseIds) {
  const row = await LectureProgress.findOne({
    where: { userId, isCompleted: false },
    order: [['updatedAt', 'DESC']],
    include: [{ model: Lecture, as: 'lecture', include: [{ model: Course, as: 'course' }] }],
  });

  if (!row || !row.lecture || !row.lecture.course) return undefined;
  if (!activeCourseIds.has(row.lecture.courseId)) return undefined;

  return {
    lecture: {
      id: row.lecture.id,
      courseId: row.lecture.courseId,
      sectionId: row.lecture.sectionId,
      title: row.lecture.title,
      description: row.lecture.description,
      videoProvider: row.lecture.videoProvider,
      videoRef: row.lecture.videoRef,
      durationSeconds: row.lecture.durationSeconds,
      isFreePreview: row.lecture.isFreePreview,
      isPublished: row.lecture.isPublished,
      sortOrder: row.lecture.sortOrder,
      watchedSeconds: row.watchedSeconds,
      isCompleted: row.isCompleted,
    },
    courseId: row.lecture.courseId,
    courseTitle: row.lecture.course.title,
    watchedSeconds: row.watchedSeconds,
    durationSeconds: row.lecture.durationSeconds,
  };
}

/**
 * Query 4/6. Both windows in ONE query via conditional aggregation
 * (`SUM(CASE WHEN stat_date >= :sevenDaysAgo THEN ... ELSE 0 END)` alongside
 * a plain `SUM(...)`) rather than two separate queries — verified against a
 * real MySQL run before landing this (named `:sevenDaysAgo` replacement
 * inside `literal()`, passed via the finder's own `replacements` option).
 */
async function loadStudyHours(userId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6); // 7 calendar days inclusive of today
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const row = await UserDailyStat.findOne({
    attributes: [
      [
        fn('SUM', literal('CASE WHEN `stat_date` >= :sevenDaysAgo THEN `qbank_seconds` + `video_seconds` ELSE 0 END')),
        'last7dSeconds',
      ],
      [fn('SUM', literal('`qbank_seconds` + `video_seconds`')), 'totalSeconds'],
    ],
    where: { userId },
    replacements: { sevenDaysAgo: sevenDaysAgoStr },
    raw: true,
  });

  const last7dSeconds = Number(row?.last7dSeconds) || 0;
  const totalSeconds = Number(row?.totalSeconds) || 0;
  return {
    studyHours7d: round1(last7dSeconds / SECONDS_PER_HOUR),
    studyHoursTotal: round1(totalSeconds / SECONDS_PER_HOUR),
  };
}

/** Query 5/6. Top 5 most recent announcements visible to this student. */
async function loadAnnouncements(enrolledCourseIds) {
  const rows = await Announcement.findAll({
    where: {
      [Op.or]: [{ audience: 'all' }, { audience: 'course', courseId: enrolledCourseIds.length ? enrolledCourseIds : [-1] }],
    },
    order: [['createdAt', 'DESC']],
    limit: 5,
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title'] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
    ],
  });

  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    audience: a.audience,
    courseId: a.courseId ?? undefined,
    courseTitle: a.course ? a.course.title : undefined,
    sendEmail: a.sendEmail,
    createdBy: a.creator ? a.creator.name : undefined,
    createdAt: a.createdAt,
  }));
}

export async function getDashboard(userId) {
  // Queries 1-2.
  const { enrollments, serialized: activeEnrollments } = await getEnrollmentsWithProgress(userId);

  const now = new Date();
  const activeCourseIds = new Set(
    enrollments.filter((e) => e.status === 'active' && new Date(e.expiresAt) > now).map((e) => e.courseId)
  );
  const enrolledCourseIds = [...new Set(enrollments.map((e) => e.courseId))];

  // Queries 3-6, run concurrently (still 4 distinct SQL statements — the
  // shared connection pool just doesn't serialize them).
  const [continueWatching, studyHours, announcements, unreadNotificationsCount] = await Promise.all([
    loadContinueWatching(userId, activeCourseIds),
    loadStudyHours(userId),
    loadAnnouncements(enrolledCourseIds),
    Notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    activeEnrollments,
    continueWatching,
    studyHours7d: studyHours.studyHours7d,
    studyHoursTotal: studyHours.studyHoursTotal,
    // QBank stats are Phase 7/8's domain (docs/07_EXECUTION_PLAN.md) — no
    // qbank test-session tables/aggregation exist yet to compute these from.
    // Zeroed placeholders so `StudentDashboardStats.qbankStats` (a
    // non-optional field the already-built dashboard UI unconditionally
    // dereferences — `stats?.qbankStats.correctPercent` only optional-chains
    // on `stats`, not `qbankStats`, in
    // client/src/pages/student/StudentDashboardPage.tsx) never throws a
    // runtime TypeError. Flagged for Phase 7/8 to replace with real numbers.
    qbankStats: {
      totalAttempted: 0,
      correctPercent: 0,
      activeStreakDays: 0,
      testsTakenCount: 0,
    },
    announcements,
    unreadNotificationsCount,
  };
}

export default { getDashboard };
