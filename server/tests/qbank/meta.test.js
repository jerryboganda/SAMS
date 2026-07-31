// server/tests/qbank/meta.test.js
// GET /api/v1/qbank/meta (docs/04_API_SPEC.md §4, docs/07_EXECUTION_PLAN.md
// 7.1) — accessible-categories scoping, taxonomy + per-filter counts, and the
// three pool counts (unused/incorrect/bookmarked), plus auth/role gating.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createActiveEnrollment, createExpiredEnrollment } from '../helpers/studentFixtures.js';
import { createQuestions, setQuestionHistory, createQuestionBookmark } from '../helpers/qbankFixtures.js';
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

describe('GET /api/v1/qbank/meta', () => {
  test('happy path: taxonomy + accurate per-filter and pool counts, scoped to the user\'s accessible categories only', async () => {
    const { agent, user } = await studentAgent('meta-happy');

    const subjectInScope = await createSubject({ name: `Meta Subject In-Scope ${Date.now()}` });
    const subjectEmpty = await createSubject({ name: `Meta Subject Empty ${Date.now()}` });
    const systemInScope = await createBodySystem({ name: `Meta System In-Scope ${Date.now()}` });
    const systemEmpty = await createBodySystem({ name: `Meta System Empty ${Date.now()}` });

    // A category no other qbank test file touches, so this test's exact
    // count assertions can't be polluted by NRE1/USMLE1 questions other
    // test files create against the same shared MySQL test database (no
    // per-test DB isolation in this suite — see DECISIONS.md).
    const course = await createCourse({ examCategory: 'PROMETRIC', includesQbank: true });
    await createActiveEnrollment(user, course);

    // 5 active PROMETRIC questions in scope.
    const [q1, q2, q3, q4, q5] = await createQuestions(subjectInScope, systemInScope, 5, { examCategory: 'PROMETRIC' });

    // q1: seen + last_result=incorrect -> counts toward "incorrect" AND "seen" (excluded from unused).
    await setQuestionHistory(user, q1, { lastResult: 'incorrect', timesSeen: 1 });
    // q2: seen + last_result=correct -> "seen" (excluded from unused) but NOT "incorrect".
    await setQuestionHistory(user, q2, { lastResult: 'correct', timesSeen: 2, timesCorrect: 2 });
    // q3: bookmarked, never seen -> counts toward "bookmarked" AND remains "unused".
    await createQuestionBookmark(user, q3);
    // q4, q5: untouched -> "unused" only.

    // Noise that must NOT be counted: an inactive question in scope...
    const [inactiveQ] = await createQuestions(subjectInScope, systemInScope, 1, { examCategory: 'PROMETRIC', isActive: false });
    // ...and an active question in a category the user has no accessible enrollment for.
    const [outOfScopeQ] = await createQuestions(subjectInScope, systemInScope, 1, { examCategory: 'USMLE1' });
    void inactiveQ;
    void outOfScopeQ;

    const res = await agent.get('/api/v1/qbank/meta');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;

    expect(data.categories).toEqual(['PROMETRIC']);

    const subjIn = data.subjects.find((s) => s.id === subjectInScope.id);
    const subjEmpty = data.subjects.find((s) => s.id === subjectEmpty.id);
    expect(subjIn.questionsCount).toBe(5);
    expect(subjEmpty.questionsCount).toBe(0); // ALL subjects returned, even with zero matches (see DECISIONS.md)

    const sysIn = data.systems.find((s) => s.id === systemInScope.id);
    const sysEmpty = data.systems.find((s) => s.id === systemEmpty.id);
    expect(sysIn.questionsCount).toBe(5);
    expect(sysEmpty.questionsCount).toBe(0);

    expect(data.countsByCategory).toEqual([{ examCategory: 'PROMETRIC', count: 5 }]);

    expect(data.poolsCount).toEqual({
      all: 5,
      unused: 3, // q3, q4, q5
      incorrect: 1, // q1
      bookmarked: 1, // q3
    });

    void q4;
    void q5;
  });

  test('q1 answered wrong then later correct -> no longer counts as "incorrect" (last_result reflects the LATEST result, not "ever wrong")', async () => {
    const { agent, user } = await studentAgent('meta-flip');
    const subject = await createSubject();
    const system = await createBodySystem();
    const course = await createCourse({ examCategory: 'PROMETRIC', includesQbank: true });
    await createActiveEnrollment(user, course);
    const [q1] = await createQuestions(subject, system, 1, { examCategory: 'PROMETRIC' });

    await setQuestionHistory(user, q1, { lastResult: 'incorrect', timesSeen: 1 });
    // Overwrite as if the user retook it and got it right the second time.
    await setQuestionHistory(user, q1, { lastResult: 'correct', timesSeen: 2, timesCorrect: 1 });

    const res = await agent.get('/api/v1/qbank/meta');
    expect(res.status).toBe(200);
    expect(res.body.data.poolsCount.incorrect).toBe(0);
  });

  test('no qbank-enabled active enrollment at all -> graceful empty-shaped payload (not an error)', async () => {
    const { agent } = await studentAgent('meta-empty');

    const res = await agent.get('/api/v1/qbank/meta');

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.categories).toEqual([]);
    expect(data.poolsCount).toEqual({ all: 0, unused: 0, incorrect: 0, bookmarked: 0 });
    expect(Array.isArray(data.subjects)).toBe(true); // taxonomy still returned
  });

  test('a course enrollment that does NOT include qbank access does not unlock its exam category', async () => {
    const { agent, user } = await studentAgent('meta-novideo');
    const course = await createCourse({ examCategory: 'NRE1', includesQbank: false });
    await createActiveEnrollment(user, course);

    const res = await agent.get('/api/v1/qbank/meta');
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([]);
  });

  test('an expired enrollment does not unlock its exam category', async () => {
    const { agent, user } = await studentAgent('meta-expired');
    const course = await createCourse({ examCategory: 'NRE1', includesQbank: true });
    await createExpiredEnrollment(user, course);

    const res = await agent.get('/api/v1/qbank/meta');
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([]);
  });

  test('no auth at all -> 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/qbank/meta');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('authenticated as admin (wrong role) -> 403 FORBIDDEN', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/qbank/meta');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
