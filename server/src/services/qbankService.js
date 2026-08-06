// server/src/services/qbankService.js
// Business logic for the whole QBank engine (docs/04_API_SPEC.md §4,
// docs/02_ARCHITECTURE.md §5, docs/07_EXECUTION_PLAN.md 7.1-7.4). Mounted at
// the TOP-LEVEL `/api/v1/qbank/*` (NOT `/api/v1/student/qbank/*`) — confirmed
// against both the API spec's own path column (§4's rows have no `/student`
// prefix, unlike §3's) AND the already-built frontend's real call sites
// (`client/src/api/endpoints/qbank.ts`'s `apiFetch("/qbank/meta")` etc.,
// which resolve to `${CONFIG.API_BASE_URL}/qbank/...` = `/api/v1/qbank/...`
// since `CONFIG.API_BASE_URL === "/api/v1"`) — see routes/v1/qbank.js and
// DECISIONS.md.
//
// Every judgment call named in this phase's task brief is documented inline
// at its decision point AND summarized in DECISIONS.md's dated Phase 7.1-7.4
// entry. Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
import { Op, col, fn } from 'sequelize';
import { ApiError } from '../utils/apiError.js';
import db from '../models/index.js';
import { createSessionWithAttemptQuestions } from './testSessionFactory.js';

const {
  Question,
  QuestionOption,
  Subject,
  BodySystem,
  TestSession,
  TestAttemptQuestion,
  QuestionBookmark,
  UserQuestionHistory,
  UserDailyStat,
  Enrollment,
  Course,
  MockExam,
  sequelize,
} = db;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function todayUtcDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The user's accessible exam categories: distinct `courses.exam_category` for
 * every course the user holds a currently-active, non-expired enrollment in
 * AND `courses.includes_qbank = true` (docs/04_API_SPEC.md §4 "from
 * enrollments with includes_qbank") — deliberately NOT "any enrollment,
 * qbank-included-or-not" (a video-only course grants zero QBank access) and
 * NOT "ever enrolled" (an expired/revoked enrollment grants none either,
 * mirroring services/videoService.js#assertEnrolled's active-and-unexpired
 * gate). One query (JOIN, not N+1 per enrollment).
 *
 * Exported (Phase 13.3 dedup pass) so services/mockExamService.js can import
 * this ONE definition instead of maintaining its own byte-for-byte copy —
 * see that file's header comment for the history (it was originally
 * re-derived there because this file was another in-flight task's
 * read-only-locked territory at the time; that lock has long since lifted).
 */
export async function getAccessibleExamCategories(userId) {
  const now = new Date();
  const enrollments = await Enrollment.findAll({
    where: { userId, status: 'active', expiresAt: { [Op.gt]: now } },
    include: [{ model: Course, as: 'course', attributes: ['examCategory'], where: { includesQbank: true }, required: true }],
  });
  return [...new Set(enrollments.map((e) => e.course.examCategory))];
}

/** Loads every test_attempt_questions row for a session, no joins — for scoring/finalize (never needs Question data). */
async function loadAttemptQuestions(testSessionId) {
  return TestAttemptQuestion.findAll({ where: { testSessionId }, order: [['sortOrder', 'ASC']] });
}

/**
 * Loads every test_attempt_questions row WITH its full Question (+
 * subject/system names + options) for display (GET session, create-test
 * response, submit response, review). `questionOptions` is loaded via a
 * SEPARATE query (`separate: true`) keyed by the parent questions' ids rather
 * than one big multi-way JOIN — a hasMany joined directly into the main query
 * would multiply the attempt-question rows (one row per option) and require
 * de-duplication; `separate: true` keeps this at exactly 2 queries total
 * regardless of question_count (attempt+question+subject+system in one JOIN,
 * then all options for all those questions in one more), not 2*N.
 */
async function loadAttemptQuestionsForDisplay(testSessionId) {
  return TestAttemptQuestion.findAll({
    where: { testSessionId },
    order: [['sortOrder', 'ASC']],
    include: [
      {
        model: Question,
        as: 'question',
        include: [
          { model: Subject, as: 'subject' },
          { model: BodySystem, as: 'system' },
          { model: QuestionOption, as: 'questionOptions', separate: true, order: [['sortOrder', 'ASC']] },
        ],
      },
    ],
  });
}

/** IDOR-safe lookup: a session must belong to the requesting user, scoped by {id, userId} together (never a separate existence-then-ownership check). 404 either way — see DECISIONS.md (same convention as videoService.js's heartbeat lookup). */
async function loadOwnedSession(userId, testSessionId) {
  const session = await TestSession.findOne({ where: { id: testSessionId, userId } });
  if (!session) {
    throw new ApiError(404, 'NOT_FOUND', 'Test session not found.');
  }
  return session;
}

// ---------------------------------------------------------------------------
// Scoring + finalize (shared by manual submit, lazy auto-submit-on-expiry,
// and abandon) — docs/07_EXECUTION_PLAN.md 7.3 "extract it into a shared
// function, don't duplicate the scoring logic".
// ---------------------------------------------------------------------------

/**
 * Pure computation, no DB writes. `skipped` = no `selected_option_id`
 * (docs/04_API_SPEC.md 7.3 "skipped = no selected_option_id, tracked as its
 * own bucket, not folded into incorrect") — regardless of whether the
 * question was ever visited (`answered_at`); a question the user opened but
 * explicitly cleared is scored identically to one never opened at all.
 */
function scoreAttemptQuestions(attemptQuestions, questionCount) {
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  for (const aq of attemptQuestions) {
    if (aq.selectedOptionId == null) {
      skippedCount += 1;
    } else if (aq.isCorrect) {
      correctCount += 1;
    } else {
      incorrectCount += 1;
    }
  }
  const denominator = questionCount > 0 ? questionCount : attemptQuestions.length;
  const scorePercent = denominator > 0 ? Math.round((correctCount / denominator) * 10000) / 100 : 0;
  return { correctCount, incorrectCount, skippedCount, scorePercent };
}

