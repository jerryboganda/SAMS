// server/tests/models.smoke.test.js
// Phase 1 smoke test: loads real models directly (no HTTP layer — full
// endpoint tests come in later phases) against the freshly-migrated
// DB_NAME_test database (see tests/globalSetup.cjs) and confirms the
// Sequelize model layer + associations actually work end-to-end.
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import bcrypt from 'bcrypt';
import db from '../src/models/index.js';

const { User, Course, Enrollment, Subject, BodySystem, sequelize } = db;

describe('Phase 1 models + associations smoke test', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('creates a user + course, enrolls the user, and association getters resolve', async () => {
    const user = await User.create({
      name: 'Smoke Test User',
      email: `smoke-user-${Date.now()}@example.test`,
      passwordHash: bcrypt.hashSync('Password@123', 4),
      role: 'student',
      status: 'active',
    });

    const course = await Course.create({
      title: 'Smoke Test Course',
      slug: `smoke-test-course-${Date.now()}`,
      examCategory: 'OTHER',
      price: 1000,
      validityDays: 30,
    });

    const enrollment = await Enrollment.create({
      userId: user.id,
      courseId: course.id,
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
    });

    // belongsTo/hasMany association mixins, generated from the `as` aliases
    // wired in src/models/*.js's associate() functions.
    const userEnrollments = await user.getEnrollments();
    expect(userEnrollments).toHaveLength(1);
    expect(userEnrollments[0].id).toBe(enrollment.id);

    const enrolledCourse = await userEnrollments[0].getCourse();
    expect(enrolledCourse.slug).toBe(course.slug);

    const courseOwner = await enrollment.getUser();
    expect(courseOwner.email).toBe(user.email);
  });

  test('QBank taxonomy models (Subject, BodySystem) are queryable', async () => {
    const subject = await Subject.create({ name: `Smoke Subject ${Date.now()}` });
    const system = await BodySystem.create({ name: `Smoke System ${Date.now()}` });

    expect(await Subject.count()).toBeGreaterThanOrEqual(1);
    expect(await BodySystem.count()).toBeGreaterThanOrEqual(1);
    expect(subject.id).toBeGreaterThan(0);
    expect(system.id).toBeGreaterThan(0);
  });
});
