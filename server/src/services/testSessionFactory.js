// server/src/services/testSessionFactory.js
// Shared "create a test_sessions row + its frozen test_attempt_questions
// snapshot, given an already-resolved, already-ordered list of question ids"
// factory — docs/07_EXECUTION_PLAN.md Phase 8.3's explicit brief: "reuse the
// SAME test_attempt_questions-row-creation logic Phase 7's createTest uses
// if you can factor it out cleanly ... rather than writing a parallel,
// possibly-inconsistent implementation."
//
// Why this lives in its OWN module instead of being factored directly out of
// services/qbankService.js (where the original inline version of this exact
// transaction lives, inside createTest): this Phase 8.3 task's brief
// explicitly locks server/src/services/qbankService.js as another
// in-flight task's (Phase 8.1 analytics) territory for the duration of this
// task — read-only, no edits. This function is written to be byte-for-byte
// the same transaction shape qbankService.js#createTest already runs inline
// (TestSession.create + TestAttemptQuestion.bulkCreate, identical field set
// and defaults — compare the two side by side), specifically so that once
// the file lock lifts, a follow-up pass can replace THAT inline block with a
// call to this shared function with zero behavior change. Until then,
// services/mockExamService.js (this phase's ONLY caller) uses this directly
// for the "fixed paper" question-source case, while qbankService.js's own
// createTest keeps its historical inline copy for the "random pool-resolved"
// case — same shape, two call sites, not two diverging implementations. See
// DECISIONS.md's dated Phase 8.3 entry.
import db from '../models/index.js';

const { TestSession, TestAttemptQuestion, sequelize } = db;

/**
 * Creates one test_sessions row (`status: 'in_progress'`, `startedAt: now`)
 * plus one test_attempt_questions row per entry in `questionIds`, in the
 * EXACT order given (`sortOrder` = 1-based array index, matching
 * qbankService.js's own `idx + 1` convention) — both writes in a single
 * transaction so a session is never left without its question rows (or vice
 * versa) on a partial failure.
 *
 * Deliberately source-agnostic: the caller resolves `questionIds` however is
 * appropriate for the mode (qbankService.js's own createTest: randomly via
 * `ORDER BY RAND() LIMIT count`; services/mockExamService.js#startMockExam,
 * this phase: the mock exam's admin-configured `mock_exam_questions` rows,
 * already ordered by `sort_order`) — this factory only knows "insert these
 * ids, in this order, frozen for this session".
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {'practice'|'exam'|'mock'} params.mode
 * @param {number|null} [params.mockExamId] - null for practice/exam sessions; set for a mock-exam-derived session
 * @param {string} params.examCategory
 * @param {object|null} [params.filters] - stored verbatim on test_sessions.filters (JSON); null when not meaningful (e.g. a fixed mock paper has no subject/system/pool filter)
 * @param {number[]} params.questionIds - already resolved AND already ordered
 * @param {number|null} [params.timeLimitSeconds] - null for an untimed session
 * @returns {Promise<import('sequelize').Model>} the created TestSession row
 */
export async function createSessionWithAttemptQuestions({
  userId,
  mode,
  mockExamId = null,
  examCategory,
  filters = null,
  questionIds,
  timeLimitSeconds = null,
}) {
  return sequelize.transaction(async (transaction) => {
    const session = await TestSession.create(
      {
        userId,
        mode,
        mockExamId,
        examCategory,
        filters,
        questionCount: questionIds.length,
        timeLimitSeconds,
        status: 'in_progress',
        startedAt: new Date(),
      },
      { transaction }
    );

    await TestAttemptQuestion.bulkCreate(
      questionIds.map((questionId, idx) => ({ testSessionId: session.id, questionId, sortOrder: idx + 1 })),
      { transaction }
    );

    return session;
  });
}

export default { createSessionWithAttemptQuestions };