/** Upserts one user_question_history row: `times_seen+=1`, `times_correct+=1` iff correct, `last_result`, `last_seen_at=now`. */
async function upsertQuestionHistory(userId, questionId, lastResult, transaction) {
  const [row] = await UserQuestionHistory.findOrCreate({
    where: { userId, questionId },
    defaults: { timesSeen: 0, timesCorrect: 0 },
    transaction,
  });
  row.timesSeen += 1;
  if (lastResult === 'correct') row.timesCorrect += 1;
  row.lastResult = lastResult;
  row.lastSeenAt = new Date();
  await row.save({ transaction });
}

function lastResultFor(attemptQuestion) {
  if (attemptQuestion.selectedOptionId == null) return 'skipped';
  return attemptQuestion.isCorrect ? 'correct' : 'incorrect';
}

async function bumpDailyStat(userId, { questionsAttempted = 0, questionsCorrect = 0, qbankSeconds = 0 }, transaction) {
  const statDate = todayUtcDateOnly();
  const [row] = await UserDailyStat.findOrCreate({
    where: { userId, statDate },
    defaults: { questionsAttempted: 0, questionsCorrect: 0, qbankSeconds: 0, videoSeconds: 0 },
    transaction,
  });
  row.questionsAttempted += questionsAttempted;
  row.questionsCorrect += questionsCorrect;
  row.qbankSeconds += qbankSeconds;
  await row.save({ transaction });
}

/**
 * Real completion path — used for BOTH a manual POST /submit AND the lazy
 * auto-submit-on-expiry check (same function, per this phase's explicit "one
 * shared function" requirement). Updates test_sessions to `completed`,
 * upserts user_question_history for EVERY attempted question INCLUDING
 * skipped ones (`last_result='skipped'` — so a never-answered question stops
 * counting as "unused" forever once a test that included it is submitted),
 * and bumps today's (UTC) user_daily_stats.
 *
 * `passed`: only computed for `mode==='mock'` AND a linked `mock_exam_id`
 * (compares `scorePercent >= mockExams.pass_percent`); null for
 * practice/exam, AND for a `mode==='mock'` session with no linked mock exam
 * (this generic create-test endpoint never sets `mockExamId` — only the
 * Phase-8 `/mock-exams/:id/start` flow will). See DECISIONS.md.
 *
 * `questionsAttempted` credited to user_daily_stats = the ANSWERED count
 * (`selected_option_id IS NOT NULL`), not the full question_count — skipped
 * questions were shown but never actually attempted. See DECISIONS.md.
 */
async function finalizeCompleted(session, attemptQuestions) {
  return sequelize.transaction(async (transaction) => {
    const { correctCount, incorrectCount, skippedCount, scorePercent } = scoreAttemptQuestions(
      attemptQuestions,
      session.questionCount
    );

    let passed = null;
    if (session.mode === 'mock' && session.mockExamId) {
      const mockExam = await MockExam.findByPk(session.mockExamId, { transaction });
      if (mockExam) passed = scorePercent >= Number(mockExam.passPercent);
    }

    await session.update(
      { status: 'completed', completedAt: new Date(), correctCount, incorrectCount, skippedCount, scorePercent, passed },
      { transaction }
    );

    for (const aq of attemptQuestions) {
      await upsertQuestionHistory(session.userId, aq.questionId, lastResultFor(aq), transaction);
    }

    const answeredCount = attemptQuestions.filter((aq) => aq.selectedOptionId != null).length;
    const totalTimeSpentSeconds = attemptQuestions.reduce((sum, aq) => sum + (aq.timeSpentSeconds || 0), 0);
    await bumpDailyStat(
      session.userId,
      { questionsAttempted: answeredCount, questionsCorrect: correctCount, qbankSeconds: totalTimeSpentSeconds },
      transaction
    );

    return session;
  });
}

/**
 * Abandon path — distinct from finalizeCompleted in two ways (per this
 * phase's explicit "document this distinction from submit's behavior"):
 *   1. user_question_history is upserted ONLY for questions the user actually
 *      interacted with (`answered_at IS NOT NULL`), not every question in the
 *      test — an abandoned test's untouched questions were never engaged
 *      with, so they must NOT count as "seen" (they'd otherwise wrongly stop
 *      appearing in the "unused" pool forever despite the user never having
 *      looked at them).
 *   2. user_daily_stats is NOT touched at all — the task's daily-stat bullet
 *      is scoped to the submit endpoint only; an abandoned session is not a
 *      completed study session.
 * `passed` is always null (abandon is never a real pass/fail outcome, even
 * for `mode==='mock'`). `correct_count`/`incorrect_count`/`skipped_count`/
 * `score_percent` ARE still computed (same scoring helper as submit) even
 * though the task brief doesn't explicitly ask for it here — the already-
 * built review/results UI (client/src/pages/student/TestReviewPage.tsx's
 * per-tab counts, TestResultPage.tsx's score header) reads these fields
 * unconditionally off the session regardless of status, so leaving them at
 * their all-zero defaults for an abandoned-but-partially-answered test would
 * make its review page render an obviously-wrong "0% score" summary. See
 * DECISIONS.md.
 */
async function finalizeAbandoned(session, attemptQuestions) {
  return sequelize.transaction(async (transaction) => {
    const { correctCount, incorrectCount, skippedCount, scorePercent } = scoreAttemptQuestions(
      attemptQuestions,
      session.questionCount
    );

    await session.update(
      { status: 'abandoned', completedAt: new Date(), correctCount, incorrectCount, skippedCount, scorePercent, passed: null },
      { transaction }
    );

    const answered = attemptQuestions.filter((aq) => aq.answeredAt != null);
    for (const aq of answered) {
      await upsertQuestionHistory(session.userId, aq.questionId, lastResultFor(aq), transaction);
    }

    return session;
  });
}

/**
 * Lazy, on-access expiry enforcement (docs/07_EXECUTION_PLAN.md 7.3 — no cron
 * in this phase's scope). Called at the top of every runner entry point
 * (GET session, PATCH answer, POST submit, POST abandon — NOT the review
 * endpoint, which only ever reads an already-terminal session and 403s
 * otherwise, see getTestReview). A no-op for untimed sessions, already-
 * terminal sessions, or a timed session whose deadline hasn't passed yet.
 * Otherwise runs the exact same finalizeCompleted() a real submit would.
 */
