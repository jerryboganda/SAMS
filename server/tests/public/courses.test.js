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
    // examCategory: 'MBBS' + an explicit `?category=` filter — deliberately
    // NOT the file's original default of 'NRE1' (2026-08-01 fix; see
    // DECISIONS.md's dated Phase 8.1 entry). An earlier, unfiltered/default
    // 'NRE1' request against page 1's default limit=100 (docs/04_API_SPEC.md
    // §2, PUBLIC_COURSES_DEFAULT_LIMIT) started intermittently failing once
    // this shared-test-DB suite (never reset between files within one run —
    // same convention meta.test.js's own header comment documents) grew
    // enough OTHER course fixtures — nearly every course-creating fixture
    // suite-wide defaults to 'NRE1' (tests/helpers/publicFixtures.js's own
    // createCourse() default) — that THIS test's own just-created course
    // (highest id at the time, since ids are auto-increment) could land
    // beyond the first 100 default-ordered rows and simply not appear in an
    // unscoped page-1 response; `?limit=` cannot fix this (capped at 100 by
    // the very next test in this file). 'MBBS' is confirmed unused by any
    // OTHER course fixture in this suite (grepped), so scoping the request
    // to it makes this test's own 2 fixtures the only possible matches,
    // regardless of how many total courses other files have created —
    // same "pick a category no other file touches" mitigation
    // tests/qbank/meta.test.js already established for this identical class
    // of shared-DB volume problem.
    const published = await createCourse({ isPublished: true, examCategory: 'MBBS' });
    const unpublished = await createCourse({ isPublished: false, examCategory: 'MBBS' });

    const res = await request(app).get('/api/v1/public/courses').query({ category: 'MBBS' });

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
        examCategory: 'MBBS',
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
