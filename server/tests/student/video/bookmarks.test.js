// server/tests/student/video/bookmarks.test.js
// POST/DELETE /api/v1/student/lectures/:id/bookmark + GET
// /api/v1/student/bookmarks/lectures (docs/04_API_SPEC.md §3,
// docs/07_EXECUTION_PLAN.md 5.3).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import db from '../../../src/models/index.js';
import { createCourse, createSection, createLecture } from '../../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../../helpers/loginFlow.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('lecture bookmarks', () => {
  test('POST adds a bookmark; GET list includes it; DELETE removes it; GET list no longer includes it', async () => {
    const email = uniqueEmail('bookmark-toggle');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-bookmark-toggle' });

    const add = await agent.post(`/api/v1/student/lectures/${lecture.id}/bookmark`);
    expect(add.status).toBe(201);
    expect(add.body.data.isBookmarked).toBe(true);

    const listAfterAdd = await agent.get('/api/v1/student/bookmarks/lectures');
    expect(listAfterAdd.status).toBe(200);
    expect(listAfterAdd.body.data.map((l) => l.id)).toContain(lecture.id);
    expect(listAfterAdd.body.data.find((l) => l.id === lecture.id).isBookmarked).toBe(true);

    const remove = await agent.delete(`/api/v1/student/lectures/${lecture.id}/bookmark`);
    expect(remove.status).toBe(200);
    expect(remove.body.data.isBookmarked).toBe(false);

    const listAfterRemove = await agent.get('/api/v1/student/bookmarks/lectures');
    expect(listAfterRemove.status).toBe(200);
    expect(listAfterRemove.body.data.map((l) => l.id)).not.toContain(lecture.id);
  });

  test('POST is idempotent — bookmarking twice does not error or duplicate', async () => {
    const email = uniqueEmail('bookmark-idempotent');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-bookmark-idempotent' });

    const first = await agent.post(`/api/v1/student/lectures/${lecture.id}/bookmark`);
    const second = await agent.post(`/api/v1/student/lectures/${lecture.id}/bookmark`);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const list = await agent.get('/api/v1/student/bookmarks/lectures');
    const matches = list.body.data.filter((l) => l.id === lecture.id);
    expect(matches).toHaveLength(1);
  });

  test('DELETE on a never-bookmarked lecture is a harmless no-op (still 200, isBookmarked:false)', async () => {
    const email = uniqueEmail('bookmark-delete-noop');
    const { user } = await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    await createActiveEnrollment(user, course);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-bookmark-delete-noop' });

    const res = await agent.delete(`/api/v1/student/lectures/${lecture.id}/bookmark`);
    expect(res.status).toBe(200);
    expect(res.body.data.isBookmarked).toBe(false);
  });

  test('not enrolled -> 403 NOT_ENROLLED (same gate as /play)', async () => {
    const email = uniqueEmail('bookmark-notenrolled');
    await createVerifiedUser({ email });
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-bookmark-notenrolled' });

    const res = await agent.post(`/api/v1/student/lectures/${lecture.id}/bookmark`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  test('no auth at all -> 401 UNAUTHENTICATED for both bookmark and the list endpoint', async () => {
    const course = await createCourse({ isPublished: true });
    const section = await createSection(course);
    const lecture = await createLecture(course, section);

    const bookmarkRes = await request(app).post(`/api/v1/student/lectures/${lecture.id}/bookmark`);
    expect(bookmarkRes.status).toBe(401);
    expect(bookmarkRes.body.error.code).toBe('UNAUTHENTICATED');

    const listRes = await request(app).get('/api/v1/student/bookmarks/lectures');
    expect(listRes.status).toBe(401);
    expect(listRes.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('validation: a non-numeric lecture id is rejected with 422', async () => {
    const email = uniqueEmail('bookmark-validation');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-bookmark-validation' });

    const res = await agent.post('/api/v1/student/lectures/not-a-number/bookmark');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