async function autoFinalizeIfExpired(session) {
  if (session.status !== 'in_progress' || !session.timeLimitSeconds) return session;
  const deadlineMs = new Date(session.startedAt).getTime() + session.timeLimitSeconds * 1000;
  if (Date.now() < deadlineMs) return session;
  const attemptQuestions = await loadAttemptQuestions(session.id);
  return finalizeCompleted(session, attemptQuestions);
}

/**
 * Server-authoritative remaining time — never trusts a client-supplied
 * value. null for untimed sessions; 0 once the session is no longer
 * in_progress. Exported (Phase 13.3 dedup pass) for services/mockExamService.js
 * to reuse instead of maintaining its own copy — see this file's
 * getAccessibleExamCategories doc comment above for the same history.
 */
export function computeRemainingSeconds(session) {
  if (!session.timeLimitSeconds) return null;
  if (session.status !== 'in_progress') return 0;
  const deadlineMs = new Date(session.startedAt).getTime() + session.timeLimitSeconds * 1000;
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------
// Answer-secrecy + serialization (docs/10_SECURITY_CHECKLIST.md §E — the
// single most security-critical piece of this phase)
// ---------------------------------------------------------------------------

/**
 * exam/mock mode: `is_correct`/`explanation` are NEVER included on ANY
 * question — answered or not — while the session is still `in_progress`
 * (docs/04_API_SPEC.md §4's literal wording only names "completed", but
 * `abandoned` is just as terminal/un-continuable — PATCH /answer rejects any
 * non-`in_progress` session, so there is no path back to "still gameable"
 * once abandoned — and the dedicated review endpoint explicitly unlocks on
 * EITHER `completed` OR `abandoned`; gating this endpoint's secrecy
 * differently from review's would be an indefensible inconsistency. See
 * DECISIONS.md).
 *
 * practice mode: included ONLY for a question that already has
 * `answered_at` set — still hidden for not-yet-answered practice questions,
 * regardless of session status.
 */
function computeIncludeAnswers(session, attemptQuestion) {
  if (session.status !== 'in_progress') return true;
  if (session.mode === 'practice') return attemptQuestion.answeredAt != null;
  return false;
}

function serializeQuestionOption(option, includeAnswers) {
  const out = {
    id: option.id,
    questionId: option.questionId,
    optionText: option.optionText,
    sortOrder: option.sortOrder,
  };
  // Deliberately omitted (not `null`) when secret — JSON.stringify (via
  // res.json) drops an `undefined`-valued key entirely, so a recursive
  // "no isCorrect key anywhere in the body" leak-scan (this phase's own
  // acceptance test) finds nothing rather than an explicit `null`.
  out.isCorrect = includeAnswers ? !!option.isCorrect : undefined;
  return out;
}

function serializeQuestion(question, includeAnswers, bookmarkedQuestionIds) {
  const out = {
    id: question.id,
    examCategory: question.examCategory,
    subjectId: question.subjectId,
    subjectName: question.subject ? question.subject.name : undefined,
    systemId: question.systemId,
    systemName: question.system ? question.system.name : undefined,
    stem: question.stem,
    imageUrl: question.imageUrl ?? undefined,
    options: (question.questionOptions || []).map((o) => serializeQuestionOption(o, includeAnswers)),
    difficulty: question.difficulty,
    isActive: question.isActive,
    isBookmarked: bookmarkedQuestionIds ? bookmarkedQuestionIds.has(question.id) : undefined,
  };
  // reference_text is treated with the same secrecy as explanation (not
  // explicitly named by docs/04_API_SPEC.md's "is_correct and explanation"
  // wording, but it is equally answer-revealing content per the review
  // endpoint's own payload description — "explanation, reference_text" listed
  // side by side as the post-completion reveal). See DECISIONS.md.
  out.explanation = includeAnswers ? question.explanation : undefined;
  out.referenceText = includeAnswers ? question.referenceText ?? undefined : undefined;
  return out;
}

function serializeAttemptQuestion(session, attemptQuestion, bookmarkedQuestionIds) {
  const includeAnswers = computeIncludeAnswers(session, attemptQuestion);
  const out = {
    id: attemptQuestion.id,
    testSessionId: attemptQuestion.testSessionId,
    questionId: attemptQuestion.questionId,
    sortOrder: attemptQuestion.sortOrder,
    question: serializeQuestion(attemptQuestion.question, includeAnswers, bookmarkedQuestionIds),
    selectedOptionId: attemptQuestion.selectedOptionId ?? undefined,
    isFlagged: !!attemptQuestion.isFlagged,
    timeSpentSeconds: attemptQuestion.timeSpentSeconds,
  };
  // A skipped question has is_correct=NULL in the DB (no verdict exists) —
  // omit the key rather than emit `isCorrect: null`, same undefined-drop
  // reasoning as serializeQuestionOption above.
  out.isCorrect = includeAnswers && attemptQuestion.isCorrect != null ? !!attemptQuestion.isCorrect : undefined;
  return out;
}

function serializeTestSession(session, attemptQuestions, bookmarkedQuestionIds) {
  return {
    id: session.id,
    userId: session.userId,
    mode: session.mode,
    mockExamId: session.mockExamId ?? undefined,
    examCategory: session.examCategory,
    filters: session.filters ?? undefined,
    questionCount: session.questionCount,
    timeLimitSeconds: session.timeLimitSeconds ?? undefined,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? undefined,
    correctCount: session.correctCount,
    incorrectCount: session.incorrectCount,
    skippedCount: session.skippedCount,
    scorePercent: session.scorePercent != null ? Number(session.scorePercent) : undefined,
    passed: session.passed ?? undefined,
    questions: attemptQuestions.map((aq) => serializeAttemptQuestion(session, aq, bookmarkedQuestionIds)),
    timeRemainingSeconds: computeRemainingSeconds(session) ?? undefined,
  };
}

/** Light session-only serializer for GET /qbank/tests (history list) — no `.questions` (list rows never need the full per-question payload; TestSession.questions is optional in the frontend's own type). */
function serializeTestSessionSummary(session) {
  return {
    id: session.id,
    userId: session.userId,
    mode: session.mode,
    mockExamId: session.mockExamId ?? undefined,
    examCategory: session.examCategory,
    filters: session.filters ?? undefined,
    questionCount: session.questionCount,
    timeLimitSeconds: session.timeLimitSeconds ?? undefined,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? undefined,
    correctCount: session.correctCount,
    incorrectCount: session.incorrectCount,
    skippedCount: session.skippedCount,
    scorePercent: session.scorePercent != null ? Number(session.scorePercent) : undefined,
    passed: session.passed ?? undefined,
    timeRemainingSeconds: computeRemainingSeconds(session) ?? undefined,
  };
}

async function buildSessionResponse(userId, testSessionId, preloadedSession) {
  const session = preloadedSession ?? (await loadOwnedSession(userId, testSessionId));
  const attemptQuestions = await loadAttemptQuestionsForDisplay(session.id);
  const questionIds = attemptQuestions.map((aq) => aq.questionId);
  const bookmarkRows = questionIds.length
    ? await QuestionBookmark.findAll({ where: { userId, questionId: questionIds }, attributes: ['questionId'], raw: true })
    : [];
  const bookmarkedQuestionIds = new Set(bookmarkRows.map((b) => b.questionId));
  return serializeTestSession(session, attemptQuestions, bookmarkedQuestionIds);
}

// ---------------------------------------------------------------------------
// GET /qbank/meta
// ---------------------------------------------------------------------------

function serializeTaxonomyRow(row, countsMap) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    questionsCount: countsMap.get(row.id) || 0,
  };
}

