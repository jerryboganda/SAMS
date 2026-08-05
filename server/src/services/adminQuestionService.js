// server/src/services/adminQuestionService.js
// Business logic for admin QBank question management (docs/04_API_SPEC.md
// §7 "QBank"; docs/07_EXECUTION_PLAN.md Phase 11.3). Mirrors
// adminCourseService.js's shape/conventions (serializer + findOrThrow
// helpers + delete-guard pattern) — see that file's header for the
// established precedent this one follows.
//
// ---------------------------------------------------------------------------
// THE integrity constraint this file exists to protect (read before editing)
// ---------------------------------------------------------------------------
// `test_attempt_questions` (TestAttemptQuestion) stores only FKs
// (testSessionId, questionId, selectedOptionId) — NOT a content snapshot.
// Past-attempt review pages JOIN live to questions/question_options every
// time (qbankService.js#loadAttemptQuestionsForDisplay). That means:
//   - Editing a question's own scalar fields (stem/explanation/difficulty/
//     referenceText/etc.) via UPDATE is always safe, and even desired — old
//     attempts correctly show the corrected text.
//   - `test_attempt_questions.selected_option_id` has NO database foreign-key
//     constraint at all (confirmed directly against
//     db/migrations/20260101000023-create-test-attempt-questions.cjs — it
//     only FKs test_session_id and question_id, never selected_option_id).
//     If an edit deletes a question_options row that a historical attempt's
//     selected_option_id points at, that reference silently dangles — no DB
//     error, but the review UI's "you selected option X" match just fails to
//     find it. We must NEVER delete a question_options row that any
//     TestAttemptQuestion.selectedOptionId still references — see
//     reconcileOptions() below, which is the one place this is enforced.
//   - Hard-deleting a `questions` row CASCADEs (ON DELETE CASCADE, same
//     migration file) to both question_options AND test_attempt_questions —
//     this would silently destroy score history for every user who ever
//     attempted it. docs/03_DATABASE_SCHEMA.md's own rule (line 409):
//     "Deleting a question is soft (is_active=0) if it has attempts;
//     test_attempt_questions keeps history intact either way." See
//     deleteQuestionAdmin() below.
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { sanitizePlainText, sanitizeRichText } from '../utils/sanitize.js';

const { Question, QuestionOption, Subject, BodySystem, TestAttemptQuestion, sequelize } = db;

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

/**
 * Admin-facing option serializer — deliberately SEPARATE from
 * qbankService.js's serializeQuestionOption(), which conditionally OMITS
 * isCorrect pre-submission for the student-facing test runner
 * (docs/10_SECURITY_CHECKLIST.md §E: never leak is_correct pre-submit). An
 * admin question editor has no such concept — it must always see isCorrect,
 * unconditionally, to let the admin manage the answer key at all. Reusing
 * the student serializer here would be a real answer-secrecy bug in reverse
 * (silently hiding data admins are allowed to see), so a dedicated,
 * always-reveal serializer lives in this admin-only file instead.
 */
function serializeQuestionOptionAdmin(option) {
  return {
    id: option.id,
    questionId: option.questionId,
    optionText: option.optionText,
    isCorrect: !!option.isCorrect,
    sortOrder: option.sortOrder,
  };
}

/** Matches client/src/types/index.ts's `Question` interface exactly (CLAUDE.md §1a). */
function serializeQuestionAdmin(question) {
  return {
    id: question.id,
    examCategory: question.examCategory,
    subjectId: question.subjectId,
    subjectName: question.subject ? question.subject.name : undefined,
    systemId: question.systemId,
    systemName: question.system ? question.system.name : undefined,
    stem: question.stem,
    imageUrl: question.imageUrl ?? undefined,
    options: (question.questionOptions || []).map(serializeQuestionOptionAdmin),
    explanation: question.explanation,
    referenceText: question.referenceText ?? undefined,
    difficulty: question.difficulty,
    isActive: question.isActive,
    timesAttempted: question.timesAttempted,
    timesCorrect: question.timesCorrect,
  };
}

