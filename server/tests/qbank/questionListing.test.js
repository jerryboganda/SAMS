// server/tests/qbank/questionListing.test.js
// GET /api/v1/qbank/questions/bookmarked, GET /api/v1/qbank/questions/incorrect
// — gap-closure listing endpoints (docs/04_API_SPEC.md §4, DECISIONS.md's
// dated gap-closure entry). Full question content (options incl. isCorrect,
// explanation, referenceText) is ALWAYS revealed on both — bookmarking
// requires assertQuestionSeenByUser and an incorrect-history row only exists
// after a real graded attempt, so there is no live in-progress-exam secrecy
// to protect here (unlike GET /qbank/tests/:id). Both are self-scoped to
// req.user.id with no `:id` param — the IDOR surface tested here is "does
// ANOTHER user's data leak into MY list", not ownership-by-id.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../helpers/studentFixtures.js';
import { createQuestions, setQuestionHistory, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentAgent(prefix) {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return { agent, user };
}

async function studentWithQbankAccess(prefix, examCategory = 'NRE1') {
  const { agent, user } = await studentAgent(prefix);
  const course = await createCourse({ examCategory, includesQbank: true });
  await createActiveEnrollment(user, course);
  return { agent, user, course };
}

describe('GET /api/v1/qbank/questions/bookmarked', () => {
  test('happy path: full question content (incl. answers) for every bookmark, most-recently-bookmarked first', async () => {
    const { agent, user } = await studentAgent('bm-list-happy');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q1, q2] = await createQuestions(subject, system, 2);
    await createTestSessionDirect(user, [q1, q2], { mode: 'practice' });

    await agent.post(`/api/v1/qbank/questions/${q1.id}/bookmark`);
    await agent.post(`/api/v1/qbank/questions/${q2.id}/bookmark`);

    const res = await agent.get('/api/v1/qbank/questions/bookmarked');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Most-recently-bookmarked first -> q2 (bookmarked second) then q1.
    expect(res.body.data.map((q) => q.id)).toEqual([q2.id, q1.id]);

    res.body.data.forEach((q) => {
      expect(q.isBookmarked).toBe(true);
      expect(q.options.length).toBe(4);
      // Answers ALWAYS revealed here — unlike the in-progress-exam secrecy
      // rule this same serializer enforces on GET /qbank/tests/:id.
      expect(q.options.some((o) => o.isCorrect === true)).toBe(true);
      expect(typeof q.explanation).toBe('string');
      expect(q.explanation.length).toBeGreaterThan(0);
      expect(q.stem).toBeTruthy();
      expect(q.subjectId).toBe(subject.id);
      expect(q.systemId).toBe(system.id);
    });
  });

  test('empty state: no bookmarks -> []', async () => {
    const { agent } = await studentAgent('bm-list-empty');
    const res = await agent.get('/api/v1/qbank/questions/bookmarked');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("scoped to requesting user only — another user's bookmark does not leak into my list", async () => {
    const { agent: otherAgent, user: otherUser } = await studentAgent('bm-list-other');
    const { agent: myAgent } = await studentAgent('bm-list-me');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    await createTestSessionDirect(otherUser, [q], { mode: 'practice' });
    await otherAgent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);

    const res = await myAgent.get('/api/v1/qbank/questions/bookmarked');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('no auth -> 401', async () => {
    const res = await request(app).get('/api/v1/qbank/questions/bookmarked');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/qbank/questions/bookmarked');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/v1/qbank/questions/incorrect', () => {
  test('happy path: full question content (incl. answers) for every past-wrong question, most-recently-seen first', async () => {
    const { agent, user } = await studentAgent('inc-list-happy');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [older, newer, rightQ] = await createQuestions(subject, system, 3);

    await setQuestionHistory(user, older, { lastResult: 'incorrect', lastSeenAt: new Date(Date.now() - 60_000) });
    await setQuestionHistory(user, newer, { lastResult: 'incorrect', lastSeenAt: new Date() });
    // Currently-correct — must NOT appear, even though a history row exists.
    await setQuestionHistory(user, rightQ, { lastResult: 'correct', timesCorrect: 1 });

    const res = await agent.get('/api/v1/qbank/questions/incorrect');
    expect(res.status).toBe(200);
    expect(res.body.data.map((q) => q.id)).toEqual([newer.id, older.id]);

    res.body.data.forEach((q) => {
      expect(q.options.length).toBe(4);
      expect(q.options.some((o) => o.isCorrect === true)).toBe(true);
      expect(typeof q.explanation).toBe('string');
      expect(q.explanation.length).toBeGreaterThan(0);
    });

    const ids = res.body.data.map((q) => q.id);
    expect(ids).not.toContain(rightQ.id);
  });

  test('empty state: no incorrect history -> []', async () => {
    const { agent } = await studentAgent('inc-list-empty');
    const res = await agent.get('/api/v1/qbank/questions/incorrect');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("scoped to requesting user only — another user's incorrect history does not leak into my list", async () => {
    const { user: otherUser } = await studentAgent('inc-list-other');
    const { agent: myAgent } = await studentAgent('inc-list-me');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    await setQuestionHistory(otherUser, q, { lastResult: 'incorrect' });

    const res = await myAgent.get('/api/v1/qbank/questions/incorrect');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('no auth -> 401', async () => {
    const res = await request(app).get('/api/v1/qbank/questions/incorrect');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/qbank/questions/incorrect');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test(
    "agrees EXACTLY with POST /qbank/tests {pool:'incorrect'} on the same question set for the same user (shared resolver, not coincidence)",
    async () => {
      const { agent, user } = await studentWithQbankAccess('inc-agree');
      const subject = await createSubject();
      const system = await createBodySystem();
      const wrongQuestions = await createQuestions(subject, system, 5);
      const [rightQ, bookmarkedOnlyQ] = await createQuestions(subject, system, 2);

      await Promise.all(wrongQuestions.map((q) => setQuestionHistory(user, q, { lastResult: 'incorrect' })));
      await setQuestionHistory(user, rightQ, { lastResult: 'correct', timesCorrect: 1 });
      await createTestSessionDirect(user, [bookmarkedOnlyQ], { mode: 'practice', status: 'completed', completedAt: new Date() });
      await agent.post(`/api/v1/qbank/questions/${bookmarkedOnlyQ.id}/bookmark`);

      const listingRes = await agent.get('/api/v1/qbank/questions/incorrect');
      expect(listingRes.status).toBe(200);
      const listingIds = new Set(listingRes.body.data.map((q) => q.id));
      expect(listingIds.size).toBe(5);

      const createRes = await agent.post('/api/v1/qbank/tests').send({
        examCategory: 'NRE1',
        count: 5,
        mode: 'practice',
        timed: false,
        pool: 'incorrect',
      });
      expect(createRes.status).toBe(201);
      const poolIds = new Set(createRes.body.data.questions.map((aq) => aq.questionId));
      expect(poolIds.size).toBe(5);

      // The whole point of sharing findIncorrectHistoryRows(): these two
      // independently-triggered code paths (a plain GET listing vs. the
      // create-test pool resolver) must land on the IDENTICAL set.
      expect(listingIds).toEqual(poolIds);
      expect(listingIds.has(rightQ.id)).toBe(false);
      expect(listingIds.has(bookmarkedOnlyQ.id)).toBe(false);
    },
    30000
  );
});
