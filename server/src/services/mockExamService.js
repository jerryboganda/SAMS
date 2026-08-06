// server/src/services/mockExamService.js
// Business logic for the STUDENT side of mock exams (docs/04_API_SPEC.md §4
// `GET /mock-exams`, `POST /mock-exams/:id/start`; docs/07_EXECUTION_PLAN.md
// Phase 8.3). Mounted at the TOP-LEVEL `/api/v1/mock-exams/*` — NOT nested
// under `/api/v1/student/*` or `/api/v1/qbank/*` — see routes/v1/mockExams.js's
// header comment for the confirmation trail (§4's own path column has no
// `/student` prefix, AND `client/src/api/endpoints/mock-exams.ts`'s real
// call sites resolve to `${CONFIG.API_BASE_URL}/mock-exams/...`, the exact
// same top-level precedent routes/v1/qbank.js already established for
// `/qbank/*`).
//
// Admin CRUD/question-picker/publish lives in adminMockExamService.js
// instead (mirrors the adminCourseService.js / studentCourseService.js
// split already established in this codebase). The "run/submit/review" half
// of a mock-exam attempt is EXPLICITLY not this file's job — per
// docs/04_API_SPEC.md §4's own note ("same /qbank/tests/:id/... endpoints"),
// once a mock-mode session exists it is indistinguishable from any other
// test_sessions row to routes/v1/qbank.js's existing runner endpoints.
//
// getAccessibleExamCategories()/computeRemainingSeconds(): imported from
// qbankService.js (Phase 13.3 dedup pass) rather than maintained as
// byte-for-byte local copies — this file used to re-derive both because
// qbankService.js was another in-flight task's read-only-locked territory
// at the time this file was first written (see DECISIONS.md's dated Phase
// 8.3 entry, which explicitly flagged this as a follow-up once the lock
// lifted). The question-set creation itself already used the genuinely
// shared services/testSessionFactory.js from day one — see that file's
// header comment.
import { Op, col, fn } from 'sequelize';
import { ApiError } from '../utils/apiError.js';
import db from '../models/index.js';
import { createSessionWithAttemptQuestions } from './testSessionFactory.js';
import { getAccessibleExamCategories, computeRemainingSeconds } from './qbankService.js';