/**
 * Taxonomy scope: returns ALL subjects/systems rows (the global taxonomy is
 * tiny per docs/03_DATABASE_SCHEMA.md's seed data — ~9 subjects, ~10 systems)
 * rather than only ones with a matching question in scope — a filter UI is
 * more useful showing every subject with an honest `questionsCount: 0` (so
 * the student knows it exists but has nothing filterable right now) than
 * silently hiding it. See DECISIONS.md.
 *
 * Query budget: enrollments+course JOIN (1) + subjects (1) + systems (1) +
 * ONE grouped aggregate over questions (examCategory x subjectId x systemId,
 * scoped to accessible categories + is_active) (1) + 3 scoped pool-count
 * aggregates (unused derived from the "seen" one, incorrect, bookmarked) (3)
 * = 7 queries total, none repeated per subject/system/category combination
 * (no N+1) — there's no hard query-budget AC for this endpoint (unlike Phase
 * 6.1's dashboard), just the "don't write an obviously quadratic N+1" bar.
 */
export async function getQbankMeta(userId) {
  const categories = await getAccessibleExamCategories(userId);
  const [subjects, systems] = await Promise.all([
    Subject.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
    BodySystem.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
  ]);

  if (categories.length === 0) {
    return {
      categories: [],
      subjects: subjects.map((s) => serializeTaxonomyRow(s, new Map())),
      systems: systems.map((s) => serializeTaxonomyRow(s, new Map())),
      countsByCategory: [],
      filterCounts: [],
      poolsCount: { all: 0, unused: 0, incorrect: 0, bookmarked: 0 },
    };
  }

  // ONE grouped aggregate — every (examCategory, subjectId, systemId) count
  // combination the user could filter by, in a single query (not one query
  // per combination).
  const grouped = await Question.findAll({
    attributes: [
      'examCategory',
      'subjectId',
      'systemId',
      [fn('COUNT', col('Question.id')), 'cnt'],
    ],
    where: { examCategory: categories, isActive: true },
    group: ['examCategory', 'subjectId', 'systemId'],
    raw: true,
  });

  let totalActiveInScope = 0;
  const bySubject = new Map();
  const bySystem = new Map();
  const byCategory = new Map();
  const filterCounts = [];
  for (const row of grouped) {
    const count = Number(row.cnt);
    totalActiveInScope += count;
    bySubject.set(row.subjectId, (bySubject.get(row.subjectId) || 0) + count);
    bySystem.set(row.systemId, (bySystem.get(row.systemId) || 0) + count);
    byCategory.set(row.examCategory, (byCategory.get(row.examCategory) || 0) + count);
    filterCounts.push({ examCategory: row.examCategory, subjectId: row.subjectId, systemId: row.systemId, count });
  }

  // Pool counts, each scoped to {this user} x {active questions in the
  // user's accessible categories} via a real JOIN (not fetched then filtered
  // in JS) — see qbankService.js's file header for the exact definitions.
  const scopedQuestionWhere = { examCategory: categories, isActive: true };

  const seenCount = await UserQuestionHistory.count({
    where: { userId, timesSeen: { [Op.gt]: 0 } },
    include: [{ model: Question, as: 'question', attributes: [], required: true, where: scopedQuestionWhere }],
  });
  const incorrectCount = await UserQuestionHistory.count({
    where: { userId, lastResult: 'incorrect' },
    include: [{ model: Question, as: 'question', attributes: [], required: true, where: scopedQuestionWhere }],
  });
  const bookmarkedCount = await QuestionBookmark.count({
    where: { userId },
    include: [{ model: Question, as: 'question', attributes: [], required: true, where: scopedQuestionWhere }],
  });
  const unusedCount = Math.max(0, totalActiveInScope - seenCount);

  return {
    categories,
    subjects: subjects.map((s) => serializeTaxonomyRow(s, bySubject)),
    systems: systems.map((s) => serializeTaxonomyRow(s, bySystem)),
    countsByCategory: categories.map((c) => ({ examCategory: c, count: byCategory.get(c) || 0 })),
    filterCounts,
    poolsCount: {
      all: totalActiveInScope,
      unused: unusedCount,
      incorrect: incorrectCount,
      bookmarked: bookmarkedCount,
    },
  };
}

// ---------------------------------------------------------------------------
// POST /qbank/tests
// ---------------------------------------------------------------------------

