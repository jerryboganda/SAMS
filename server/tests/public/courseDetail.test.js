// server/tests/public/courseDetail.test.js
// GET /public/courses/:slug (docs/04_API_SPEC.md §2, task 3.1).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../helpers/publicFixtures.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/public/courses/:slug', () => {
  test('happy path: returns course + sections + lectures; free-preview unlocked, others locked; no video refs leaked', async () => {
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course, { sortOrder: 0 });
    const freeLecture = await createLecture(course, section, { isFreePreview: true, sortOrder: 0, durationSeconds: 300 });
    const lockedLecture = await createLecture(course, section, { isFreePreview: false, sortOrder: 1, durationSeconds: 900 });

    const res = await request(app).get(`/api/v1/public/courses/${course.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.course.id).toBe(course.id);
    expect(res.body.data.course.lecturesCount).toBe(2);
    expect(res.body.data.course.totalDurationSeconds).toBe(1200);
    expect(res.body.data.course.sectionsCount).toBe(1);

    const sections = res.body.data.sections;
    expect(sections).toHaveLength(1);
    const lectures = sections[0].lectures;
    const free = lectures.find((l) => l.id === freeLecture.id);
    const locked = lectures.find((l) => l.id === lockedLecture.id);
    expect(free.isFreePreview).toBe(true);
    expect(free.locked).toBe(false);
    expect(locked.isFreePreview).toBe(false);
    expect(locked.locked).toBe(true);
    // Playback refs/provider are never exposed on the public catalog route —
    // only the signed /student/lectures/:id/play endpoint (Phase 5) may.
    expect(free).not.toHaveProperty('videoRef');
    expect(free).not.toHaveProperty('videoProvider');
  });

  test('unpublished course 404s (does not leak existence)', async () => {
    const course = await createCourse({ isPublished: false });

    const res = await request(app).get(`/api/v1/public/courses/${course.slug}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('unknown slug 404s with the identical error shape as an unpublished course', async () => {
    const res = await request(app).get('/api/v1/public/courses/this-slug-does-not-exist-at-all');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('validation: an empty slug segment is rejected before hitting the DB', async () => {
    const res = await request(app).get('/api/v1/public/courses/%20');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