const { MockExam, MockExamQuestion, TestSession } = db;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Session-only serializer (no nested `.questions`) — deliberately mirrors
 * the SHAPE of qbankService.js's private serializeTestSessionSummary (same
 * field set GET /qbank/tests's history listing returns), but is its own
 * small function here rather than a shared import (qbankService.js doesn't
 * export it — it's a display serializer entangled with that file's
 * answer-secrecy rules, not a standalone, independently-reusable helper the
 * way getAccessibleExamCategories/computeRemainingSeconds are). The
 * frontend's `TestSession` type marks `.questions` optional specifically
 * because list/create-summary responses don't always carry it; the very
 * next call a real client makes after POST /mock-exams/:id/start is
 * GET /qbank/tests/:id (Phase 7's existing runner entrypoint, per
 * docs/04_API_SPEC.md §4's own note), which DOES return the full
 * per-question payload with all of qbankService.js's answer-secrecy rules
 * correctly applied — reimplementing that ~150-line secrecy-sensitive
 * serializer here, in a second file, would be exactly the kind of
 * "parallel, possibly-inconsistent" duplication this codebase avoids. See
 * DECISIONS.md.
 */
function serializeMockSessionSummary(session, mockExam) {
  return {
    id: session.id,
    userId: session.userId,
    mode: session.mode,
    mockExamId: session.mockExamId ?? undefined,
    mockExamTitle: mockExam ? mockExam.title : undefined,
    examCategory: session.examCategory,
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

async function findPublishedMockExamOrThrow(id) {
  const mockExam = await MockExam.findByPk(id);
  // Same 404-either-way treatment as an unpublished/nonexistent course
  // detail (services/publicService.js precedent) — a draft mock exam a
  // student has no business seeing is indistinguishable from one that
  // simply doesn't exist.
  if (!mockExam || !mockExam.isPublished) {
    throw new ApiError(404, 'NOT_FOUND', 'Mock exam not found.');
  }
  return mockExam;
}

// ---------------------------------------------------------------------------
// GET /mock-exams
// ---------------------------------------------------------------------------

/**
 * Published mock exams filtered to the user's accessible exam categories
 * (getAccessibleExamCategories, above), each annotated with:
 *   - `questionsCount`: the paper's real configured length (grouped COUNT
 *     over mock_exam_questions, one query for every exam in scope — no
 *     N+1).
 *   - `bestScore`: MAX(score_percent) among this user's `status='completed'`
 *     mode='mock' sessions for this exam. Deliberately COMPLETED-only (not
 *     abandoned) — an abandoned mock attempt's score_percent reflects a
 *     partial run cut short, not a genuine "personal best" a student should
 *     see celebrated. `undefined` (not 0) when never completed, so the
 *     frontend's own `bestScore > 0 ? ... : "Not Attempted"` fallback
 *     (client/src/pages/student/MockExamsPage.tsx) renders correctly.
 *   - `attemptsCount`: count of FINISHED attempts (`completed` OR
 *     `abandoned`, i.e. `status != 'in_progress'`) — an attempt still being
 *     taken right now isn't "recorded" history yet.
 *   - `lastAttemptAt`/`lastScorePercent`/`lastPassed`: the most-recent
 *     finished attempt (by `completedAt ?? startedAt`), for a "most recent
 *     attempt" annotation beyond what the frontend's own `MockExam` type
 *     literally declares (`bestScore`/`attemptsCount` only) — additive
 *     fields, harmless to a caller that ignores them, useful to one that
 *     doesn't. See DECISIONS.md.
 *
 * Query budget: 1 (enrollments+course, for categories) + 1 (mock_exams) +
 * 1 (grouped question-count aggregate) + 1 (all relevant sessions, grouped
 * in JS) = 4 queries total regardless of how many mock exams are in scope —
 * never N+1 per exam.
 */
export async function listMockExamsForStudent(userId) {
  const categories = await getAccessibleExamCategories(userId);
  if (categories.length === 0) return [];

  const mockExams = await MockExam.findAll({
    where: { isPublished: true, examCategory: categories },
    order: [
      ['id', 'ASC'],
    ],
  });
  if (mockExams.length === 0) return [];

  const mockExamIds = mockExams.map((m) => m.id);

  const questionCounts = await MockExamQuestion.findAll({
    where: { mockExamId: mockExamIds },
    attributes: ['mockExamId', [fn('COUNT', col('id')), 'cnt']],
    group: ['mockExamId'],
    raw: true,
  });
  const countByExam = new Map(questionCounts.map((r) => [r.mockExamId, Number(r.cnt)]));

  // Newest-first so, once grouped by mockExamId below, each group's first
  // element is that exam's most recent finished attempt.
  const sessions = await TestSession.findAll({
    where: { userId, mode: 'mock', mockExamId: mockExamIds, status: { [Op.ne]: 'in_progress' } },
    order: [['startedAt', 'DESC']],
  });
  const sessionsByExam = new Map();
  for (const s of sessions) {
    if (!sessionsByExam.has(s.mockExamId)) sessionsByExam.set(s.mockExamId, []);
    sessionsByExam.get(s.mockExamId).push(s);
  }

  return mockExams.map((m) => {
    const attempts = sessionsByExam.get(m.id) || [];
    const completedAttempts = attempts.filter((a) => a.status === 'completed');
    const bestScore = completedAttempts.length
      ? Math.max(...completedAttempts.map((a) => Number(a.scorePercent) || 0))
      : undefined;
    const mostRecent = attempts[0];

    return {
      id: m.id,
      title: m.title,
      examCategory: m.examCategory,
      durationMinutes: m.durationMinutes,
      passPercent: Number(m.passPercent),
      isPublished: m.isPublished,
      questionsCount: countByExam.get(m.id) || 0,
      bestScore,
      attemptsCount: attempts.length,
      lastAttemptAt: mostRecent ? (mostRecent.completedAt ?? mostRecent.startedAt) : undefined,
      lastScorePercent: mostRecent && mostRecent.scorePercent != null ? Number(mostRecent.scorePercent) : undefined,
      lastPassed: mostRecent ? mostRecent.passed ?? undefined : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// POST /mock-exams/:id/start
// ---------------------------------------------------------------------------

/**
 * Creates a `mode='mock'` test_sessions row from a mock exam's FIXED,
 * admin-configured question set — in its configured `sort_order`, never a
 * randomly resolved pool (contrast qbankService.js's createTest). Mirrors
 * that endpoint's real behavior for everything it explicitly shares:
 *   - Enrollment gate: 403 `NOT_ENROLLED` if the exam's `examCategory` isn't
 *     in the user's accessible categories (same helper/definition, see
 *     file header).
 *   - `409 ACTIVE_TEST_EXISTS` (details: `{testId}`) if the user already has
 *     ANY `status='in_progress'` test_sessions row, platform-wide — same
 *     one-active-test invariant qbankService.js#createTest enforces.
 *     Deliberate simplification vs. that endpoint given the file lock: this
 *     check does NOT first run qbankService.js's private
 *     autoFinalizeIfExpired() (unexported, can't be reused without editing
 *     the locked file) — a genuinely timed-out-but-not-yet-lazily-closed
 *     session will still 409 here rather than being auto-resolved inline.
 *     This is not a functional dead end: the 409's `testId` is exactly what
 *     the already-built "resume or abandon?" UI reads, and the user's very
 *     next `GET /qbank/tests/:id` call on that id lazily closes it via
 *     qbankService.js's own auto-finalize-on-access path, after which a
 *     retry of this endpoint succeeds normally. See DECISIONS.md's dated
 *     Phase 8.3 entry (flagged as a natural follow-up once the lock lifts:
 *     export autoFinalizeIfExpired for shared reuse here too).
 *   - `timeLimitSeconds` is server-computed from `durationMinutes * 60`
 *     (CLAUDE.md §4 "server-side timers") — never client-supplied.
 *   - Question-set creation itself: services/testSessionFactory.js, the
 *     SAME row-creation transaction shape qbankService.js#createTest uses
 *     (see that factory's header comment for why it isn't literally the
 *     same function call).
 *
 * `mock_exam_questions` with zero rows configured -> 409 `CONFLICT` (an
 * admin has published a paper with nothing to sit — this should never
 * happen in practice given adminMockExamService.js only lets a paper be
 * hard-deleted, never left empty-and-published on purpose, but it costs one
 * extra guard to fail loudly here instead of silently creating a
 * zero-question, un-completable session).
 */
export async function startMockExam(userId, mockExamId) {
  const mockExam = await findPublishedMockExamOrThrow(mockExamId);

  const categories = await getAccessibleExamCategories(userId);
  if (!categories.includes(mockExam.examCategory)) {
    throw new ApiError(403, 'NOT_ENROLLED', 'You are not enrolled in a QBank-enabled course for this exam category.');
  }

  const existing = await TestSession.findOne({ where: { userId, status: 'in_progress' } });
  if (existing) {
    throw new ApiError(409, 'ACTIVE_TEST_EXISTS', 'You already have an active test in progress.', {
      testId: existing.id,
    });
  }

  const mockExamQuestions = await MockExamQuestion.findAll({
    where: { mockExamId },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (mockExamQuestions.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'This mock exam has no questions configured yet.');
  }
  const questionIds = mockExamQuestions.map((mq) => mq.questionId);

  const session = await createSessionWithAttemptQuestions({
    userId,
    mode: 'mock',
    mockExamId: mockExam.id,
    examCategory: mockExam.examCategory,
    filters: null,
    questionIds,
    timeLimitSeconds: mockExam.durationMinutes * 60,
  });

  return serializeMockSessionSummary(session, mockExam);
}

export default { listMockExamsForStudent, startMockExam };