/**
 * Shared "past-wrong" resolver — every `user_question_history` row for this
 * user with `last_result==='incorrect'` (the schema's own field for exactly
 * this notion; a question answered wrong once then later answered correctly
 * has `last_result` flipped to `'correct'` by the upsert in
 * finalizeCompleted/finalizeAbandoned, so it naturally drops out of this set
 * without any extra bookkeeping — see DECISIONS.md). This is the ONE place
 * that definition lives: BOTH `pool:'incorrect'` test creation
 * (resolvePoolQuestionIds, below) AND the `GET /qbank/questions/incorrect`
 * listing endpoint (listIncorrectQuestions, near the bookmark section below)
 * call this exact function — never a re-derived/parallel query — so the two
 * can never disagree about what counts as "incorrect" for a given user.
 * Ordered newest-`last_seen_at`-first, which the listing endpoint relies on
 * for display order; the pool resolver below doesn't care about order
 * (it re-shuffles via `ORDER BY RAND()` regardless), so the ordering costs
 * that path nothing.
 */
async function findIncorrectHistoryRows(userId) {
  return UserQuestionHistory.findAll({
    where: { userId, lastResult: 'incorrect' },
    attributes: ['questionId'],
    order: [['lastSeenAt', 'DESC']],
    raw: true,
  });
}

/**
 * Resolves a pool+filters combination to a randomly-ordered array of
 * question ids (length <= `count`) in at most 2 queries: one to fetch the
 * pool-defining question-id set (skipped entirely for `pool==='all'`), one
 * `ORDER BY RAND() LIMIT count` selection — the exact pattern
 * docs/02_ARCHITECTURE.md §5 blesses for banks <=50k ("don't over-engineer
 * this").
 */
async function resolvePoolQuestionIds({ examCategory, subjectIds, systemIds, pool, count, userId }) {
  const where = { examCategory, isActive: true };
  if (subjectIds && subjectIds.length) where.subjectId = subjectIds;
  if (systemIds && systemIds.length) where.systemId = systemIds;

  if (pool === 'unused') {
    // "no user_question_history row for this user, or times_seen=0" — i.e.
    // exclude every question with a history row where times_seen>0.
    const seenRows = await UserQuestionHistory.findAll({
      where: { userId, timesSeen: { [Op.gt]: 0 } },
      attributes: ['questionId'],
      raw: true,
    });
    const seenIds = seenRows.map((r) => r.questionId);
    if (seenIds.length) where.id = { [Op.notIn]: seenIds };
  } else if (pool === 'incorrect') {
    // See findIncorrectHistoryRows's doc comment above — this is the SAME
    // shared resolver GET /qbank/questions/incorrect uses.
    const rows = await findIncorrectHistoryRows(userId);
    where.id = { [Op.in]: rows.length ? rows.map((r) => r.questionId) : [-1] };
  } else if (pool === 'bookmarked') {
    const rows = await QuestionBookmark.findAll({ where: { userId }, attributes: ['questionId'], raw: true });
    where.id = { [Op.in]: rows.length ? rows.map((r) => r.questionId) : [-1] };
  }

  const rows = await Question.findAll({
    where,
    attributes: ['id'],
    order: sequelize.random(),
    limit: count,
    raw: true,
  });
  return rows.map((r) => r.id);
}

/**
 * `count` validation: rejected (422 VALIDATION_ERROR) outside [5,200] via
 * zod `.min(5).max(200)` in the controller — NOT silently clamped. Chosen
 * over silent clamping because a student who explicitly asks for 300 and
 * silently gets back 200 with no explanation is a worse UX than a clear
 * validation error telling them the actual bound; the frontend's own
 * CreateTestPage.tsx wizard already clamps its slider client-side to
 * [5, maxAvailable<=200] before submit, so a real request outside the range
 * should not happen in normal use anyway. See DECISIONS.md.
 *
 * Insufficient pool size: 422 `INSUFFICIENT_QUESTIONS` (not "return fewer
 * with a warning") — the create-test wizard shows live per-filter/pool
 * counts from GET /qbank/meta BEFORE submit (docs/07_EXECUTION_PLAN.md 7.1),
 * so an exact-count mismatch is avoidable in normal use; silently returning
 * fewer than requested would make `timeLimitSeconds` (client-computed from
 * the REQUESTED count, e.g. "1.2 min/question x count") silently wrong for
 * the ACTUAL, smaller test. See DECISIONS.md.
 *
 * `ACTIVE_TEST_EXISTS`: scoped per-user platform-wide (ANY status='in_progress'
 * test_sessions row for this user, not per-category) — mirrors
 * docs/02_ARCHITECTURE.md §4's one-active-playback-session-per-user
 * philosophy this phase's brief explicitly asks to mirror. The 409's
 * `error.details` is `{ testId }` (the existing session's id) — chosen
 * because that is the one piece of information a frontend "resume or
 * abandon?" prompt needs, and it is exactly the shape the already-built
 * `CreateTestPage.tsx` reads (`err.details?.testId`) and
 * `client/src/api/endpoints/qbank.ts`'s mock driver already throws. See
 * DECISIONS.md.
 *
 * `forceNew`: not in docs/04_API_SPEC.md's literal body shorthand, but IS a
 * real, already-wired field in the shipped frontend
 * (`CreateTestRequest.forceNew`, sent by `CreateTestPage.tsx`'s "Abandon &
 * Start New Block" button) — per CLAUDE.md §1a, matching the already-built
 * frontend's real behavior wins. When `forceNew===true` and an in-progress
 * session exists, it is abandoned first (same finalizeAbandoned() path as
 * POST /abandon — answers so far are still recorded to history) and a fresh
 * test is created normally; when false (default) an existing in-progress
 * session throws ACTIVE_TEST_EXISTS as above. See DECISIONS.md.
 */
