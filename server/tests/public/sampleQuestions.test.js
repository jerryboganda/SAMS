// server/tests/public/sampleQuestions.test.js
// GET /public/sample-questions (docs/04_API_SPEC.md §2 + §8 "Answer secrecy", task 3.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createSubject, createBodySystem, createQuestionWithOptions } from '../helpers/publicFixtures.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

// Recursively scans an arbitrary JSON value for an `isCorrect`/`is_correct`
// key at any depth — the acceptance criteria explicitly calls for a deep
// scan, not just a top-level field check.
function findForbiddenKey(value, path = '$') {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, val] of Object.entries(value)) {
    if (key === 'isCorrect' || key === 'is_correct') return `${path}.${key}`;
    const hit = findForbiddenKey(val, `${path}.${key}`);
    if (hit) return hit;
  }
  return null;
}

describe('GET /api/v1/public/sample-questions', () => {
  test('happy path: returns up to 5 active questions with options, and never leaks is_correct anywhere', async () => {
    const subject = await createSubject();
    const system = await createBodySystem();
    await createQuestionWithOptions({ subject, system, correctIndex: 1 });
    await createQuestionWithOptions({ subject, system, correctIndex: 2 });

    const res = await request(app).get('/api/v1/public/sample-questions');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.length).toBeLessThanOrEqual(5);

    // Deep-scan the ENTIRE response body (not just res.body.data).
    const forbiddenHit = findForbiddenKey(res.body);
    expect(forbiddenHit).toBeNull();

    const question = res.body.data[0];
    expect(question).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        stem: expect.any(String),
        options: expect.any(Array),
        difficulty: expect.any(String),
      })
    );
    expect(question.options.length).toBeGreaterThan(0);
    for (const opt of question.options) {
      expect(opt).not.toHaveProperty('isCorrect');
      expect(opt).not.toHaveProperty('is_correct');
    }
  });

  test('inactive questions are never included', async () => {
    const subject = await createSubject();
    const system = await createBodySystem();
    const { question: inactiveQuestion } = await createQuestionWithOptions({
      subject,
      system,
      overrides: { isActive: false },
    });

    const res = await request(app).get('/api/v1/public/sample-questions');

    const ids = res.body.data.map((q) => q.id);
    expect(ids).not.toContain(inactiveQuestion.id);
  });
});
