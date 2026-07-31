// server/tests/jobs/questionDifficultyCron.test.js
// Unit tests for services/statsService.js#recomputeQuestionDifficulty — the
// aggregation/update LOGIC behind jobs/questionDifficultyCron.js, called
// directly (per this task's explicit instruction: don't try to test actual
// node-cron scheduling). This job's own aggregate is deliberately GLOBAL
// (every test_attempt_questions row in the whole DB, not scoped to one
// user/subject) — a real design difference from the per-user-scoped qbank
// endpoints elsewhere in this suite. Because server/tests/globalSetup.cjs
// migrates the test DB once per whole `npm test` run (not per file), other
// spec files' own questions/attempts may already exist in the shared DB by
// the time this file runs; that's harmless here because every assertion
// below is keyed to THIS file's own freshly-created question ids (each
// question's recomputed times_attempted/times_correct is fully determined by
// its OWN attempt rows only) — the GLOBAL summary count
// (`questionsWithAttempts`) is deliberately never asserted on exactly, only
// this file's own three questions are (see DECISIONS.md's dated Phase 8.1
// entry for this same shared-test-DB mitigation Phase 7 already flagged).
import { afterAll, describe, expect, test } from '@jest/globals';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser } from '../helpers/testUsers.js';
import { recomputeQuestionDifficulty } from '../../src/services/statsService.js';

const { sequelize, TestAttemptQuestion, QuestionOption, Question } = db;

afterAll(async () => {
  await sequelize.close();
});

async function answerAttempt(session, question, result) {
  const attempt = await TestAttemptQuestion.findOne({ where: { testSessionId: session.id, questionId: question.id } });
  if (result === 'skipped') {
    attempt.selectedOptionId = null;
    attempt.isCorrect = null;
  } else {
    const options = await QuestionOption.findAll({ where: { questionId: question.id }, order: [['sortOrder', 'ASC']] });
    const chosen = result === 'correct' ? options.find((o) => o.isCorrect) : options.find((o) => !o.isCorrect);
    attempt.selectedOptionId = chosen.id;
    attempt.isCorrect = result === 'correct';
  }
  attempt.answeredAt = result === 'skipped' ? null : new Date();
  await attempt.save();
}

describe('statsService.recomputeQuestionDifficulty', () => {
  test('recomputes times_attempted/times_correct from real test_attempt_questions data, resets stale values for questions with zero real attempts, and ignores skipped (unanswered) attempts', async () => {
    const { user } = await createVerifiedUser({ email: `qd-${Date.now()}-1@example.test` });
    const subject = await createSubject();
    const system = await createBodySystem();
    const [qA, qB, qC] = await createQuestions(subject, system, 3, { examCategory: 'OTHER' });

    // qA: 3 independent attempts (3 separate sessions) -- 2 correct, 1 incorrect.
    const sessionA1 = await createTestSessionDirect(user, [qA], { status: 'completed', completedAt: new Date() });
    await answerAttempt(sessionA1, qA, 'correct');
    const sessionA2 = await createTestSessionDirect(user, [qA], { status: 'completed', completedAt: new Date() });
    await answerAttempt(sessionA2, qA, 'correct');
    const sessionA3 = await createTestSessionDirect(user, [qA], { status: 'abandoned', completedAt: new Date() });
    await answerAttempt(sessionA3, qA, 'incorrect');

    // qB: one attempt, but SKIPPED (selected_option_id stays null) -- must
    // NOT count as an attempt at all.
    const sessionB = await createTestSessionDirect(user, [qB], { status: 'completed', completedAt: new Date() });
    await answerAttempt(sessionB, qB, 'skipped');

    // qC: never appears in test_attempt_questions at all, but starts with
    // STALE nonzero denormalized values (simulating drift from a prior,
    // since-invalidated state) -- the cron must reset it to 0, not merely
    // "leave it alone because nothing changed".
    await qC.update({ timesAttempted: 5, timesCorrect: 5 });

    await recomputeQuestionDifficulty();

    const [reloadedA, reloadedB, reloadedC] = await Promise.all([
      Question.findByPk(qA.id),
      Question.findByPk(qB.id),
      Question.findByPk(qC.id),
    ]);

    expect(reloadedA.timesAttempted).toBe(3);
    expect(reloadedA.timesCorrect).toBe(2);

    expect(reloadedB.timesAttempted).toBe(0);
    expect(reloadedB.timesCorrect).toBe(0);

    expect(reloadedC.timesAttempted).toBe(0);
    expect(reloadedC.timesCorrect).toBe(0);
  });

  test('is idempotent: running it twice in a row produces the same result', async () => {
    const { user } = await createVerifiedUser({ email: `qd-${Date.now()}-2@example.test` });
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1, { examCategory: 'OTHER' });
    const session = await createTestSessionDirect(user, [q], { status: 'completed', completedAt: new Date() });
    await answerAttempt(session, q, 'correct');

    await recomputeQuestionDifficulty();
    const first = await Question.findByPk(q.id);
    await recomputeQuestionDifficulty();
    const second = await Question.findByPk(q.id);

    expect(second.timesAttempted).toBe(first.timesAttempted);
    expect(second.timesCorrect).toBe(first.timesCorrect);
    expect(first.timesAttempted).toBe(1);
    expect(first.timesCorrect).toBe(1);
  });
});