export async function createTest(userId, payload) {
  const { examCategory, subjectIds, systemIds, count, mode, timed, timeLimitSeconds, pool, forceNew } = payload;

  const categories = await getAccessibleExamCategories(userId);
  if (!categories.includes(examCategory)) {
    throw new ApiError(403, 'NOT_ENROLLED', 'You are not enrolled in a QBank-enabled course for this exam category.');
  }

  let existing = await TestSession.findOne({ where: { userId, status: 'in_progress' } });
  if (existing) {
    existing = await autoFinalizeIfExpired(existing);
  }
  if (existing && existing.status === 'in_progress') {
    if (!forceNew) {
      throw new ApiError(409, 'ACTIVE_TEST_EXISTS', 'You already have an active test in progress.', {
        testId: existing.id,
      });
    }
    const attemptQuestions = await loadAttemptQuestions(existing.id);
    await finalizeAbandoned(existing, attemptQuestions);
  }

  const questionIds = await resolvePoolQuestionIds({ examCategory, subjectIds, systemIds, pool, count, userId });
  if (questionIds.length < count) {
    throw new ApiError(
      422,
      'INSUFFICIENT_QUESTIONS',
      `Only ${questionIds.length} question(s) match your filters; requested ${count}.`,
      { available: questionIds.length, requested: count }
    );
  }

  // Row-creation transaction itself: delegated to the shared
  // testSessionFactory.js (Phase 13.3 dedup pass) — this used to be an
  // inline TestSession.create + TestAttemptQuestion.bulkCreate transaction
  // duplicating that factory's exact shape byte-for-byte (see
  // testSessionFactory.js's header comment for why the duplication existed
  // in the first place: this file was another in-flight task's read-only-
  // locked territory when the factory was extracted for
  // mockExamService.js#startMockExam's use). Pure refactor — identical
  // fields, identical `sortOrder = idx + 1` convention, identical
  // `questionCount` (== `questionIds.length`, which is always exactly
  // `count` here since resolvePoolQuestionIds's `LIMIT count` guarantees
  // `questionIds.length <= count`, and the INSUFFICIENT_QUESTIONS check
  // above already rejected anything less).
  const session = await createSessionWithAttemptQuestions({
    userId,
    mode,
    mockExamId: null,
    examCategory,
    filters: { subjectIds: subjectIds ?? null, systemIds: systemIds ?? null, pool },
    questionIds,
    timeLimitSeconds: timed ? timeLimitSeconds : null,
  });

  return buildSessionResponse(userId, session.id, session);
}

// ---------------------------------------------------------------------------
// GET /qbank/tests/:id
// ---------------------------------------------------------------------------

export async function getTestSession(userId, testSessionId) {
  let session = await loadOwnedSession(userId, testSessionId);
  session = await autoFinalizeIfExpired(session);
  return buildSessionResponse(userId, session.id, session);
}

// ---------------------------------------------------------------------------
// PATCH /qbank/tests/:id/answer
// ---------------------------------------------------------------------------

/**
 * Rejects with 409 in two DISTINCT cases the caller can tell apart via
 * `error.code`:
 *   - `TEST_NOT_IN_PROGRESS`: the session was ALREADY completed/abandoned
 *     before this request (nothing changed as a result of this call).
 *   - `TEST_EXPIRED`: the session WAS in_progress but its timer had already
 *     elapsed — this call is what triggers the lazy auto-submit (same
 *     finalizeCompleted() a real submit uses), so the session transitions to
 *     `completed` as a side effect of this very request, THEN the answer is
 *     rejected (the answer itself is never recorded — the deadline had
 *     already passed).
 */
export async function answerQuestion(userId, testSessionId, body) {
  const { questionId, optionId, timeSpent, flagged } = body;
  let session = await loadOwnedSession(userId, testSessionId);

  if (session.status !== 'in_progress') {
    throw new ApiError(409, 'TEST_NOT_IN_PROGRESS', 'This test is no longer in progress.');
  }

  session = await autoFinalizeIfExpired(session);
  if (session.status !== 'in_progress') {
    throw new ApiError(409, 'TEST_EXPIRED', 'The time limit for this test has elapsed; it has been auto-submitted.');
  }

  const attemptQuestion = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId } });
  if (!attemptQuestion) {
    throw new ApiError(404, 'NOT_FOUND', 'This question is not part of the current test.');
  }

  const normalizedOptionId = optionId ?? null;
  let isCorrect = null;
  if (normalizedOptionId != null) {
    // Server computes correctness by looking up the option's real is_correct
    // flag — the request has no client-supplied correctness value to trust
    // in the first place. Cross-checked against `questionId` too (an
    // optionId belonging to a DIFFERENT question is rejected, not silently
    // accepted) — a lightweight defense against option/question id mismatch.
    const option = await QuestionOption.findOne({ where: { id: normalizedOptionId, questionId } });
    if (!option) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'The selected option does not belong to this question.');
    }
    isCorrect = !!option.isCorrect;
  }

  attemptQuestion.selectedOptionId = normalizedOptionId;
  attemptQuestion.isCorrect = isCorrect;
  if (flagged !== undefined) attemptQuestion.isFlagged = flagged;
  // Accumulated, not overwritten — a revisited/re-answered question keeps
  // adding to its running total.
  attemptQuestion.timeSpentSeconds += Math.max(0, Math.round(timeSpent || 0));
  attemptQuestion.answeredAt = new Date();
  await attemptQuestion.save();

  if (session.mode === 'practice') {
    const question = await Question.findByPk(questionId, {
      include: [{ model: QuestionOption, as: 'questionOptions' }],
    });
    const correctOption = (question?.questionOptions || []).find((o) => o.isCorrect);
    return {
      isCorrect,
      correctOptionId: correctOption ? correctOption.id : undefined,
      explanation: question?.explanation,
      referenceText: question?.referenceText ?? undefined,
    };
  }

  // exam/mock mode: never include correctness/explanation — just an ack.
  return { success: true };
}

// ---------------------------------------------------------------------------
// POST /qbank/tests/:id/submit
// ---------------------------------------------------------------------------

/**
 * Idempotent for an already-`completed` session (returns the existing
 * completed result rather than erroring) — this specifically absorbs the
 * already-built frontend's own race between its client-side countdown's
 * auto-submit call (`TestSessionPage.tsx`'s `handleAutoSubmitOnExpiry`,
 * itself just a normal POST /submit call) and a manual "Confirm & Submit"
 * click landing moments apart, without surfacing a spurious error toast for
 * what is, from the student's point of view, one submit action. Re-submitting
 * an ABANDONED session, however, IS rejected (409 `TEST_NOT_IN_PROGRESS`) —
 * that is a genuinely different terminal state a plain "submit retry"
 * should not silently paper over. See DECISIONS.md.
 */
