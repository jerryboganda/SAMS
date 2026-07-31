// server/tests/qbank/history.test.js
// GET /api/v1/qbank/tests (docs/04_API_SPEC.md §4, docs/07_EXECUTION_PLAN.md
// 7.4) — history list shape (mode/date/score/filters), includes sessions of
// EVERY status (the already-built frontend relies on finding an in_progress
// row here to detect "resume"), per-user scoping, and defense-in-depth
// pagination params on the still-flat-array response (see DECISIONS.md).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

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

describe('GET /api/v1/qbank/tests (history)', () => {
  test('returns a flat array (not a {items,total,page,limit} envelope) — see DECISIONS.md', async () => {
    const { agent, user } = await studentAgent('history-shape');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    await createTestSessionDirect(user, questions, { mode: 'practice', filters: { subjectIds: [subject.id], systemIds: null, pool: 'all' } });

    const res = await agent.get('/api/v1/qbank/tests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('includes sessions of EVERY status, including in_progress (frontend resume-detection reliance)', async () => {
    const { agent, user } = await studentAgent('history-allstatus');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 6);

    const inProgress = await createTestSessionDirect(user, questions.slice(0, 2), { mode: 'practice' });
    const completedSession = await createTestSessionDirect(user, questions.slice(2, 4), { mode: 'exam' });
    await agent.post(`/api/v1/qbank/tests/${completedSession.id}/submit`);
    const abandonedSession = await createTestSessionDirect(user, questions.slice(4, 6), { mode: 'practice' });
    await agent.post(`/api/v1/qbank/tests/${abandonedSession.id}/abandon`);

    const res = await agent.get('/api/v1/qbank/tests');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s.id);
    expect(ids).toContain(inProgress.id);
    expect(ids).toContain(completedSession.id);
    expect(ids).toContain(abandonedSession.id);

    const active = res.body.data.find((s) => s.status === 'in_progress');
    expect(active).toBeTruthy();
    expect(active.id).toBe(inProgress.id);
  });

  test('row shape: mode, date (startedAt/completedAt), score, filters used', async () => {
    const { agent, user } = await studentAgent('history-fields');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const session = await createTestSessionDirect(user, questions, {
      mode: 'exam',
      examCategory: 'NRE1',
      filters: { subjectIds: [subject.id], systemIds: [system.id], pool: 'unused' },
    });
    await agent.post(`/api/v1/qbank/tests/${session.id}/submit`);

    const res = await agent.get('/api/v1/qbank/tests');
    const row = res.body.data.find((s) => s.id === session.id);
    expect(row.mode).toBe('exam');
    expect(row.examCategory).toBe('NRE1');
    expect(row.startedAt).toBeTruthy();
    expect(row.completedAt).toBeTruthy();
    expect(typeof row.scorePercent).toBe('number');
    expect(row.filters).toEqual({ subjectIds: [subject.id], systemIds: [system.id], pool: 'unused' });
    expect(row.questions).toBeUndefined(); // history rows omit the heavy per-question payload
  });

  test('scoped to the requesting user only — never leaks another user\'s sessions', async () => {
    const { user: otherUser } = await studentAgent('history-other');
    const { agent: myAgent } = await studentAgent('history-me');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 2);
    const otherSession = await createTestSessionDirect(otherUser, questions, { mode: 'practice' });

    const res = await myAgent.get('/api/v1/qbank/tests');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s.id);
    expect(ids).not.toContain(otherSession.id);
  });

  test('newest-first ordering by startedAt', async () => {
    const { agent, user } = await studentAgent('history-order');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 4);
    const older = await createTestSessionDirect(user, questions.slice(0, 2), { mode: 'practice', startedAt: new Date(Date.now() - 60000) });
    const newer = await createTestSessionDirect(user, questions.slice(2, 4), { mode: 'practice', startedAt: new Date() });

    const res = await agent.get('/api/v1/qbank/tests');
    const ids = res.body.data.map((s) => s.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  test('?limit= is applied as a real server-side cap (defense-in-depth, still a flat array)', async () => {
    const { agent, user } = await studentAgent('history-limit');
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 6);
    await createTestSessionDirect(user, questions.slice(0, 2), { mode: 'practice' });
    await createTestSessionDirect(user, questions.slice(2, 4), { mode: 'practice' });
    await createTestSessionDirect(user, questions.slice(4, 6), { mode: 'practice' });

    const res = await agent.get('/api/v1/qbank/tests?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('no auth -> 401', async () => {
    const res = await request(app).get('/api/v1/qbank/tests');
    expect(res.status).toBe(401);
  });
});
