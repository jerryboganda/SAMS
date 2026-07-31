// server/tests/public/facultyFaqs.test.js
// GET /public/faculty, GET /public/faqs (docs/04_API_SPEC.md §2, task 3.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createFaculty, createFaq } from '../helpers/publicFixtures.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/public/faculty', () => {
  test('happy path: returns only active faculty as a flat array, ordered by sortOrder', async () => {
    const second = await createFaculty({ isActive: true, sortOrder: 2 });
    const first = await createFaculty({ isActive: true, sortOrder: 1 });
    const inactive = await createFaculty({ isActive: false, sortOrder: 0 });

    const res = await request(app).get('/api/v1/public/faculty');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = res.body.data.map((f) => f.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids).not.toContain(inactive.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));

    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        title: expect.anything(),
        bio: expect.anything(),
        photoUrl: expect.anything(),
        sortOrder: expect.any(Number),
        isActive: true,
      })
    );
  });
});

describe('GET /api/v1/public/faqs', () => {
  test('happy path: returns only active faqs as a flat array, ordered by sortOrder', async () => {
    const active = await createFaq({ isActive: true });
    const inactive = await createFaq({ isActive: false });

    const res = await request(app).get('/api/v1/public/faqs');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = res.body.data.map((f) => f.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(inactive.id);
  });
});
