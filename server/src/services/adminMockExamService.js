// server/src/services/adminMockExamService.js
// Business logic for admin mock-exam management (docs/04_API_SPEC.md §7
// "Mock exams — CRUD /admin/mock-exams; PUT /admin/mock-exams/:id/questions
// {questionIds ordered}; /publish"; docs/07_EXECUTION_PLAN.md Phase 8.3).
// Mirrors adminCourseService.js's shape/conventions exactly (serializer +
// findOrThrow helpers + delete-guard + publish/unpublish precedent) — see
// that file for the pattern this one follows.
import { Op, col, fn } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';

const { MockExam, MockExamQuestion, Question, TestSession, sequelize } = db;

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeMockExamAdmin(mockExam, extra = {}) {
  return {
    id: mockExam.id,
    title: mockExam.title,
    examCategory: mockExam.examCategory,
    durationMinutes: mockExam.durationMinutes,
    passPercent: Number(mockExam.passPercent),
    isPublished: mockExam.isPublished,
    questionsCount: extra.questionsCount ?? 0,
    // Only populated by getMockExamById (the single-resource GET) — the
    // list endpoint's admin table (client/src/pages/admin/
    // MockExamsManagementPage.tsx) only ever renders `questionsCount`, so
    // computing the full ordered id list for every row in a list response
    // would be wasted work. `undefined` here (not `[]`) so JSON.stringify
    // drops the key entirely on list rows instead of implying "zero
    // questions configured".
    questionIds: extra.questionIds ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findMockExamOrThrow(id) {
  const mockExam = await MockExam.findByPk(id);
  if (!mockExam) throw new ApiError(404, 'NOT_FOUND', 'Mock exam not found.');
  return mockExam;
}

async function questionIdsForExam(mockExamId) {
  const rows = await MockExamQuestion.findAll({
    where: { mockExamId },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
    attributes: ['questionId'],
  });
  return rows.map((r) => r.questionId);
}

/**
 * A mock exam with real student-facing attempt history (ANY test_sessions
 * row referencing it — completed, abandoned, OR still in_progress) must
 * never be hard-deleted. Unlike courses (`fk_o_course` has no ON DELETE
 * clause -> RESTRICT), `test_sessions.mock_exam_id`'s FK is `ON DELETE SET
 * NULL` (docs/03_DATABASE_SCHEMA.md) — an unguarded delete would NOT even
 * fail at the DB level, it would silently null out `mockExamId` on every
 * real historical attempt row, permanently severing "this completed session
 * was this mock paper" traceability with zero error surfaced anywhere. This
 * app-level guard exists specifically because the DB itself provides no
 * natural safety net here (mirrors assertCourseDeletable's precedent in
 * adminCourseService.js, same 409 CONFLICT shape, different underlying
 * reason). A fresh paper with zero attempts is always safely hard-deletable
 * (mock_exam_questions cascade-deletes automatically via its own FK). See
 * DECISIONS.md.
 */
async function assertMockExamDeletable(mockExamId) {
  const sessionCount = await TestSession.count({ where: { mockExamId } });
  if (sessionCount > 0) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Cannot delete a mock exam that has recorded student attempts — unpublish it instead.'
    );
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listMockExams({ q, status } = {}) {
  const where = {};
  if (status === 'published') where.isPublished = true;
  if (status === 'draft') where.isPublished = false;
  if (q) where.title = { [Op.like]: `%${q}%` };

  const mockExams = await MockExam.findAll({
    where,
    order: [['id', 'DESC']],
  });
  if (mockExams.length === 0) return [];

  const ids = mockExams.map((m) => m.id);
  const counts = await MockExamQuestion.findAll({
    where: { mockExamId: ids },
    attributes: ['mockExamId', [fn('COUNT', col('id')), 'cnt']],
    group: ['mockExamId'],
    raw: true,
  });
  const countByExam = new Map(counts.map((r) => [r.mockExamId, Number(r.cnt)]));

  return mockExams.map((m) => serializeMockExamAdmin(m, { questionsCount: countByExam.get(m.id) || 0 }));
}

export async function getMockExamById(id) {
  const mockExam = await findMockExamOrThrow(id);
  const questionIds = await questionIdsForExam(id);
  return serializeMockExamAdmin(mockExam, { questionsCount: questionIds.length, questionIds });
}

export async function createMockExam(data) {
  const mockExam = await MockExam.create({
    title: data.title,
    examCategory: data.examCategory,
    durationMinutes: data.durationMinutes,
    passPercent: data.passPercent ?? 60,
    isPublished: data.isPublished ?? false,
  });
  return serializeMockExamAdmin(mockExam, { questionsCount: 0, questionIds: [] });
}

export async function updateMockExam(id, data) {
  const mockExam = await findMockExamOrThrow(id);
  const patch = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.examCategory !== undefined) patch.examCategory = data.examCategory;
  if (data.durationMinutes !== undefined) patch.durationMinutes = data.durationMinutes;
  if (data.passPercent !== undefined) patch.passPercent = data.passPercent;
  if (data.isPublished !== undefined) patch.isPublished = data.isPublished;
  await mockExam.update(patch);
  return getMockExamById(id);
}

export async function deleteMockExam(id) {
  await findMockExamOrThrow(id);
  await assertMockExamDeletable(id);
  await MockExam.destroy({ where: { id } });
}

export async function setMockExamPublished(id, isPublished) {
  const mockExam = await findMockExamOrThrow(id);
  await mockExam.update({ isPublished });
  return getMockExamById(id);
}

// ---------------------------------------------------------------------------
// PUT /admin/mock-exams/:id/questions
// ---------------------------------------------------------------------------

/**
 * Replaces a mock exam's ENTIRE question set with `questionIds`, in the
 * given order (`sort_order` = 0-based array index — same "index IS the new
 * order" convention as reorderSections/reorderLectures in
 * adminCourseService.js, not the 1-based convention testSessionFactory.js
 * uses for test_attempt_questions — the two tables/purposes are unrelated,
 * so there's no expectation they share a numbering base).
 *
 * Every id must resolve to a REAL, ACTIVE question — any unknown OR
 * inactive id rejects the WHOLE request with 422 VALIDATION_ERROR (details:
 * `{missingIds, inactiveIds}`), never silently dropped/skipped (this
 * phase's explicit brief: "reject unknown/inactive ids, don't silently
 * skip them" — a silently-shorter paper than what the admin configured in
 * the builder UI would be a much worse failure mode than a clear error).
 * Duplicate ids are rejected at the zod layer (adminMockExamController.js)
 * before this function ever runs — `mock_exam_questions` has a real unique
 * `(mock_exam_id, question_id)` index, so a duplicate would otherwise 500
 * on a raw constraint violation instead of a clean 422.
 *
 * Transactional: DELETE all existing mock_exam_questions rows for this exam
 * then bulk-INSERT the new set, both in one transaction — a mid-replace
 * failure never leaves the paper with neither its old nor its new question
 * set.
 */
export async function replaceMockExamQuestions(mockExamId, questionIds) {
  await findMockExamOrThrow(mockExamId);

  const questions = await Question.findAll({ where: { id: questionIds }, attributes: ['id', 'isActive'] });
  const foundById = new Map(questions.map((q) => [q.id, q]));
  const missingIds = questionIds.filter((id) => !foundById.has(id));
  const inactiveIds = questionIds.filter((id) => foundById.has(id) && !foundById.get(id).isActive);

  if (missingIds.length > 0 || inactiveIds.length > 0) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      'One or more questionIds are unknown or inactive — every question in a mock exam paper must be a real, active question.',
      { missingIds, inactiveIds }
    );
  }

  await sequelize.transaction(async (transaction) => {
    await MockExamQuestion.destroy({ where: { mockExamId }, transaction });
    await MockExamQuestion.bulkCreate(
      questionIds.map((questionId, index) => ({ mockExamId, questionId, sortOrder: index })),
      { transaction }
    );
  });

  return getMockExamById(mockExamId);
}

export default {
  listMockExams,
  getMockExamById,
  createMockExam,
  updateMockExam,
  deleteMockExam,
  setMockExamPublished,
  replaceMockExamQuestions,
};
