// server/tests/admin/reports.test.js
// GET /api/v1/admin/reports (docs/07_EXECUTION_PLAN.md 11.5, "reports"
// half — see services/adminReportsService.js's own header for the
// documented docs/04_API_SPEC.md §7 one-combined-endpoint contract-drift
// note).
//
// TESTING-STRATEGY NOTE (judgment call, same underlying reason as
// tests/admin/dashboard.test.js's own header — read that first): every
// field this endpoint returns is a GLOBAL, unscoped aggregate over the
// entire orders/enrollments/test_sessions/test_attempt_questions tables,
// which this shared jest --runInBand test DB (migrated fresh once per whole
// run, never truncated between files) accumulates across every other test
// file's own fixtures too. Three different, still-fully-deterministic
// strategies are used below depending on which is the best fit per field:
//   1. DELTA (before/after real GET calls straddling known fixture inserts)
//      for pure SUMS/COUNTS, where adding a known quantity always changes
//      the total by exactly that quantity regardless of pre-existing rows
//      (revenueByMonth, totalQuestionsAttempted, activePracticeCandidates).
//   2. LARGE MARGIN (a deliberately oversized fixture count that no other
//      single test file in this codebase plausibly approaches for one
//      freshly-created, never-shared entity) for RANKED/CAPPED lists, where
//      "will my fixture make the cut" is the only real risk
//      (topSubjectsAttempted, topStudents).
//   3. LOOK UP BY (unique) KEY for UNBOUNDED, non-capped per-entity lists,
//      where cross-test contamination of one fresh entity's own row is
//      structurally impossible (`createCourse()`/`createSubject()` always
//      insert a brand-new, never-shared row) — enrollmentsByCourse.
// `averagePassRate` (a true AVERAGE, not delta-safe — adding rows changes
// an average non-additively) is instead checked against an INDEPENDENTLY
// written raw Sequelize query run at the same moment as the real request,
// proving the endpoint's own aggregation matches a straightforward
// from-spec equivalent over whatever the live DB currently contains.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { Op, fn, col } from 'sequelize';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createCourse, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions, createTestSessionDirect } from '../helpers/qbankFixtures.js';
import { createActiveEnrollment, createUserDailyStat } from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, Order, TestSession, TestAttemptQuestion } = db;

