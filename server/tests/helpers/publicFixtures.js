// server/tests/helpers/publicFixtures.js
// Shared fixture builders for Phase 3.1 public-catalog supertest specs.
// Creates rows directly via the model layer (same pattern as
// tests/helpers/testUsers.js) — server/tests/globalSetup.cjs migrates the
// test DB fresh per run but deliberately does NOT run the seeders, so every
// public/*.test.js file builds its own minimal fixtures instead of relying
// on seeded demo data.
import db from '../../src/models/index.js';

const { Course, CourseSection, Lecture, Faculty, Faq, Subject, BodySystem, Question, QuestionOption } = db;

let counter = 0;
function uniqueSuffix(prefix = 'fixture') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createCourse(overrides = {}) {
  const suffix = uniqueSuffix('course');
  return Course.create({
    title: `Test Course ${suffix}`,
    slug: `test-course-${suffix}`,
    examCategory: 'NRE1',
    shortDescription: 'Short description.',
    description: 'Full description.',
    thumbnailUrl: 'https://example.test/thumb.jpg',
    price: 15000,
    currency: 'PKR',
    validityDays: 180,
    includesQbank: true,
    isPublished: true,
    sortOrder: 0,
    ...overrides,
  });
}

export async function createSection(course, overrides = {}) {
  return CourseSection.create({
    courseId: course.id,
    title: `Section ${uniqueSuffix('section')}`,
    sortOrder: 0,
    ...overrides,
  });
}

export async function createLecture(course, section, overrides = {}) {
  return Lecture.create({
    courseId: course.id,
    sectionId: section.id,
    title: `Lecture ${uniqueSuffix('lecture')}`,
    description: 'Lecture description.',
    videoProvider: 'mock',
    videoRef: 'mock-ref',
    durationSeconds: 600,
    isFreePreview: false,
    isPublished: true,
    sortOrder: 0,
    ...overrides,
  });
}

export async function createFaculty(overrides = {}) {
  return Faculty.create({
    name: `Dr. Test ${uniqueSuffix('faculty')}`,
    title: 'Senior Instructor',
    bio: 'Bio text.',
    photoUrl: 'https://example.test/faculty.jpg',
    sortOrder: 0,
    isActive: true,
    ...overrides,
  });
}

export async function createFaq(overrides = {}) {
  return Faq.create({
    question: `Question ${uniqueSuffix('faq')}?`,
    answer: 'Answer text.',
    sortOrder: 0,
    isActive: true,
    ...overrides,
  });
}

export async function createSubject(overrides = {}) {
  return Subject.create({ name: `Subject ${uniqueSuffix('subject')}`, sortOrder: 0, ...overrides });
}

export async function createBodySystem(overrides = {}) {
  return BodySystem.create({ name: `System ${uniqueSuffix('system')}`, sortOrder: 0, ...overrides });
}

export async function createQuestionWithOptions({ subject, system, correctIndex = 0, overrides = {} } = {}) {
  const question = await Question.create({
    examCategory: 'NRE1',
    subjectId: subject.id,
    systemId: system.id,
    stem: `Sample stem ${uniqueSuffix('question')}`,
    explanation: 'Sample explanation.',
    referenceText: 'Sample reference.',
    difficulty: 'medium',
    isActive: true,
    ...overrides,
  });
  const options = await Promise.all(
    ['A', 'B', 'C', 'D'].map((label, idx) =>
      QuestionOption.create({
        questionId: question.id,
        optionText: `Option ${label}`,
        isCorrect: idx === correctIndex,
        sortOrder: idx,
      })
    )
  );
  return { question, options };
}
