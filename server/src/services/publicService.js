// server/src/services/publicService.js
// Business logic for the public catalog & site endpoints (docs/04_API_SPEC.md
// §2). Response shapes are matched to the already-built frontend's contract
// per CLAUDE.md §1a — see client/src/api/endpoints/public.ts,
// client/src/types/index.ts, and DECISIONS.md's 2026-07-31 (Phase 3.1) entry
// for the specific findings/decisions behind each shape below.
import { fn, col } from 'sequelize';
import { ApiError } from '../utils/apiError.js';
import { sendMail, contactMessageAdminAlertTemplate } from '../utils/mailer.js';
import { sanitizePlainText } from '../utils/sanitize.js';
import { env } from '../config/env.js';
import {
  PUBLIC_HOME_FEATURED_COURSES_LIMIT,
  PUBLIC_HOME_FACULTY_PREVIEW_LIMIT,
  PUBLIC_HOME_FAQ_PREVIEW_LIMIT,
  PUBLIC_SAMPLE_QUESTIONS_COUNT,
} from '../config/constants.js';
import db from '../models/index.js';

const { Course, CourseSection, Lecture, Faculty, Faq, ContactMessage, Setting, Question, QuestionOption, Subject, BodySystem } = db;

// ---------------------------------------------------------------------------
// Serializers — field names deliberately match client/src/types/index.ts
// exactly (camelCase, including the `includesQBank`/`includesQbank` casing
// mismatch between the model attribute and the frontend type).
// ---------------------------------------------------------------------------

export function serializeCourse(course, extra = {}) {
  const out = {
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
  };
  if (extra.sectionsCount !== undefined) out.sectionsCount = extra.sectionsCount;
  if (extra.lecturesCount !== undefined) out.lecturesCount = extra.lecturesCount;
  if (extra.totalDurationSeconds !== undefined) out.totalDurationSeconds = extra.totalDurationSeconds;
  return out;
}

export function serializeFaculty(faculty) {
  return {
    id: faculty.id,
    name: faculty.name,
    title: faculty.title,
    bio: faculty.bio,
    photoUrl: faculty.photoUrl,
    sortOrder: faculty.sortOrder,
    isActive: faculty.isActive,
  };
}

export function serializeFaq(faq) {
  return {
    id: faq.id,
    question: faq.question,
    answer: faq.answer,
    sortOrder: faq.sortOrder,
    isActive: faq.isActive,
  };
}

// `locked` is an addition beyond client/src/types/index.ts's `Lecture`
// interface (see DECISIONS.md) — harmless extra field for TS callers, and
// gives a pre-auth-safe public route an explicit signal instead of forcing
// the client to re-derive `!isFreePreview` itself. `videoProvider`/`videoRef`
// are deliberately NOT exposed here: playback refs/URLs only ever come from
// the signed, expiring `/student/lectures/:id/play` endpoint (Phase 5).
function serializeLecturePublic(lecture) {
  return {
    id: lecture.id,
    courseId: lecture.courseId,
    sectionId: lecture.sectionId,
    title: lecture.title,
    description: lecture.description,
    durationSeconds: lecture.durationSeconds,
    isFreePreview: lecture.isFreePreview,
    sortOrder: lecture.sortOrder,
    locked: !lecture.isFreePreview,
  };
}