const ADMIN_QUESTION_INCLUDE = [
  { model: Subject, as: 'subject' },
  { model: BodySystem, as: 'system' },
];

/**
 * `separate: true` on the options include so it runs as its own query keyed
 * by question id(s) rather than a direct hasMany JOIN, which would multiply
 * rows one-per-option — same de-duplication reasoning as
 * qbankService.js#loadAttemptQuestionsForDisplay. `transaction` is passed
 * through explicitly: a `separate: true` include does NOT automatically
 * inherit the parent query's transaction in Sequelize, and every caller here
 * that runs inside a transaction needs this read to see its own
 * not-yet-committed writes (create/update run their fetch-back read inside
 * the same transaction that just wrote the rows).
 */
async function getQuestionAdminById(id, transaction) {
  const question = await Question.findByPk(id, {
    transaction,
    include: [
      ...ADMIN_QUESTION_INCLUDE,
      { model: QuestionOption, as: 'questionOptions', separate: true, order: [['sortOrder', 'ASC']], transaction },
    ],
  });
  if (!question) {
    throw new ApiError(404, 'NOT_FOUND', 'Question not found.');
  }
  return serializeQuestionAdmin(question);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertSubjectExists(subjectId, transaction) {
  const subject = await Subject.findByPk(subjectId, { transaction });
  if (!subject) {
    throw new ApiError(404, 'NOT_FOUND', 'Subject not found.');
  }
}

async function assertSystemExists(systemId, transaction) {
  const system = await BodySystem.findByPk(systemId, { transaction });
  if (!system) {
    throw new ApiError(404, 'NOT_FOUND', 'System not found.');
  }
}

/** Shared >=2 options / exactly-1-correct rule — applied identically on create and on any update that touches options. */
function assertOptionSetValid(options) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'A question must have at least 2 options.');
  }
  const correctCount = options.filter((o) => !!o.isCorrect).length;
  if (correctCount !== 1) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Exactly one option must be marked as the correct answer.');
  }
}

/**
 * Reconciles an admin's submitted `options[]` against the question's
 * EXISTING question_options rows — the one function in this file that
 * enforces the integrity constraint documented at the top of this file.
 *
 * Matching rule (per task brief, coordinating defensively with the
 * frontend editor's real-id-preserving payload): an incoming option is
 * treated as "this is an existing row, UPDATE it" only if its `id` is a
 * positive number matching a question_options row that actually belongs to
 * THIS question. Anything else — missing `id`, `id: null`, `id: 0`, or an id
 * that doesn't resolve among this question's own existing option ids — is
 * treated as "this is new, INSERT it". This never trusts a client-supplied
 * `id` against ANY question, only this one's own existing rows (a stray id
 * belonging to a different question's option is silently treated as new
 * rather than accidentally reassigning that other question's row).
 *
 * Order of operations, deliberately: (1) validate the shape of the
 * resulting option set (>=2 options, exactly 1 correct) BEFORE touching the
 * database at all — a malformed payload should never partially apply; (2)
 * THEN check the delete-safety guard for every existing row the admin
 * removed — if ANY of them has attempt history, the WHOLE update is
 * rejected with 409 `OPTION_IN_USE` before any write happens (mirrors
 * adminCourseService.js's assertCourseDeletable/assertLectureDeletable
 * "guard the delete, don't silently partial-apply" idiom); (3) only once
 * both checks pass are the actual UPDATE/INSERT/DELETE statements run.
 */
