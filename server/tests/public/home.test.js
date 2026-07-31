// server/tests/public/home.test.js
// GET /public/home (docs/04_API_SPEC.md §2, task 3.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createFaculty, createFaq } from '../helpers/publicFixtures.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/public/home', () => {
  test('happy path: returns featured courses, faculty preview, faqs preview, and stats', async () => {
    await createCourse({ isPublished: true });
    await createFaculty({ isActive: true });
    await createFaq({ isActive: true });

    const res = await request(app).get('/api/v1/public/home');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.featuredCourses)).toBe(true);
    expect(Array.isArray(res.body.data.faculty)).toBe(true);
    expect(Array.isArray(res.body.data.faqs)).toBe(true);
    expect(res.body.data.stats).toEqual(
      expect.objectContaining({
        coursesCount: expect.any(Number),
        questionsCount: expect.any(Number),
        facultyCount: expect.any(Number),
        videoLecturesCount: expect.any(Number),
      })
    );

    // Featured course rows must match client/src/types/index.ts's `Course`
    // field casing exactly (`includesQBank`, not the model's `includesQbank`).
    if (res.body.data.featuredCourses.length > 0) {
      const course = res.body.data.featuredCourses[0];
      expect(course).toHaveProperty('includesQBank');
      expect(course).not.toHaveProperty('includesQbank');
    }
  });

  test('unpublished courses never appear in the featured list', async () => {
    const unpublished = await createCourse({ isPublished: false });

    const res = await request(app).get('/api/v1/public/home');

    expect(res.status).toBe(200);
    const ids = res.body.data.featuredCourses.map((c) => c.id);
    expect(ids).not.toContain(unpublished.id);
  });

  test('inactive faculty/faqs never appear in the preview lists', async () => {
    const inactiveFaculty = await createFaculty({ isActive: false });
    const inactiveFaq = await createFaq({ isActive: false });

    const res = await request(app).get('/api/v1/public/home');

    expect(res.body.data.faculty.map((f) => f.id)).not.toContain(inactiveFaculty.id);
    expect(res.body.data.faqs.map((f) => f.id)).not.toContain(inactiveFaq.id);
  });
});