afterAll(async () => {
  await sequelize.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let invoiceCounter = 0;
function uniqueInvoiceNo() {
  invoiceCounter += 1;
  return `INVRPT${Date.now().toString(36)}${invoiceCounter}`;
}

/** Creates an order row directly via the model layer (bypasses the real checkout flow — these tests exercise the ADMIN reports endpoint, not order creation itself). Mirrors tests/admin/dashboard.test.js's own identical helper. */
async function createOrder(user, course, overrides = {}) {
  const finalAmount = overrides.finalAmount ?? Number(course.price);
  return Order.create({
    invoiceNo: uniqueInvoiceNo(),
    userId: user.id,
    courseId: course.id,
    amount: finalAmount,
    discountAmount: 0,
    finalAmount,
    currency: course.currency,
    gateway: 'mock',
    status: 'pending',
    paidAt: null,
    ...overrides,
  });
}

function monthLabel(d) {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

describe('GET /api/v1/admin/reports', () => {
  test('revenueByMonth: 12 zero-filled chronological entries ending this month; this-month revenue/ordersCount delta matches seeded paid orders exactly', async () => {
    const { agent } = await createAdminSession(app);
    const before = await agent.get('/api/v1/admin/reports');
    expect(before.status).toBe(200);
    expect(before.body.data.revenueByMonth.length).toBe(12);

    const label = monthLabel(new Date());
    expect(before.body.data.revenueByMonth[11].month).toBe(label); // chronological, last entry = this month
    const beforeBucket = before.body.data.revenueByMonth.find((m) => m.month === label);

    const { user } = await createVerifiedUser({ email: uniqueEmail('rpt-rev') });
    const course = await createCourse();
    await createOrder(user, course, { finalAmount: 6000, status: 'paid', paidAt: new Date() });
    await createOrder(user, course, { finalAmount: 4500, status: 'paid', paidAt: new Date() });
    await createOrder(user, course, { finalAmount: 9999, status: 'pending' }); // must not count

    const after = await agent.get('/api/v1/admin/reports');
    expect(after.body.data.revenueByMonth.length).toBe(12);
    const afterBucket = after.body.data.revenueByMonth.find((m) => m.month === label);

    expect(afterBucket.revenue - beforeBucket.revenue).toBeCloseTo(10500, 5);
    expect(afterBucket.ordersCount - beforeBucket.ordersCount).toBe(2);
  });

  test('enrollmentsByCourse: exact row for a fresh course — activeCount excludes non-active enrollments, totalRevenue sums ALL paid orders for that course regardless of date/enrollment link', async () => {
    const { agent } = await createAdminSession(app);
    const { user } = await createVerifiedUser({ email: uniqueEmail('rpt-enr') });
    const course = await createCourse();

    await createActiveEnrollment(user, course);
    const student2 = (await createVerifiedUser({ email: uniqueEmail('rpt-enr-2') })).user;
    await createActiveEnrollment(student2, course);
    const student3 = (await createVerifiedUser({ email: uniqueEmail('rpt-enr-3') })).user;
    await createActiveEnrollment(student3, course, { status: 'expired' }); // must not count toward activeCount

    await createOrder(user, course, { finalAmount: 8000, status: 'paid', paidAt: new Date() });
    await createOrder(user, course, { finalAmount: 2000, status: 'paid', paidAt: new Date(Date.now() - 200 * DAY_MS) }); // old paid order still counts
    await createOrder(user, course, { finalAmount: 9999, status: 'failed' }); // must not count

    const res = await agent.get('/api/v1/admin/reports');
    expect(res.status).toBe(200);
    const row = res.body.data.enrollmentsByCourse.find((r) => r.courseTitle === course.title);
    expect(row).toBeTruthy();
    expect(row.activeCount).toBe(2);
    expect(row.totalRevenue).toBeCloseTo(10000, 5);
  });

  test('qbankUsage.totalQuestionsAttempted + topSubjectsAttempted: match a hand-computed 50-answered-question fixture exactly (large margin — see file header)', async () => {
    const { agent } = await createAdminSession(app);
    const before = await agent.get('/api/v1/admin/reports');
    const beforeTotal = before.body.data.qbankUsage.totalQuestionsAttempted;

    const { user } = await createVerifiedUser({ email: uniqueEmail('rpt-qbank') });
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 50, { examCategory: 'OTHER' });
    const session = await createTestSessionDirect(user, questions, {
      status: 'completed',
      completedAt: new Date(),
      examCategory: 'OTHER',
      passed: true,
      scorePercent: 70,
    });

    // Answer all 50 directly: first 35 correct, remaining 15 incorrect -> avgScore = 70%.
    const rows = await TestAttemptQuestion.findAll({ where: { testSessionId: session.id }, order: [['sortOrder', 'ASC']] });
    for (let i = 0; i < rows.length; i += 1) {
      rows[i].isCorrect = i < 35;
      rows[i].answeredAt = new Date();
       
      await rows[i].save();
    }

    const after = await agent.get('/api/v1/admin/reports');
    const qbankUsage = after.body.data.qbankUsage;
    expect(qbankUsage.totalQuestionsAttempted - beforeTotal).toBe(50);

    const subjectRow = qbankUsage.topSubjectsAttempted.find((s) => s.subject === subject.name);
    expect(subjectRow).toBeTruthy();
    expect(subjectRow.attempts).toBe(50);
    expect(subjectRow.avgScore).toBeCloseTo(70, 5);
  });

  test('qbankUsage.averagePassRate: matches an independently-written raw DB query run at the same moment (not delta-safe — see file header)', async () => {
    const { agent } = await createAdminSession(app);
    const { user } = await createVerifiedUser({ email: uniqueEmail('rpt-passrate') });
    await TestSession.create({
      userId: user.id,
      mode: 'practice',
      examCategory: 'OTHER',
      questionCount: 1,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      passed: true,
      scorePercent: 80,
    });
    await TestSession.create({
      userId: user.id,
      mode: 'practice',
      examCategory: 'OTHER',
      questionCount: 1,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      passed: false,
      scorePercent: 20,
    });
    // Must NOT affect the average: in_progress (no passed verdict yet) and a completed-but-ungraded row.
    await TestSession.create({
      userId: user.id,
      mode: 'practice',
      examCategory: 'OTHER',
      questionCount: 1,
      status: 'in_progress',
      startedAt: new Date(),
      passed: null,
    });

    const rawRow = await TestSession.findOne({
      attributes: [[fn('AVG', col('passed')), 'avgPassed']],
      where: { status: 'completed', passed: { [Op.ne]: null } },
      raw: true,
    });
    const expectedPassRate = Math.round(Number(rawRow.avgPassed) * 1000) / 10;

    const res = await agent.get('/api/v1/admin/reports');
    expect(res.status).toBe(200);
    expect(res.body.data.qbankUsage.averagePassRate).toBeCloseTo(expectedPassRate, 5);
  });

  test('qbankUsage.activePracticeCandidates: distinct-user delta over the last-30-days window (brand-new users, see file header)', async () => {
    const { agent } = await createAdminSession(app);
    const before = await agent.get('/api/v1/admin/reports');
    const beforeCount = before.body.data.qbankUsage.activePracticeCandidates;

    for (let i = 0; i < 3; i += 1) {
       
      const student = (await createVerifiedUser({ email: uniqueEmail(`rpt-active-${i}`) })).user;
       
      await TestSession.create({
        userId: student.id,
        mode: 'practice',
        examCategory: 'OTHER',
        questionCount: 1,
        status: 'in_progress',
        startedAt: new Date(),
      });
    }
    // A brand-new user whose ONLY session started 40 days ago -> must NOT count.
    const oldStudent = (await createVerifiedUser({ email: uniqueEmail('rpt-active-old') })).user;
    await TestSession.create({
      userId: oldStudent.id,
      mode: 'practice',
      examCategory: 'OTHER',
      questionCount: 1,
      status: 'in_progress',
      startedAt: new Date(Date.now() - 40 * DAY_MS),
    });

    const after = await agent.get('/api/v1/admin/reports');
    expect(after.body.data.qbankUsage.activePracticeCandidates - beforeCount).toBe(3);
  });

  test('topStudents: a fresh student with a large testsTaken margin appears with correct testsTaken/qbankAccuracy/studyHours (large margin — see file header)', async () => {
    const { agent } = await createAdminSession(app);
    const { user: student } = await createVerifiedUser({ email: uniqueEmail('rpt-top-student') });

    // 11 "empty" completed sessions (no questions) purely to inflate testsTaken well past any plausible pre-existing per-user count elsewhere in the suite.
    for (let i = 0; i < 11; i += 1) {
       
      await TestSession.create({
        userId: student.id,
        mode: 'practice',
        examCategory: 'OTHER',
        questionCount: 0,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      });
    }
    // A 12th, WITH 4 known-answered questions (3 correct, 1 incorrect) for accuracy math.
    const subject = await createSubject();
    const system = await createBodySystem();
    const questions = await createQuestions(subject, system, 4, { examCategory: 'OTHER' });
    const session = await createTestSessionDirect(student, questions, {
      status: 'completed',
      completedAt: new Date(),
      examCategory: 'OTHER',
    });
    const attemptRows = await TestAttemptQuestion.findAll({ where: { testSessionId: session.id } });
    for (let i = 0; i < attemptRows.length; i += 1) {
      attemptRows[i].isCorrect = i < 3;
      attemptRows[i].answeredAt = new Date();
       
      await attemptRows[i].save();
    }

    await createUserDailyStat(student, { qbankSeconds: 7200, videoSeconds: 3600 }); // 3.0 hours total

    const res = await agent.get('/api/v1/admin/reports');
    expect(res.status).toBe(200);
    const row = res.body.data.topStudents.find((s) => s.studentId === student.id);
    expect(row).toBeTruthy();
    expect(row.name).toBe(student.name);
    expect(row.email).toBe(student.email);
    expect(row.testsTaken).toBe(12);
    expect(row.qbankAccuracy).toBeCloseTo(75, 5);
    expect(row.studyHours).toBeCloseTo(3, 5);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/reports');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/reports');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