async function reconcileOptions(questionId, incomingOptions, transaction) {
  if (!Array.isArray(incomingOptions)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'options must be an array.');
  }

  const existingOptions = await QuestionOption.findAll({ where: { questionId }, transaction });
  const existingById = new Map(existingOptions.map((o) => [o.id, o]));

  const matched = []; // [{ existing, incoming }]
  const toInsert = [];
  const matchedIds = new Set();

  for (const incoming of incomingOptions) {
    const rawId = incoming?.id;
    const numericId = rawId === null || rawId === undefined ? 0 : Number(rawId);
    const isRealExistingId = Number.isFinite(numericId) && numericId > 0 && existingById.has(numericId);
    if (isRealExistingId) {
      matched.push({ existing: existingById.get(numericId), incoming });
      matchedIds.add(numericId);
    } else {
      toInsert.push(incoming);
    }
  }

  const toDelete = existingOptions.filter((o) => !matchedIds.has(o.id));

  // 1. Validate the resulting set BEFORE any write.
  const finalView = [...matched.map(({ incoming }) => incoming), ...toInsert];
  assertOptionSetValid(finalView);

  // 2. Delete-safety guard — reject the WHOLE update if any removed option
  // has real attempt history, before any write happens.
  for (const row of toDelete) {
    const usedCount = await TestAttemptQuestion.count({ where: { selectedOptionId: row.id }, transaction });
    if (usedCount > 0) {
      throw new ApiError(
        409,
        'OPTION_IN_USE',
        `Cannot remove option "${row.optionText}" — it has been selected in ${usedCount} past attempt(s). Historical accuracy would be corrupted.`
      );
    }
  }

  // 3. Apply. `optionText` is sanitized plain-text-only (docs/10_SECURITY_CHECKLIST.md
  // §G) — an option is a short answer choice, never formatted rich text.
  for (const { existing, incoming } of matched) {
    await existing.update(
      {
        optionText: sanitizePlainText(incoming.optionText),
        isCorrect: !!incoming.isCorrect,
        sortOrder: incoming.sortOrder ?? existing.sortOrder,
      },
      { transaction }
    );
  }

  if (toInsert.length > 0) {
    await QuestionOption.bulkCreate(
      toInsert.map((o, idx) => ({
        questionId,
        optionText: sanitizePlainText(o.optionText),
        isCorrect: !!o.isCorrect,
        sortOrder: o.sortOrder ?? existingOptions.length + idx,
      })),
      { transaction }
    );
  }

  if (toDelete.length > 0) {
    await QuestionOption.destroy({ where: { id: toDelete.map((o) => o.id) }, transaction });
  }
}

// ---------------------------------------------------------------------------
// GET /admin/questions
// ---------------------------------------------------------------------------

/**
 * Flat array, zero params (same precedent as every other Phase 11 admin list
 * endpoint — client/src/api/endpoints/admin.ts's getQuestions() calls
 * `/admin/questions` with no query args). Capped at 1000 — the seed bank is
 * 200 rows today but could grow; this is a simple sanity ceiling, not a real
 * pagination story (no admin UI paging control exists for this table).
 */
export async function listQuestionsAdmin() {
  const questions = await Question.findAll({
    limit: 1000,
    order: [['id', 'DESC']],
    include: [
      ...ADMIN_QUESTION_INCLUDE,
      { model: QuestionOption, as: 'questionOptions', separate: true, order: [['sortOrder', 'ASC']] },
    ],
  });
  return questions.map(serializeQuestionAdmin);
}

// ---------------------------------------------------------------------------
// POST /admin/questions
// ---------------------------------------------------------------------------

export async function createQuestionAdmin(data) {
  return sequelize.transaction(async (transaction) => {
    await assertSubjectExists(data.subjectId, transaction);
    await assertSystemExists(data.systemId, transaction);
    assertOptionSetValid(data.options);

    const question = await Question.create(
      {
        examCategory: data.examCategory,
        subjectId: data.subjectId,
        systemId: data.systemId,
        // `stem` and `referenceText` are plain-text-only (a question stem is
        // never formatted rich text — see docs/10_SECURITY_CHECKLIST.md §G);
        // `explanation` is longer-form admin-authored prose that may
        // reasonably want basic formatting (bold/lists), so it gets the
        // rich-text whitelist instead.
        stem: sanitizePlainText(data.stem),
        imageUrl: data.imageUrl ?? null,
        explanation: sanitizeRichText(data.explanation),
        referenceText: sanitizePlainText(data.referenceText) ?? null,
        difficulty: data.difficulty ?? 'medium',
        isActive: data.isActive ?? true,
      },
      { transaction }
    );

    await QuestionOption.bulkCreate(
      data.options.map((o, idx) => ({
        questionId: question.id,
        // Plain-text-only — an answer option is never formatted rich text.
        optionText: sanitizePlainText(o.optionText),
        isCorrect: !!o.isCorrect,
        sortOrder: o.sortOrder ?? idx,
      })),
      { transaction }
    );

    return getQuestionAdminById(question.id, transaction);
  });
}

