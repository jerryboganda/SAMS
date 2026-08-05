'use strict';

/**
 * Phase 12.4 perf-suite finding (docs/PERF_REPORT.md — baseline run, "Admin
 * reports — topSubjectsAttempted grouped join" case): at 10k-question /
 * ~90k-test_attempt_questions synthetic scale,
 * services/adminReportsService.js#buildTopSubjectsAttempted measured
 * p95 = 1066.63 ms — fails the task's <500ms budget by more than 2x, the
 * only one of the 5 hot-path queries this task measured that did.
 *
 * EXPLAIN showed the query driving from `questions` (already efficient —
 * an index-only scan via the existing `fk_q_subject` index) then, for each
 * of ~9,769 matching question rows, doing a `ref` lookup into
 * `test_attempt_questions` via the existing `idx_taq_q` index
 * (`question_id` only) with Extra: "Using where" — NOT "Using index" —
 * meaning every one of those ~80k matched rows required an extra random-IO
 * fetch of the full base row just to read `answered_at` (the WHERE filter)
 * and `is_correct` (the GROUP BY/SELECT column), neither of which
 * `idx_taq_q` covers.
 *
 * Fix: extend that access path into a genuinely COVERING index —
 * `(question_id, answered_at, is_correct)` — so MySQL can satisfy the WHERE
 * filter and read `is_correct` directly from the index leaf, with zero
 * base-row lookups on that side of the join (InnoDB secondary indexes
 * implicitly carry the clustering primary key alongside their own columns,
 * so `COUNT(TestAttemptQuestion.id)` remains satisfiable from the index
 * alone too). `question_id` stays the leading column deliberately — it is
 * the join/equality key this query (and every other join through this FK)
 * probes by; `answered_at` comes second so the `IS NOT NULL` filter narrows
 * the row set before `is_correct` is read.
 *
 * The existing `idx_taq_q` (`question_id` only, added in
 * 20260101000023-create-test-attempt-questions.cjs) is deliberately left in
 * place, not dropped/replaced —
 * services/qbankService.js#assertQuestionSeenByUser and other simple
 * `question_id`-only lookups still benefit from the narrower, cheaper
 * single-column index, and this migration's brief is additive ("add
 * missing indexes"), not a general index audit.
 *
 * No other index was added by this migration — the task brief is explicit
 * that every index must be justified by a concrete EXPLAIN finding, and
 * none of this task's other 4 measured hot-path queries showed a
 * `type: ALL` full table scan or a genuinely inefficient index choice on a
 * hot WHERE/JOIN/GROUP-BY column; see docs/PERF_REPORT.md's "Findings &
 * indexes added" section for the full per-query reasoning (including the
 * admin question-bank list, which the task brief itself flagged as "most
 * likely to be slow" but which measured p95=283.89ms — comfortably under
 * budget, with EXPLAIN showing efficient index-only PK scans on both of its
 * statements, so no schema change was warranted there).
 *
 * Re-measured after applying this migration to the SAME seeded perf DB
 * (`node server/scripts/perf/runPerfSuite.js --migrate --save=after`) — see
 * docs/PERF_REPORT.md for the before/after p95 numbers this migration
 * produced.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('test_attempt_questions', ['question_id', 'answered_at', 'is_correct'], {
      name: 'idx_taq_q_answered_correct',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('test_attempt_questions', 'idx_taq_q_answered_correct');
  },
};