export async function submitTest(userId, testSessionId) {
  let session = await loadOwnedSession(userId, testSessionId);

  if (session.status === 'abandoned') {
    throw new ApiError(409, 'TEST_NOT_IN_PROGRESS', 'This test has already been abandoned.');
  }

  session = await autoFinalizeIfExpired(session);

  if (session.status === 'in_progress') {
    const attemptQuestions = await loadAttemptQuestions(session.id);
    session = await finalizeCompleted(session, attemptQuestions);
  }
  // else: already `completed` (either just now via autoFinalizeIfExpired, or
  // from an earlier call) — idempotent no-op, fall through and return it.

  return buildSessionResponse(userId, session.id, session);
}

// ---------------------------------------------------------------------------
// POST /qbank/tests/:id/abandon
// ---------------------------------------------------------------------------

export async function abandonTest(userId, testSessionId) {
  let session = await loadOwnedSession(userId, testSessionId);
  session = await autoFinalizeIfExpired(session);

  if (session.status !== 'in_progress') {
    throw new ApiError(409, 'TEST_NOT_IN_PROGRESS', 'This test is not in progress.');
  }

  const attemptQuestions = await loadAttemptQuestions(session.id);
  session = await finalizeAbandoned(session, attemptQuestions);
  return buildSessionResponse(userId, session.id, session);
}

// ---------------------------------------------------------------------------
// GET /qbank/tests/:id/review
// ---------------------------------------------------------------------------

/**
 * 403 while `status==='in_progress'` (matches the AC "review only
 * post-completion" literally) — deliberately does NOT run
 * autoFinalizeIfExpired() first (unlike GET session/PATCH answer/submit/
 * abandon): this phase's auto-submit brief explicitly enumerates
 * "GET/PATCH/submit/abandon" as the four lazy-enforcement points and does not
 * name review, so an expired-but-not-yet-lazily-finalized session still 403s
 * here exactly like any other in_progress session — the very next call to
 * any of the other four endpoints (most likely the client's own GET session
 * poll) settles it into `completed`, after which review opens normally. See
 * DECISIONS.md.
 */
export async function getTestReview(userId, testSessionId) {
  const session = await loadOwnedSession(userId, testSessionId);
  if (session.status === 'in_progress') {
    throw new ApiError(403, 'FORBIDDEN', 'This test must be completed or abandoned before it can be reviewed.');
  }
  return buildSessionResponse(userId, session.id, session);
}

// ---------------------------------------------------------------------------
// GET /qbank/tests (history)
// ---------------------------------------------------------------------------

/**
 * Returns a flat `TestSession[]` array, NOT a `{items,total,page,limit}`
 * pagination envelope — a deliberate deviation from CLAUDE.md §4's general
 * list convention, following the SAME precedent already established (and
 * documented) for `GET /public/courses`, the admin Phase-4.1 list endpoints,
 * and `GET /bookmarks/lectures`: `client/src/api/endpoints/qbank.ts`'s
 * `getTestHistory()` is typed `Promise<TestSession[]>`
 * (`apiFetch<TestSession[]>("/qbank/tests")`, no `page`/`limit` args sent),
 * and `QBankPage.tsx` calls `history.find((t) => t.status === "in_progress")`
 * directly on the returned array to detect a resumable test — an
 * `{items,...}` envelope would break that call. This is a real,
 * already-live contract, so per CLAUDE.md §1a it wins over the general
 * pagination shorthand. Compromise kept for defense-in-depth (same as the
 * prior precedents): `?page=`/`?limit=` are still zod-validated and applied
 * as real `LIMIT`/`OFFSET` server-side, just not reflected in the response
 * shape. Includes sessions of EVERY status (including `in_progress`) —
 * required for the same resume-detection reason. See DECISIONS.md.
 */
export async function listTestHistory(userId, { page = 1, limit = 50 } = {}) {
  const sessions = await TestSession.findAll({
    where: { userId },
    order: [['startedAt', 'DESC']],
    offset: (page - 1) * limit,
    limit,
  });
  return sessions.map((s) => serializeTestSessionSummary(s));
}

// ---------------------------------------------------------------------------
// POST/DELETE /qbank/questions/:id/bookmark
// ---------------------------------------------------------------------------

/**
 * "only questions seen by user" (docs/04_API_SPEC.md §4) — read as: the
 * question must appear in at least one of the user's OWN
 * test_attempt_questions rows (any test, any status/mode — practice, exam,
 * mock, in_progress, completed, or abandoned all count as "encountered"),
 * checked via a real JOIN scoped to `userId` through test_sessions, not a
 * broader "was this question shown to anyone ever" check. This is what
 * prevents scraping the bank by POSTing arbitrary sequential question ids
 * one never actually took a test on. See DECISIONS.md.
 */
async function assertQuestionSeenByUser(userId, questionId) {
  const seenCount = await TestAttemptQuestion.count({
    where: { questionId },
    include: [{ model: TestSession, as: 'testSession', attributes: [], where: { userId }, required: true }],
  });
  if (seenCount === 0) {
    throw new ApiError(403, 'FORBIDDEN', 'You can only bookmark a question you have encountered in a test.');
  }
}

export async function addQuestionBookmark(userId, questionId) {
  const question = await Question.findByPk(questionId);
  if (!question) {
    throw new ApiError(404, 'NOT_FOUND', 'Question not found.');
  }
  await assertQuestionSeenByUser(userId, questionId);
  await QuestionBookmark.findOrCreate({ where: { userId, questionId } });
  return { isBookmarked: true };
}

export async function removeQuestionBookmark(userId, questionId) {
  const question = await Question.findByPk(questionId);
  if (!question) {
    throw new ApiError(404, 'NOT_FOUND', 'Question not found.');
  }
  await QuestionBookmark.destroy({ where: { userId, questionId } });
  return { isBookmarked: false };
}

