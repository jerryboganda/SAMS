// server/tests/helpers/qbankFixtures.js
// Shared fixture builders for Phase 7.1-7.4 QBank engine supertest specs —
// same "create rows directly via the model layer" pattern as
// tests/helpers/publicFixtures.js / studentFixtures.js. Reuses
// publicFixtures.js's createSubject/createBodySystem/createQuestionWithOptions
// for single-question fixtures; this file adds QBank-specific bulk/pool/
// direct-session builders.
import db from '../../src/models/index.js';

const { Question, QuestionOption, UserQuestionHistory, QuestionBookmark, TestSession, TestAttemptQuestion } = db;

let counter = 0;
function uniqueSuffix(prefix = 'qb') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/**
 * Bulk-creates `count` active questions (4 options each, option index 0
 * always correct) for (subject, system) — for count-boundary / pool-size
 * tests that need many questions quickly. Returns Question[] (options not
 * eagerly attached to the returned rows; fetch separately if needed).
 */
export async function createQuestions(subject, system, count, overrides = {}) {
  const questions = [];
  for (let i = 0; i < count; i += 1) {
    const suffix = uniqueSuffix('question');
    const question = await Question.create({
      examCategory: 'NRE1',
      subjectId: subject.id,
      systemId: system.id,
      stem: `Stem ${suffix}`,
      explanation: `Explanation ${suffix}`,
      referenceText: `Reference ${suffix}`,
      difficulty: 'medium',
      isActive: true,
      ...overrides,
    });
    await Promise.all(
      ['A', 'B', 'C', 'D'].map((label, idx) =>
        QuestionOption.create({
          questionId: question.id,
          optionText: `Option ${label} (${question.id})`,
          isCorrect: idx === 0,
          sortOrder: idx,
        })
      )
    );
    questions.push(question);
  }
  return questions;
}

/**
 * Direct user_question_history row (bypassing the submit/abandon upsert
 * flow) — for pool-resolution tests that need a precise, pre-existing
 * history state. Uses `upsert` (not `create`) since `(user_id, question_id)`
 * is unique — a test that wants to simulate "answered wrong, then later
 * answered right" calls this twice for the same (user, question) and needs
 * the second call to UPDATE the row, not violate the unique constraint.
 */
export async function setQuestionHistory(user, question, overrides = {}) {
  const [row] = await UserQuestionHistory.upsert({
    userId: user.id,
    questionId: question.id,
    timesSeen: 1,
    timesCorrect: 0,
    lastResult: 'incorrect',
    lastSeenAt: new Date(),
    ...overrides,
  });
  return row;
}

export async function createQuestionBookmark(user, question) {
  return QuestionBookmark.create({ userId: user.id, questionId: question.id });
}

/**
 * Directly creates a TestSession + one TestAttemptQuestion per `questions`
 * entry, bypassing the POST /qbank/tests HTTP flow entirely — for tests that
 * need precise control the API wouldn't allow (e.g. a backdated `startedAt`
 * to simulate an already-elapsed timer without a real `sleep`, or a
 * `mockExamId` this generic create-test endpoint never sets). Returns the
 * created TestSession (status='in_progress' by default).
 */
export async function createTestSessionDirect(user, questions, overrides = {}) {
  const session = await TestSession.create({
    userId: user.id,
    mode: 'practice',
    mockExamId: null,
    examCategory: 'NRE1',
    filters: null,
    questionCount: questions.length,
    timeLimitSeconds: null,
    status: 'in_progress',
    startedAt: new Date(),
    ...overrides,
  });
  await TestAttemptQuestion.bulkCreate(
    questions.map((q, idx) => ({ testSessionId: session.id, questionId: q.id, sortOrder: idx + 1 }))
  );
  return session;
}

export default {
  createQuestions,
  setQuestionHistory,
  createQuestionBookmark,
  createTestSessionDirect,
};
