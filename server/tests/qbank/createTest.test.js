// server/tests/qbank/createTest.test.js
// POST /api/v1/qbank/tests (docs/04_API_SPEC.md §4, docs/07_EXECUTION_PLAN.md
// 7.2) — entitlement gating, count-boundary validation (reject not clamp),
// pool/filter resolution (esp. pool='incorrect' precision), the frozen
// snapshot, insufficient-pool 422, and ACTIVE_TEST_EXISTS 409 (+ forceNew).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../helpers/studentFixtures.js';
import { createQuestions, setQuestionHistory, createQuestionBookmark } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize, TestSession, TestAttemptQuestion } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentWithQbankAccess(prefix, examCategory = 'NRE1') {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  const course = await createCourse({ examCategory, includesQbank: true });
  await createActiveEnrollment(user, course);
  return { agent, user, course };
}

describe('POST /api/v1/qbank/tests', () => {
  test('happy path: creates an in_progress session + a frozen snapshot of exactly `count` questions', async () => {
    const { agent, user } = await studentWithQbankAccess('create-happy');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 10);

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 8,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.status).toBe('in_progress');
    expect(data.mode).toBe('practice');
    expect(data.examCategory).toBe('NRE1');
    expect(data.questionCount).toBe(8);
    expect(data.questions).toHaveLength(8);
    expect(data.timeLimitSeconds).toBeUndefined();

    const rows = await TestAttemptQuestion.findAll({ where: { testSessionId: data.id }, order: [['sortOrder', 'ASC']] });
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    rows.forEach((r) => {
      expect(r.selectedOptionId).toBeNull();
      expect(r.answeredAt).toBeNull();
    });
    void user;
  });

  test('timed test: timeLimitSeconds is persisted and echoed', async () => {
    const { agent } = await studentWithQbankAccess('create-timed');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 5);

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'exam',
      timed: true,
      timeLimitSeconds: 600,
      pool: 'all',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.timeLimitSeconds).toBe(600);
    expect(res.body.data.timeRemainingSeconds).toBeGreaterThan(590);
    expect(res.body.data.timeRemainingSeconds).toBeLessThanOrEqual(600);
  });

  test('timed=true without timeLimitSeconds -> 422 VALIDATION_ERROR', async () => {
    const { agent } = await studentWithQbankAccess('create-timed-missing');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 5);

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'exam',
      timed: true,
      pool: 'all',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  describe('count validation (reject, not clamp — see DECISIONS.md)', () => {
    test('count=4 (below minimum) -> 422 VALIDATION_ERROR', async () => {
      const { agent } = await studentWithQbankAccess('create-count-low');
      const res = await agent.post('/api/v1/qbank/tests').send({
        examCategory: 'NRE1',
        count: 4,
        mode: 'practice',
        timed: false,
        pool: 'all',
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('count=201 (above maximum) -> 422 VALIDATION_ERROR', async () => {
      const { agent } = await studentWithQbankAccess('create-count-high');
      const res = await agent.post('/api/v1/qbank/tests').send({
        examCategory: 'NRE1',
        count: 201,
        mode: 'practice',
        timed: false,
        pool: 'all',
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('count=5 (exact minimum boundary) with exactly 5 available -> 201 success', async () => {
      const { agent } = await studentWithQbankAccess('create-count-min-ok');
      const subject = await createSubject();
      const system = await createBodySystem();
      await createQuestions(subject, system, 5);

      const res = await agent.post('/api/v1/qbank/tests').send({
        examCategory: 'NRE1',
        count: 5,
        mode: 'practice',
        timed: false,
        pool: 'all',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.questionCount).toBe(5);
    });

    test(
      'count=200 (exact maximum boundary) with >=200 available -> 201 success',
      async () => {
        const { agent } = await studentWithQbankAccess('create-count-max-ok');
        const subject = await createSubject();
        const system = await createBodySystem();
        await createQuestions(subject, system, 205);

        // subjectIds/systemIds-scoped so this genuinely proves "200 works
        // from exactly this test's own 205-question pool", not incidentally
        // passing because of unrelated NRE1 questions other test files
        // created in the same shared MySQL test database.
        const res = await agent.post('/api/v1/qbank/tests').send({
          examCategory: 'NRE1',
          subjectIds: [subject.id],
          systemIds: [system.id],
          count: 200,
          mode: 'practice',
          timed: false,
          pool: 'all',
        });
        expect(res.status).toBe(201);
        expect(res.body.data.questionCount).toBe(200);
      },
      60000
    );
  });

  test('filter honoring: subjectIds/systemIds actually restrict which questions are picked', async () => {
    const { agent } = await studentWithQbankAccess('create-filter');
    const subjectA = await createSubject();
    const systemA = await createBodySystem();
    const subjectB = await createSubject();
    const systemB = await createBodySystem();
    await createQuestions(subjectA, systemA, 5);
    await createQuestions(subjectB, systemB, 5);

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      subjectIds: [subjectA.id],
      systemIds: [systemA.id],
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });

    expect(res.status).toBe(201);
    const { questions } = res.body.data;
    expect(questions).toHaveLength(5);
    questions.forEach((q) => {
      expect(q.question.subjectId).toBe(subjectA.id);
      expect(q.question.systemId).toBe(systemA.id);
    });
  });

  test("pool='incorrect' returns ONLY past-wrong questions — not unanswered, not currently-correct", async () => {
    const { agent, user } = await studentWithQbankAccess('create-pool-incorrect');
    const subject = await createSubject();
    const system = await createBodySystem();
    // 5 past-wrong questions (>= QBANK_TEST_COUNT_MIN, so count=5 is a valid
    // request) plus 3 questions that must NEVER be picked: currently-correct,
    // never-seen, and bookmarked-only.
    const wrongQuestions = await createQuestions(subject, system, 5);
    const [rightQ, unseenQ, bookmarkedOnlyQ] = await createQuestions(subject, system, 3);

    await Promise.all(wrongQuestions.map((q) => setQuestionHistory(user, q, { lastResult: 'incorrect', timesSeen: 1 })));
    await setQuestionHistory(user, rightQ, { lastResult: 'correct', timesSeen: 1, timesCorrect: 1 });
    await createQuestionBookmark(user, bookmarkedOnlyQ);
    void unseenQ;

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'incorrect',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.questions).toHaveLength(5);
    const wrongIds = new Set(wrongQuestions.map((q) => q.id));
    const returnedIds = res.body.data.questions.map((q) => q.questionId);
    returnedIds.forEach((id) => expect(wrongIds.has(id)).toBe(true));
    expect(returnedIds).not.toContain(rightQ.id);
    expect(returnedIds).not.toContain(unseenQ.id);
    expect(returnedIds).not.toContain(bookmarkedOnlyQ.id);
  });

  test("pool='incorrect' with zero past-wrong questions -> 422 INSUFFICIENT_QUESTIONS (not a silently-smaller test)", async () => {
    const { agent, user } = await studentWithQbankAccess('create-pool-incorrect-empty');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [rightQ] = await createQuestions(subject, system, 1);
    await setQuestionHistory(user, rightQ, { lastResult: 'correct', timesSeen: 1, timesCorrect: 1 });

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'incorrect',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_QUESTIONS');
    expect(res.body.error.details.available).toBe(0);
  });

  test("pool='unused' returns ONLY never-seen questions — excludes anything with a times_seen>0 history row (past-correct or past-wrong alike)", async () => {
    const { agent, user } = await studentWithQbankAccess('create-pool-unused');
    const subject = await createSubject();
    const system = await createBodySystem();
    // 5 genuinely-never-seen questions (>= QBANK_TEST_COUNT_MIN) plus 2 seen
    // questions that must NEVER be picked: one past-correct, one past-wrong.
    const unseenQuestions = await createQuestions(subject, system, 5);
    const [seenCorrectQ, seenWrongQ] = await createQuestions(subject, system, 2);

    await setQuestionHistory(user, seenCorrectQ, { lastResult: 'correct', timesSeen: 1, timesCorrect: 1 });
    await setQuestionHistory(user, seenWrongQ, { lastResult: 'incorrect', timesSeen: 1 });

    // subjectIds/systemIds-scoped — without this, "unused" would also match
    // every OTHER NRE1 question created by other tests sharing this same
    // live MySQL test database (never seen by THIS user either), making the
    // returned set unpredictable. Same isolation mitigation the
    // "insufficient questions"/"count=200" tests below already document.
    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      subjectIds: [subject.id],
      systemIds: [system.id],
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'unused',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.questions).toHaveLength(5);
    const unseenIds = new Set(unseenQuestions.map((q) => q.id));
    const returnedIds = res.body.data.questions.map((q) => q.questionId);
    returnedIds.forEach((id) => expect(unseenIds.has(id)).toBe(true));
    expect(returnedIds).not.toContain(seenCorrectQ.id);
    expect(returnedIds).not.toContain(seenWrongQ.id);
  });

  test("pool='unused' with every question already seen -> 422 INSUFFICIENT_QUESTIONS (not a silently-smaller test)", async () => {
    const { agent, user } = await studentWithQbankAccess('create-pool-unused-empty');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [seenQ] = await createQuestions(subject, system, 1);
    await setQuestionHistory(user, seenQ, { lastResult: 'correct', timesSeen: 1, timesCorrect: 1 });

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      subjectIds: [subject.id],
      systemIds: [system.id],
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'unused',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_QUESTIONS');
    expect(res.body.error.details.available).toBe(0);
  });

  test("pool='bookmarked' returns EXACTLY the user's bookmarked set — never an unbookmarked question", async () => {
    const { agent, user } = await studentWithQbankAccess('create-pool-bookmarked');
    const subject = await createSubject();
    const system = await createBodySystem();
    const bookmarkedQuestions = await createQuestions(subject, system, 5);
    const [notBookmarkedQ] = await createQuestions(subject, system, 1);

    await Promise.all(bookmarkedQuestions.map((q) => createQuestionBookmark(user, q)));

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'bookmarked',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.questions).toHaveLength(5);
    const bookmarkedIds = new Set(bookmarkedQuestions.map((q) => q.id));
    const returnedIds = res.body.data.questions.map((q) => q.questionId);
    returnedIds.forEach((id) => expect(bookmarkedIds.has(id)).toBe(true));
    expect(returnedIds).not.toContain(notBookmarkedQ.id);
    // Every bookmarked question was actually returned (exact set, count=5 == bookmarked count=5).
    expect(new Set(returnedIds)).toEqual(bookmarkedIds);
  });

  test("pool='bookmarked' with an empty bookmark set -> 422 INSUFFICIENT_QUESTIONS (real endpoint behavior — not a silent empty test)", async () => {
    const { agent } = await studentWithQbankAccess('create-pool-bookmarked-empty');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 5); // exist, but none bookmarked by this user

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'bookmarked',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_QUESTIONS');
    expect(res.body.error.details.available).toBe(0);
  });

  test('insufficient questions for the requested count -> 422 INSUFFICIENT_QUESTIONS with the real available count', async () => {
    const { agent } = await studentWithQbankAccess('create-insufficient');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 6);

    // Scoped to this test's own fresh subject/system — without this, the
    // "available" count would include every other NRE1 question created by
    // OTHER test files sharing this same live MySQL test database (no
    // per-test DB isolation in this suite), which would make this test
    // flaky/order-dependent. See DECISIONS.md.
    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      subjectIds: [subject.id],
      systemIds: [system.id],
      count: 20,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_QUESTIONS');
    expect(res.body.error.details.available).toBe(6);
    expect(res.body.error.details.requested).toBe(20);
  });

  test('not entitled for the requested examCategory (no qbank-enabled active enrollment) -> 403 NOT_ENROLLED', async () => {
    const email = uniqueEmail('create-notenrolled');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-create-notenrolled' });

    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  test('ACTIVE_TEST_EXISTS: a second create-test call while one is in_progress -> 409 with the existing testId in details', async () => {
    const { agent } = await studentWithQbankAccess('create-conflict');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 10);

    const first = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });
    expect(first.status).toBe(201);
    const firstTestId = first.body.data.id;

    const second = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_TEST_EXISTS');
    expect(second.body.error.details.testId).toBe(firstTestId);
  });

  test('ACTIVE_TEST_EXISTS is platform-wide, not per-category: still conflicts when requesting a DIFFERENT exam category the user is also entitled to', async () => {
    const { agent, user } = await studentWithQbankAccess('create-conflict-crosscat');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 10);
    const otherCourse = await createCourse({ examCategory: 'USMLE1', includesQbank: true });
    await createActiveEnrollment(user, otherCourse);

    const first = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });
    expect(first.status).toBe(201);

    const second = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'USMLE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_TEST_EXISTS');
  });

  test('forceNew=true abandons the existing in_progress test and creates a fresh one', async () => {
    const { agent } = await studentWithQbankAccess('create-forcenew');
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestions(subject, system, 10);

    const first = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });
    expect(first.status).toBe(201);
    const firstTestId = first.body.data.id;

    const second = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
      forceNew: true,
    });

    expect(second.status).toBe(201);
    expect(second.body.data.id).not.toBe(firstTestId);
    expect(second.body.data.status).toBe('in_progress');

    const abandoned = await TestSession.findByPk(firstTestId);
    expect(abandoned.status).toBe('abandoned');
  });

  test('no auth at all -> 401 UNAUTHENTICATED', async () => {
    const res = await request(app).post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/qbank/tests').send({
      examCategory: 'NRE1',
      count: 5,
      mode: 'practice',
      timed: false,
      pool: 'all',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