function serializeSectionWithLectures(section) {
  const lectures = (section.lectures || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map(serializeLecturePublic);
  return {
    id: section.id,
    courseId: section.courseId,
    title: section.title,
    sortOrder: section.sortOrder,
    lectures,
  };
}

// Never includes `isCorrect` on any option — this is public marketing
// content and must never leak answers pre-submit (docs/04_API_SPEC.md §8).
function serializeQuestionPublic(question) {
  return {
    id: question.id,
    examCategory: question.examCategory,
    subjectId: question.subjectId,
    subjectName: question.subject ? question.subject.name : undefined,
    systemId: question.systemId,
    systemName: question.system ? question.system.name : undefined,
    stem: question.stem,
    imageUrl: question.imageUrl,
    options: (question.questionOptions || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((opt) => ({
        id: opt.id,
        questionId: opt.questionId,
        optionText: opt.optionText,
        sortOrder: opt.sortOrder,
      })),
    explanation: question.explanation,
    referenceText: question.referenceText,
    difficulty: question.difficulty,
    isActive: question.isActive,
  };
}

// ---------------------------------------------------------------------------
// GET /public/home
// ---------------------------------------------------------------------------

export async function getHome() {
  const [featuredCoursesRaw, faculty, faqs, coursesCount, questionsCount, facultyCount, videoLecturesCount] = await Promise.all([
    Course.findAll({
      where: { isPublished: true },
      order: [
        ['sortOrder', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: PUBLIC_HOME_FEATURED_COURSES_LIMIT,
    }),
    Faculty.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: PUBLIC_HOME_FACULTY_PREVIEW_LIMIT,
    }),
    Faq.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: PUBLIC_HOME_FAQ_PREVIEW_LIMIT,
    }),
    Course.count({ where: { isPublished: true } }),
    Question.count({ where: { isActive: true } }),
    Faculty.count({ where: { isActive: true } }),
    Lecture.count({ where: { isPublished: true } }),
  ]);

  const featuredCourseIds = featuredCoursesRaw.map((c) => c.id);
  const featuredLectureCountRows = featuredCourseIds.length
    ? await Lecture.findAll({
        attributes: ['courseId', [fn('COUNT', col('id')), 'lecturesCount']],
        where: { courseId: featuredCourseIds, isPublished: true },
        group: ['courseId'],
        raw: true,
      })
    : [];
  const featuredLecturesCountByCourseId = new Map(
    featuredLectureCountRows.map((r) => [Number(r.courseId), Number(r.lecturesCount)])
  );

  return {
    featuredCourses: featuredCoursesRaw.map((c) =>
      serializeCourse(c, { lecturesCount: featuredLecturesCountByCourseId.get(c.id) ?? 0 })
    ),
    faculty: faculty.map(serializeFaculty),
    faqs: faqs.map(serializeFaq),
    stats: {
      coursesCount,
      questionsCount,
      facultyCount,
      videoLecturesCount,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /public/courses
// ---------------------------------------------------------------------------

export async function listCourses({ category, page, limit } = {}) {
  const where = { isPublished: true };
  if (category) where.examCategory = category;

  const offset = (page - 1) * limit;
  const courses = await Course.findAll({
    where,
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
    limit,
    offset,
  });

  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);
  const lectureCountRows = await Lecture.findAll({
    attributes: ['courseId', [fn('COUNT', col('id')), 'lecturesCount']],
    where: { courseId: courseIds, isPublished: true },
    group: ['courseId'],
    raw: true,
  });
  const lecturesCountByCourseId = new Map(lectureCountRows.map((r) => [Number(r.courseId), Number(r.lecturesCount)]));

  return courses.map((c) => serializeCourse(c, { lecturesCount: lecturesCountByCourseId.get(c.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// GET /public/courses/:slug
// ---------------------------------------------------------------------------

export async function getCourseBySlug(slug) {
  // Filtering unpublished out at the query level (rather than fetching then
  // checking) means an unpublished course's existence is never distinguishable
  // from a nonexistent slug — both fall through to the same generic 404.
  const course = await Course.findOne({ where: { slug, isPublished: true } });
  if (!course) throw new ApiError(404, 'NOT_FOUND', 'Course not found.');

  const sections = await CourseSection.findAll({
    where: { courseId: course.id },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
      [{ model: Lecture, as: 'lectures' }, 'sortOrder', 'ASC'],
      [{ model: Lecture, as: 'lectures' }, 'id', 'ASC'],
    ],
    include: [
      {
        model: Lecture,
        as: 'lectures',
        where: { isPublished: true },
        required: false,
      },
    ],
  });

  let lecturesCount = 0;
  let totalDurationSeconds = 0;
  for (const section of sections) {
    for (const lecture of section.lectures || []) {
      lecturesCount += 1;
      totalDurationSeconds += lecture.durationSeconds || 0;
    }
  }

  return {
    course: serializeCourse(course, { sectionsCount: sections.length, lecturesCount, totalDurationSeconds }),
    sections: sections.map(serializeSectionWithLectures),
  };
}

// ---------------------------------------------------------------------------
// GET /public/faculty, GET /public/faqs
// ---------------------------------------------------------------------------

export async function listFaculty() {
  const rows = await Faculty.findAll({
    where: { isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return rows.map(serializeFaculty);
}

export async function listFaqs() {
  const rows = await Faq.findAll({
    where: { isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return rows.map(serializeFaq);
}

// ---------------------------------------------------------------------------
// GET /public/pages/:key
// ---------------------------------------------------------------------------

export async function getPage(key) {
  const setting = await Setting.findOne({ where: { key } });
  if (!setting) throw new ApiError(404, 'NOT_FOUND', 'Page not found.');
  const value = setting.value || {};
  return { key, title: value.title, content: value.content };
}

// ---------------------------------------------------------------------------
// POST /public/contact
// ---------------------------------------------------------------------------

/**
 * PUBLIC, anonymous-visitor-submitted content — later rendered in the admin
 * Contact Inbox, so arguably higher risk than admin-authored content since
 * it's untrusted-by-default. `name`/`subject`/`message` are all sanitized
 * plain-text-only (no formatting need for a contact message; docs/10_SECURITY_CHECKLIST.md
 * §G). `email` is left as-is: zod's `.email()` format check already rejects
 * any value containing `<`/`>` before this ever runs.
 */
export async function submitContact({ name, email, subject, message }) {
  const sanitizedName = sanitizePlainText(name);
  const sanitizedSubject = sanitizePlainText(subject);
  const sanitizedMessage = sanitizePlainText(message);

  await ContactMessage.create({
    name: sanitizedName,
    email,
    subject: sanitizedSubject || null,
    message: sanitizedMessage,
    status: 'new',
  });

  // Never let mail delivery failure fail the request — sendMail() already
  // never throws (server/src/utils/mailer.js), but the contact row is
  // created first regardless so the message is never lost even if mail is
  // misconfigured. Uses the same sanitized values as the stored row (single
  // source of truth) rather than the raw request body.
  await sendMail(
    contactMessageAdminAlertTemplate({
      adminEmail: env.ADMIN_ALERT_EMAIL,
      name: sanitizedName,
      email,
      subject: sanitizedSubject,
      message: sanitizedMessage,
    })
  );

  return {
    success: true,
    message: 'Thank you for contacting SAMS Academy. Our team will get back to you within 24 hours.',
  };
}

// ---------------------------------------------------------------------------
// GET /public/sample-questions
// ---------------------------------------------------------------------------

export async function getSampleQuestions() {
  const questions = await Question.findAll({
    where: { isActive: true },
    order: [['id', 'ASC']],
    limit: PUBLIC_SAMPLE_QUESTIONS_COUNT,
    include: [
      { model: QuestionOption, as: 'questionOptions' },
      { model: Subject, as: 'subject' },
      { model: BodySystem, as: 'system' },
    ],
  });
  return questions.map(serializeQuestionPublic);
}