// ---------------------------------------------------------------------------
// PATCH /admin/questions/:id
// ---------------------------------------------------------------------------

/**
 * Partial-update semantics for the question's own scalar fields (only
 * touches fields present in the request body — mirrors
 * adminCourseService.js#updateLecture's field-by-field conditional-
 * assignment style). `options`, if present in the body, is reconciled via
 * reconcileOptions() above; if omitted entirely, the question's options are
 * left completely untouched (a scalar-only edit, e.g. just fixing a typo in
 * the stem, never risks the option set).
 */
export async function updateQuestionAdmin(id, data) {
  return sequelize.transaction(async (transaction) => {
    const question = await Question.findByPk(id, { transaction });
    if (!question) {
      throw new ApiError(404, 'NOT_FOUND', 'Question not found.');
    }

    if (data.subjectId !== undefined) await assertSubjectExists(data.subjectId, transaction);
    if (data.systemId !== undefined) await assertSystemExists(data.systemId, transaction);

    const patch = {};
    if (data.examCategory !== undefined) patch.examCategory = data.examCategory;
    if (data.subjectId !== undefined) patch.subjectId = data.subjectId;
    if (data.systemId !== undefined) patch.systemId = data.systemId;
    if (data.stem !== undefined) patch.stem = sanitizePlainText(data.stem);
    if (data.imageUrl !== undefined) patch.imageUrl = data.imageUrl;
    if (data.explanation !== undefined) patch.explanation = sanitizeRichText(data.explanation);
    if (data.referenceText !== undefined) patch.referenceText = sanitizePlainText(data.referenceText);
    if (data.difficulty !== undefined) patch.difficulty = data.difficulty;
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    if (Object.keys(patch).length > 0) {
      await question.update(patch, { transaction });
    }

    if (data.options !== undefined) {
      await reconcileOptions(id, data.options, transaction);
    }

    return getQuestionAdminById(id, transaction);
  });
}

// ---------------------------------------------------------------------------
// DELETE /admin/questions/:id
// ---------------------------------------------------------------------------

/**
 * Judgment call, per task brief — implemented exactly as specified: a
 * question with zero recorded attempts is hard-deleted (its options cascade
 * automatically, nothing is lost); a question with any attempt history is
 * soft-deleted (`isActive:false`) instead, preserving
 * test_attempt_questions/score history intact
 * (docs/03_DATABASE_SCHEMA.md line 409). Returns `{success:true,
 * softDeleted}` so a future UI could distinguish the two outcomes — the
 * current frontend's delete-confirmation modal already calls DELETE for
 * both cases and shows the same success toast either way, so this
 * reinterpretation needs no frontend change.
 */
export async function deleteQuestionAdmin(id) {
  const question = await Question.findByPk(id);
  if (!question) {
    throw new ApiError(404, 'NOT_FOUND', 'Question not found.');
  }

  const attemptCount = await TestAttemptQuestion.count({ where: { questionId: id } });
  if (attemptCount === 0) {
    await Question.destroy({ where: { id } });
    return { success: true, softDeleted: false };
  }

  await question.update({ isActive: false });
  return { success: true, softDeleted: true };
}

// ---------------------------------------------------------------------------
// POST /admin/questions/:id/toggle-active
// ---------------------------------------------------------------------------

export async function toggleQuestionActive(id) {
  const question = await Question.findByPk(id);
  if (!question) {
    throw new ApiError(404, 'NOT_FOUND', 'Question not found.');
  }
  await question.update({ isActive: !question.isActive });
  return getQuestionAdminById(id);
}

export default {
  listQuestionsAdmin,
  createQuestionAdmin,
  updateQuestionAdmin,
  deleteQuestionAdmin,
  toggleQuestionActive,
};
