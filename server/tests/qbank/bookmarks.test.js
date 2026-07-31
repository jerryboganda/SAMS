// server/tests/qbank/bookmarks.test.js
// POST/DELETE /api/v1/qbank/questions/:id/bookmark (docs/04_API_SPEC.md §4,
// docs/07_EXECUTION_PLAN.md 7.4) — toggle, and the "only questions seen by
// user" restriction (any test_attempt_questions row for this user, any
// status/mode — prevents scraping the bank by bookmarking arbitrary ids).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, QuestionBookmark } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentAgent(prefix) {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `jest-${prefix}` });
  return { agent, user };
}

describe('POST/DELETE /api/v1/qbank/questions/:id/bookmark', () => {
  test('bookmarking a question the user has encountered in a test -> 201 {isBookmarked:true}, row persisted', async () => {
    const { agent, user } = await studentAgent('bookmark-seen');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    await createTestSessionDirect(user, [q], { mode: 'practice' });

    const res = await agent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ isBookmarked: true });

    const row = await QuestionBookmark.findOne({ where: { userId: user.id, questionId: q.id } });
    expect(row).toBeTruthy();
  });

  test('a question already seen via an ABANDONED or COMPLETED (not just in_progress) test still counts as "seen"', async () => {
    const { agent, user } = await studentAgent('bookmark-seen-completed');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    const session = await createTestSessionDirect(user, [q], { mode: 'practice' });
    await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);

    const res = await agent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);
    expect(res.status).toBe(201);
    expect(res.body.data.isBookmarked).toBe(true);
  });

  test('bookmarking a question the user has NEVER encountered in any test -> 403 FORBIDDEN (anti-scraping guard)', async () => {
    const { agent } = await studentAgent('bookmark-unseen');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    // No test session created for this user referencing q.

    const res = await agent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test("a question seen by a DIFFERENT user does not count as seen for ME (per-user, not global)", async () => {
    const { user: otherUser } = await studentAgent('bookmark-other-seen');
    const { agent: myAgent } = await studentAgent('bookmark-other-me');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    await createTestSessionDirect(otherUser, [q], { mode: 'practice' });

    const res = await myAgent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);
    expect(res.status).toBe(403);
  });

  test('toggling twice (add, add again) is idempotent — still isBookmarked:true, no error', async () => {
    const { agent, user } = await studentAgent('bookmark-idempotent');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    await createTestSessionDirect(user, [q], { mode: 'practice' });

    const first = await agent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);
    expect(first.status).toBe(201);
    const second = await agent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);
    expect(second.status).toBe(201);
    expect(second.body.data.isBookmarked).toBe(true);

    const rows = await QuestionBookmark.findAll({ where: { userId: user.id, questionId: q.id } });
    expect(rows).toHaveLength(1);
  });

  test('DELETE removes the bookmark -> 200 {isBookmarked:false}', async () => {
    const { agent, user } = await studentAgent('bookmark-remove');
    const subject = await createSubject();
    const system = await createBodySystem();
    const [q] = await createQuestions(subject, system, 1);
    await createTestSessionDirect(user, [q], { mode: 'practice' });
    await agent.post(`/api/v1/qbank/questions/${q.id}/bookmark`);

    const res = await agent.delete(`/api/v1/qbank/questions/${q.id}/bookmark`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ isBookmarked: false });

    const row = await QuestionBookmark.findOne({ where: { userId: user.id, questionId: q.id } });
    expect(row).toBeNull();
  });

  test('nonexistent question id -> 404 NOT_FOUND (both POST and DELETE)', async () => {
    const { agent } = await studentAgent('bookmark-nonexistent');
    const postRes = await agent.post('/api/v1/qbank/questions/999999999/bookmark');
    expect(postRes.status).toBe(404);
    const deleteRes = await agent.delete('/api/v1/qbank/questions/999999999/bookmark');
    expect(deleteRes.status).toBe(404);
  });

  test('no auth -> 401', async () => {
    const res = await request(app).post('/api/v1/qbank/questions/1/bookmark');
    expect(res.status).toBe(401);
  });
});
