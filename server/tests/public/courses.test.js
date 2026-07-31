// server/tests/public/courses.test.js
// GET /public/courses (docs/04_API_SPEC.md §2, task 3.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/public/courses', () => {
  test('happy path: lists published courses only, shape matches the Course TS contract', async () => {
    const published = await createCourse({ isPublished: true, examCategory: 'NRE1' });
    const unpublished = await createCourse({ isPublished: false, examCategory: 'NRE1' });

    const res = await request(app).get('/api/v1/public/courses');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // client/src/api/endpoints/public.ts's getCourses() expects a flat
    // Course[] (apiFetch<Course[]>), not a {items,total,page,limit} envelope
    // — see DECISIONS.md 2026-07-31 (Phase 3.1).
    expect(Array.isArray(res.body.data)).toBe(true);

    const ids = res.body.data.map((c) => c.id);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(unpublished.id);

    const row = res.body.data.find((c) => c.id === published.id);
    expect(row).toEqual(
      expect.objectContaining({
        id: published.id,
        title: published.title,
        slug: published.slug,
        examCategory: 'NRE1',
        includesQBank: true,
        isPublished: true,
        lecturesCount: expect.any(Number),
      })
    );
    expect(typeof row.price).toBe('number');
  });

  test('?category= filters on examCategory', async () => {
    const smle = await createCourse({ isPublished: true, examCategory: 'SMLE' });
    const nre = await createCourse({ isPublished: true, examCategory: 'NRE1' });

    const res = await request(app).get('/api/v1/public/courses').query({ category: 'SMLE' });

    expect(res.status).toBe(200);
    const ids = res.body.data.map((c) => c.id);
    expect(ids).toContain(smle.id);
    expect(ids).not.toContain(nre.id);
  });

  test('validation: an invalid category value is rejected with 422', async () => {
    const res = await request(app).get('/api/v1/public/courses').query({ category: 'NOT_A_REAL_CATEGORY' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation: limit above 100 is rejected with 422', async () => {
    const res = await request(app).get('/api/v1/public/courses').query({ limit: '101' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
