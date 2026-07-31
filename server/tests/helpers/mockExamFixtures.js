// server/tests/helpers/mockExamFixtures.js
// Shared fixture builders for Phase 8.3 mock-exam supertest specs — same
// "create rows directly via the model layer" pattern as
// tests/helpers/qbankFixtures.js / studentFixtures.js.
import db from '../../src/models/index.js';

const { MockExam, MockExamQuestion } = db;

let counter = 0;
function uniqueSuffix(prefix = 'mock') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createMockExam(overrides = {}) {
  const suffix = uniqueSuffix('mockexam');
  return MockExam.create({
    title: `Test Mock Exam ${suffix}`,
    examCategory: 'NRE1',
    durationMinutes: 60,
    passPercent: 60,
    isPublished: true,
    ...overrides,
  });
}

/** Attaches `questions` (array of Question rows, in the given order) to `mockExam` as its configured paper — `sortOrder` = 0-based array index, matching adminMockExamService.js#replaceMockExamQuestions's own convention. */
export async function attachQuestionsToMockExam(mockExam, questions) {
  return MockExamQuestion.bulkCreate(
    questions.map((q, idx) => ({ mockExamId: mockExam.id, questionId: q.id, sortOrder: idx }))
  );
}

export default { createMockExam, attachQuestionsToMockExam };