// ---------------------------------------------------------------------------
// GET /qbank/questions/bookmarked, GET /qbank/questions/incorrect
//
// Gap closure (dated entry in DECISIONS.md): Phase 7.1-7.4 only shipped
// toggle-only bookmark endpoints and a pool COUNT (GET /qbank/meta's
// poolsCount.bookmarked/incorrect) — no listing endpoint with full question
// content. The already-built frontend worked around this client-side
// (`client/src/api/endpoints/qbank.ts`'s `scanEncounteredQuestions`,
// scanning up to N recent test-session reviews) — these two endpoints are
// the real fix; the client-side scan is superseded but out of scope to swap
// here (client/ untouched this round).
//
// Both endpoints, per the task brief: `auth, deviceCheck,
// requireRole('student')`, inherently self-scoped to `req.user.id` (no `:id`
// param, no IDOR surface), and ALWAYS reveal isCorrect/explanation/
// referenceText regardless of the exam/mock live-secrecy rule
// (computeIncludeAnswers above) — that rule exists to protect an
// IN-PROGRESS test's answers; a bookmarked or previously-missed question is
// by definition something the user has already encountered/answered in some
// PAST session (bookmarking requires assertQuestionSeenByUser; an
// incorrect-history row only exists after a real graded attempt), so there
// is nothing left to protect here. Both return a flat `Question[]` (not a
// `{items,total,page,limit}` envelope) — this qbank router has an
// established flat-list precedent of its own (GET /qbank/tests, see
// listTestHistory's doc comment above) mirrored from GET /public/courses,
// the admin Phase-4.1 list endpoints, and GET /bookmarks/lectures
// (services/videoService.js#listBookmarkedLectures) — and it is also
// literally the shape the frontend's superseded `scanEncounteredQuestions`
// already returns (`{questions: Question[], ...}`), so a future swap-over
// to these real endpoints is a drop-in. See DECISIONS.md.
// ---------------------------------------------------------------------------

/**
 * Batch-loads full Question rows (+ subject/system names + options) for an
 * explicit list of ids, in the SAME order as `questionIds` — a plain
 * `WHERE id IN (...)` does not guarantee row order matches the input array,
 * and callers here pass an already-meaningfully-ordered id list (bookmark
 * recency / last-seen recency). 2 queries total regardless of list length
 * (main query + `separate: true` options query — same pattern as
 * loadAttemptQuestionsForDisplay above), never N+1 per question. Silently
 * drops any id with no matching row (defensive; should not happen given the
 * FK from question_bookmarks/user_question_history to questions).
 */
async function loadQuestionsByIdOrdered(questionIds) {
  if (!questionIds.length) return [];
  const rows = await Question.findAll({
    where: { id: questionIds },
    include: [
      { model: Subject, as: 'subject' },
      { model: BodySystem, as: 'system' },
      { model: QuestionOption, as: 'questionOptions', separate: true, order: [['sortOrder', 'ASC']] },
    ],
  });
  const byId = new Map(rows.map((q) => [q.id, q]));
  return questionIds.map((id) => byId.get(id)).filter(Boolean);
}

/** One extra query for the `isBookmarked` flag on a list NOT itself sourced from question_bookmarks (i.e. the incorrect-listing endpoint) — same lookup shape buildSessionResponse already uses for test-session display. */
async function loadBookmarkedQuestionIdSet(userId, questionIds) {
  if (!questionIds.length) return new Set();
  const rows = await QuestionBookmark.findAll({
    where: { userId, questionId: questionIds },
    attributes: ['questionId'],
    raw: true,
  });
  return new Set(rows.map((r) => r.questionId));
}

/**
 * GET /qbank/questions/bookmarked — full content for every question the
 * user has bookmarked, most-recently-bookmarked first (`ORDER BY
 * question_bookmarks.id DESC` — same convention as GET /bookmarks/lectures,
 * services/videoService.js#listBookmarkedLectures). `isBookmarked` is
 * trivially `true` for every row here (no extra query needed, unlike the
 * incorrect-listing endpoint below).
 *
 * Query budget: 1 JOIN (question_bookmarks -> questions -> subject/system)
 * + 1 separate options query (`separate: true`, same de-duplication
 * reasoning as loadAttemptQuestionsForDisplay's doc comment above — a
 * directly-JOINed hasMany would multiply the bookmark rows one-per-option)
 * = 2 queries total, never N+1 per bookmarked question.
 */
export async function listBookmarkedQuestions(userId) {
  const bookmarks = await QuestionBookmark.findAll({
    where: { userId },
    order: [['id', 'DESC']],
    include: [
      {
        model: Question,
        as: 'question',
        required: true,
        include: [
          { model: Subject, as: 'subject' },
          { model: BodySystem, as: 'system' },
          { model: QuestionOption, as: 'questionOptions', separate: true, order: [['sortOrder', 'ASC']] },
        ],
      },
    ],
  });
  const bookmarkedQuestionIds = new Set(bookmarks.map((b) => b.questionId));
  return bookmarks.map((b) => serializeQuestion(b.question, true, bookmarkedQuestionIds));
}

/**
 * GET /qbank/questions/incorrect — full content for every question whose
 * `user_question_history.last_result==='incorrect'`, via
 * findIncorrectHistoryRows() — the EXACT SAME resolver `pool:'incorrect'`
 * test creation uses (resolvePoolQuestionIds above), so this listing and
 * that pool filter can never disagree about what counts as "incorrect" for
 * a given user (see findIncorrectHistoryRows's doc comment). Ordered
 * newest-`last_seen_at`-first so a question missed a while ago doesn't bury
 * one just missed.
 *
 * Query budget: 1 (history ids, shared resolver) + 1 (questions +
 * subject/system) + 1 (options, `separate: true`) + 1 (bookmark-state
 * lookup, for `isBookmarked`) = 4 queries total, never N+1 per question.
 */
export async function listIncorrectQuestions(userId) {
  const rows = await findIncorrectHistoryRows(userId);
  const questionIds = rows.map((r) => r.questionId);
  const questions = await loadQuestionsByIdOrdered(questionIds);
  const bookmarkedQuestionIds = await loadBookmarkedQuestionIdSet(userId, questionIds);
  return questions.map((q) => serializeQuestion(q, true, bookmarkedQuestionIds));
}

export default {
  getAccessibleExamCategories,
  computeRemainingSeconds,
  getQbankMeta,
  createTest,
  getTestSession,
  answerQuestion,
  submitTest,
  abandonTest,
  getTestReview,
  listTestHistory,
  addQuestionBookmark,
  removeQuestionBookmark,
  listBookmarkedQuestions,
  listIncorrectQuestions,
};
