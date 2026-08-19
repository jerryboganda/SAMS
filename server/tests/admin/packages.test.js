// server/tests/admin/packages.test.js
// Admin subscription packages CRUD & public listing test suite (docs/04_API_SPEC.md §7 "Packages").
// Mirrors established supertest conventions in tests/admin/courses.test.js & coupons.test.js.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, SubscriptionPackage } = db;

afterAll(async () => {
  await sequelize.close();
});

let pkgCounter = 0;
function uniquePackageSlug(prefix = 'pkg') {
  pkgCounter += 1;
  return `${prefix}-${Date.now()}-${pkgCounter}`;
}

async function createTestPackage(overrides = {}) {
  const slug = uniquePackageSlug('pkg');
  return SubscriptionPackage.create({
    title: `Package ${slug}`,
    slug,
    description: 'Comprehensive test package description.',
    examCategory: 'NRE1',
    price: 20000,
    originalPrice: 30000,
    currency: 'PKR',
    validityDays: 180,
    includedCourseIds: [],
    includesQbank: true,
    includesMockExams: true,
    maxDevices: 2,
    features: ['Feature 1', 'Feature 2'],
    badge: 'Special',
    sortOrder: 0,
    isActive: true,
    isPopular: false,
    ...overrides,
  });
}

describe('GET /api/v1/admin/packages', () => {
  test('happy path: returns list of packages with attached includedCourses populated from course IDs', async () => {
    const { agent } = await createAdminSession(app);
    const course1 = await createCourse();
    const course2 = await createCourse();

    const pkg = await createTestPackage({
      includedCourseIds: [course1.id, course2.id],
    });

    const res = await agent.get('/api/v1/admin/packages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const found = res.body.data.find((p) => p.id === pkg.id);
    expect(found).toBeDefined();
    expect(found.includedCourseIds).toEqual([course1.id, course2.id]);
    expect(Array.isArray(found.includedCourses)).toBe(true);
    expect(found.includedCourses.length).toBe(2);

    const courseIdsInPkg = found.includedCourses.map((c) => c.id);
    expect(courseIdsInPkg).toContain(course1.id);
    expect(courseIdsInPkg).toContain(course2.id);

    const matchedCourse1 = found.includedCourses.find((c) => c.id === course1.id);
    expect(matchedCourse1.title).toBe(course1.title);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/packages');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/packages');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/packages', () => {
  test('happy path: creates package with multi-course bundle and writes audit log', async () => {
    const { agent, user } = await createAdminSession(app);
    const course1 = await createCourse();
    const course2 = await createCourse();
    const slug = uniquePackageSlug('bundle');

    const payload = {
      title: 'Full Exam Bundle',
      slug,
      description: 'Full preparation package with video courses and question bank',
      examCategory: 'NRE1',
      price: 25000,
      originalPrice: 35000,
      currency: 'PKR',
      validityDays: 180,
      includedCourseIds: [course1.id, course2.id],
      includesQbank: true,
      includesMockExams: true,
      maxDevices: 2,
      features: ['Feature 1', 'Feature 2'],
      badge: 'Most Popular',
      isPopular: true,
      sortOrder: 1,
    };

    const res = await agent.post('/api/v1/admin/packages').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Full Exam Bundle');
    expect(res.body.data.slug).toBe(slug);
    expect(res.body.data.price).toBe(25000);
    expect(res.body.data.originalPrice).toBe(35000);
    expect(res.body.data.validityDays).toBe(180);
    expect(res.body.data.features).toEqual(['Feature 1', 'Feature 2']);
    expect(res.body.data.badge).toBe('Most Popular');
    expect(res.body.data.isPopular).toBe(true);
    expect(res.body.data.includedCourseIds).toEqual([course1.id, course2.id]);
    expect(res.body.data.includedCourses.length).toBe(2);

    const dbRow = await SubscriptionPackage.findByPk(res.body.data.id);
    expect(dbRow).not.toBeNull();
    expect(Number(dbRow.price)).toBe(25000);
    expect(dbRow.badge).toBe('Most Popular');

    const auditRow = await AuditLog.findOne({
      where: { action: 'package.create', entityId: res.body.data.id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('slug collision: duplicate slug → 409 SLUG_EXISTS', async () => {
    const { agent } = await createAdminSession(app);
    const slug = uniquePackageSlug('dup');
    await createTestPackage({ slug });

    const res = await agent.post('/api/v1/admin/packages').send({
      title: 'Duplicate Slug Package',
      slug,
      price: 20000,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_EXISTS');
  });

  test('validation failure: missing title → 422 VALIDATION_ERROR', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/packages').send({
      price: 20000,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation failure: negative price → 422 VALIDATION_ERROR', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/packages').send({
      title: 'Negative Price Package',
      price: -500,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/packages').send({
      title: 'No Auth Package',
      price: 15000,
    });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/packages').send({
      title: 'Student Created Package',
      price: 15000,
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/packages/:id', () => {
  test('happy path: returns package by ID', async () => {
    const { agent } = await createAdminSession(app);
    const pkg = await createTestPackage({
      title: 'Specific Package ID Test',
      price: 18000,
    });

    const res = await agent.get(`/api/v1/admin/packages/${pkg.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(pkg.id);
    expect(res.body.data.title).toBe('Specific Package ID Test');
    expect(res.body.data.price).toBe(18000);
  });

  test('not found: unknown ID → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/packages/9999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PUT /api/v1/admin/packages/:id', () => {
  test('happy path: updates price, validityDays, features, badge and audit logs', async () => {
    const { agent, user } = await createAdminSession(app);
    const pkg = await createTestPackage({
      price: 20000,
      validityDays: 90,
      features: ['Initial Feature'],
      badge: 'Initial Badge',
    });

    const updatePayload = {
      price: 32000,
      validityDays: 365,
      features: ['Updated Feature 1', 'Updated Feature 2'],
      badge: 'Best Value',
    };

    const res = await agent.put(`/api/v1/admin/packages/${pkg.id}`).send(updatePayload);
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(32000);
    expect(res.body.data.validityDays).toBe(365);
    expect(res.body.data.features).toEqual(['Updated Feature 1', 'Updated Feature 2']);
    expect(res.body.data.badge).toBe('Best Value');

    const dbRow = await SubscriptionPackage.findByPk(pkg.id);
    expect(Number(dbRow.price)).toBe(32000);
    expect(dbRow.validityDays).toBe(365);
    expect(dbRow.badge).toBe('Best Value');

    const auditRow = await AuditLog.findOne({
      where: { action: 'package.update', entityId: pkg.id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('slug collision on edit: changing slug to another existing package → 409', async () => {
    const { agent } = await createAdminSession(app);
    const pkg1 = await createTestPackage({ slug: uniquePackageSlug('edit-slug-1') });
    const pkg2 = await createTestPackage({ slug: uniquePackageSlug('edit-slug-2') });

    const res = await agent.put(`/api/v1/admin/packages/${pkg2.id}`).send({
      slug: pkg1.slug,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_EXISTS');
  });

  test('not found: unknown ID → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/packages/9999999').send({
      price: 25000,
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/admin/packages/:id/toggle', () => {
  test('happy path: toggles isActive from true to false and back to true, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const pkg = await createTestPackage({ isActive: true });

    const firstToggle = await agent.post(`/api/v1/admin/packages/${pkg.id}/toggle`);
    expect(firstToggle.status).toBe(200);
    expect(firstToggle.body.data.isActive).toBe(false);

    const secondToggle = await agent.post(`/api/v1/admin/packages/${pkg.id}/toggle`);
    expect(secondToggle.status).toBe(200);
    expect(secondToggle.body.data.isActive).toBe(true);

    const dbRow = await SubscriptionPackage.findByPk(pkg.id);
    expect(dbRow.isActive).toBe(true);

    const auditRow = await AuditLog.findOne({
      where: { action: 'package.toggle', entityId: pkg.id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });
});

describe('DELETE /api/v1/admin/packages/:id', () => {
  test('happy path: deletes package from DB and writes audit log', async () => {
    const { agent, user } = await createAdminSession(app);
    const pkg = await createTestPackage();

    const res = await agent.delete(`/api/v1/admin/packages/${pkg.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const dbRow = await SubscriptionPackage.findByPk(pkg.id);
    expect(dbRow).toBeNull();

    const auditRow = await AuditLog.findOne({
      where: { action: 'package.delete', entityId: pkg.id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });
});

describe('GET /api/v1/packages (public)', () => {
  test('happy path: returns only active packages and does not require auth', async () => {
    const activePkg = await createTestPackage({
      title: 'Public Active Package',
      isActive: true,
    });
    const inactivePkg = await createTestPackage({
      title: 'Public Inactive Package',
      isActive: false,
    });

    const res = await request(app).get('/api/v1/packages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const ids = res.body.data.map((p) => p.id);
    expect(ids).toContain(activePkg.id);
    expect(ids).not.toContain(inactivePkg.id);

    // Verify attached course populated in public listing
    const foundActive = res.body.data.find((p) => p.id === activePkg.id);
    expect(foundActive).toBeDefined();
    expect(Array.isArray(foundActive.includedCourses)).toBe(true);
  });
});
