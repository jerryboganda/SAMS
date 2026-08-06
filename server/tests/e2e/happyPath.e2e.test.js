// server/tests/e2e/happyPath.e2e.test.js
// Phase 13.2 — the single-command, supertest-driven E2E happy path
// docs/08_TESTING_QA.md §1 describes: "visitor -> register -> verify ->
// login -> buy(mock) -> watch(mock video) -> QBank test -> mock exam ->
// analytics -> admin approves a bank order -> admin resets devices."
//
// Follows this codebase's established `*.e2e.test.js` pattern/style (see
// tests/checkout/mockFlow.e2e.test.js and
// tests/checkout/bankTransferFlow.e2e.test.js): real HTTP round trips via
// supertest, asserting real response shapes/status codes plus DB state at
// each step — never "didn't throw" alone.
//
// Deliberately ONE continuous, stateful test (not independent `describe`
// blocks re-deriving state): the SAME user registers -> verifies -> logs in
// -> buys a REAL course via the mock gateway -> that purchase creates a REAL
// enrollment -> the enrollment unlocks a REAL lecture (/play + heartbeat) ->
// a REAL QBank test tied to the course's own exam category -> a REAL
// (admin-published) mock exam -> the analytics endpoint reflects the REAL
// activity just generated. The admin bank-transfer-approval + device-reset
// half is a genuinely separate, admin-side flow (per the task brief, "can be
// a fresh fixture") — a second student fixture is used for the bank-transfer
// order itself, but the FINAL reset-devices call targets the SAME first
// (main) student, closing the loop back to the primary narrative.
//
// Run in isolation: `npm run test:e2e --prefix server` (server/package.json).
// Also runs as part of the full `npm run test --prefix server` suite (same
// *.test.js glob every other test file matches).
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { env } from '../../src/config/env.js';
import { createCourse, createSection, createLecture, createSubject, createBodySystem } from '../helpers/publicFixtures.js';
import { createQuestions } from '../helpers/qbankFixtures.js';
import { createMockExam, attachQuestionsToMockExam } from '../helpers/mockExamFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { extractVerifyEmailToken, extractReverifyCode } from '../helpers/loginFlow.js';
import { createAdminSession } from '../helpers/adminSession.js';

const { sequelize, User, Order, Enrollment, UserDevice, RefreshToken, AuditLog, QuestionOption, Setting } = db;

// A minimal, valid 1x1 PNG (real magic bytes) — same fixture
// tests/admin/uploads.test.js / tests/checkout/bankTransferFlow.e2e.test.js
// already use for proof-image uploads.
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

// env.PAYMENTS_ENABLED_GATEWAYS is mutated for this file only and restored
// afterward — same pattern tests/checkout/bankTransferFlow.e2e.test.js /
// tests/checkout/jazzcashFlow.e2e.test.js already use for env-gated drivers.
const originalPaymentsEnabledGateways = env.PAYMENTS_ENABLED_GATEWAYS;

beforeAll(async () => {
  env.PAYMENTS_ENABLED_GATEWAYS = 'mock,bank_transfer';
  await Setting.upsert({
    key: 'payments',
    value: {
      bankName: 'Meezan Bank Limited, Main Campus Branch',
      accountTitle: 'SAMS ACADEMY PRIVATE LIMITED',
      iban: 'PK36MEZN0001020304050607',
      accountNumber: '01020304050607',
      branchCode: '0001',
    },
  });
});

afterAll(async () => {
  env.PAYMENTS_ENABLED_GATEWAYS = originalPaymentsEnabledGateways;
  await sequelize.close();
});

describe('Phase 13.2 E2E happy path', () => {
  test(
    'visitor -> register -> verify -> login -> buy(mock) -> watch -> QBank test -> mock exam -> analytics -> admin approves bank order -> admin resets devices',
    async () => {
      // ---- Fixtures: the REAL course this same user will buy ---------------
      const course = await createCourse({ examCategory: 'NRE1', includesQbank: true, price: 15000, validityDays: 180 });
      const section = await createSection(course);
      const lecture = await createLecture(course, section, { durationSeconds: 600 });

      const subject = await createSubject();
      const system = await createBodySystem();
      // A SEPARATE subject/system for the mock-exam's own question pool —
      // keeps the two pools disjoint so the QBank test's `pool:'all'`
      // ORDER BY RAND() LIMIT 5 selection (scoped to `subject`/`system`
      // below) can only ever draw from `qbankQuestions`, never accidentally
      // from `mockExamQuestions` (both would otherwise satisfy the same
      // examCategory='NRE1' filter).
      const mockSubject = await createSubject();
      const mockSystem = await createBodySystem();
      const qbankQuestions = await createQuestions(subject, system, 5);
      const mockExamQuestions = await createQuestions(mockSubject, mockSystem, 5);
      const mockExam = await createMockExam({ examCategory: 'NRE1', durationMinutes: 30, passPercent: 60, isPublished: true });
      await attachQuestionsToMockExam(mockExam, mockExamQuestions);

      // ---- 1. Register ------------------------------------------------------
      const email = uniqueEmail('e2e-happy');
      const password = DEFAULT_TEST_PASSWORD;
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'E2E Happy Path Student', email, password });
      expect(registerRes.status).toBe(201);
      expect(registerRes.body.success).toBe(true);

      // ---- 2. Verify email ----------------------------------------------------
      const verifyToken = extractVerifyEmailToken(email);
      const verifyRes = await request(app).post('/api/v1/auth/verify-email').send({ token: verifyToken });
      expect(verifyRes.status).toBe(200);

      const user = await User.findOne({ where: { email } });
      expect(user).not.toBeNull();
      expect(user.status).toBe('active');

      // ---- 3. Login (a genuinely brand-new device -> mandatory reverify) ----
      const agent = request.agent(app);
      const userAgent = 'jest-e2e-happy-device/1.0';
      const loginRes = await agent.post('/api/v1/auth/login').set('User-Agent', userAgent).send({ email, password });
      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error.code).toBe('REVERIFY_REQUIRED');

      const reverifyCode = extractReverifyCode(email);
      const reverifyRes = await agent
        .post('/api/v1/auth/reverify')
        .set('User-Agent', userAgent)
        .send({ email, code: reverifyCode });
      expect(reverifyRes.status).toBe(200);
      expect(reverifyRes.body.data.user.email).toBe(email);

      // ---- 4. Buy the course via the REAL mock-gateway checkout flow -------
      const quoteRes = await agent.post('/api/v1/checkout/quote').send({ courseId: course.id });
      expect(quoteRes.status).toBe(200);
      expect(quoteRes.body.data.finalAmount).toBe(15000);

      const orderRes = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
      expect(orderRes.status).toBe(201);
      const { order, redirectUrl } = orderRes.body.data;
      expect(order.status).toBe('pending');

      const returnUrl = new URL(redirectUrl);
      const returnRes = await agent.get(`${returnUrl.pathname}${returnUrl.search}`);
      expect(returnRes.status).toBe(302);

      const paidOrder = await Order.findByPk(order.id);
      expect(paidOrder.status).toBe('paid');
      expect(paidOrder.paidAt).not.toBeNull();

      // ---- 5. The purchase created a REAL, active enrollment ----------------
      const enrollment = await Enrollment.findOne({ where: { userId: user.id, courseId: course.id, orderId: order.id } });
      expect(enrollment).not.toBeNull();
      expect(enrollment.status).toBe('active');

      const courseDetailRes = await agent.get(`/api/v1/student/courses/${course.id}`);
      expect(courseDetailRes.status).toBe(200);

      // ---- 6. The enrollment unlocks a REAL lecture: /play + heartbeat -----
      const playRes = await agent.get(`/api/v1/student/lectures/${lecture.id}/play`);
      expect(playRes.status).toBe(200);
      const sessionKey = playRes.body.data.sessionKey;
      expect(sessionKey).toBeTruthy();

      const heartbeatRes = await agent
        .put(`/api/v1/student/lectures/${lecture.id}/heartbeat`)
        .send({ sessionKey, positionSeconds: 30, deltaSeconds: 30 });
      expect(heartbeatRes.status).toBe(200);
      expect(heartbeatRes.body.data.progress.watchedSeconds).toBeGreaterThan(0);

      // ---- 7. A REAL QBank test tied to the course's own exam category -----
      const createTestRes = await agent.post('/api/v1/qbank/tests').send({
        examCategory: 'NRE1',
        subjectIds: [subject.id],
        systemIds: [system.id],
        count: 5,
        mode: 'practice',
        timed: false,
        pool: 'all',
      });
      expect(createTestRes.status).toBe(201);
      const qbankTestId = createTestRes.body.data.id;
      expect(createTestRes.body.data.questions).toHaveLength(5);
      const returnedQbankQuestionIds = createTestRes.body.data.questions.map((q) => q.questionId).sort();
      expect(returnedQbankQuestionIds).toEqual(qbankQuestions.map((q) => q.id).sort());

      for (const q of createTestRes.body.data.questions) {
        const correctOption = await QuestionOption.findOne({ where: { questionId: q.questionId, isCorrect: true } });
        const answerRes = await agent
          .patch(`/api/v1/qbank/tests/${qbankTestId}/answer`)
          .send({ questionId: q.questionId, optionId: correctOption.id, timeSpent: 5 });
        expect(answerRes.status).toBe(200);
      }

      const submitQbankRes = await agent.post(`/api/v1/qbank/tests/${qbankTestId}/submit`);
      expect(submitQbankRes.status).toBe(200);
      expect(submitQbankRes.body.data.mode).toBe('practice');
      expect(submitQbankRes.body.data.correctCount).toBe(5);
      expect(submitQbankRes.body.data.scorePercent).toBe(100);

      // ---- 8. A REAL (admin-published) mock exam ----------------------------
      const startMockRes = await agent.post(`/api/v1/mock-exams/${mockExam.id}/start`);
      expect(startMockRes.status).toBe(201);
      const mockTestId = startMockRes.body.data.id;
      expect(startMockRes.body.data.mockExamId).toBe(mockExam.id);
      expect(startMockRes.body.data.questionCount).toBe(5);

      for (let i = 0; i < mockExamQuestions.length; i += 1) {
        const question = mockExamQuestions[i];
        const wantCorrect = i < 4; // 4/5 correct = 80%, safely clears passPercent=60.
        const option = await QuestionOption.findOne({ where: { questionId: question.id, isCorrect: wantCorrect } });
        const answerRes = await agent
          .patch(`/api/v1/qbank/tests/${mockTestId}/answer`)
          .send({ questionId: question.id, optionId: option.id, timeSpent: 5 });
        expect(answerRes.status).toBe(200);
      }

      const submitMockRes = await agent.post(`/api/v1/qbank/tests/${mockTestId}/submit`);
      expect(submitMockRes.status).toBe(200);
      expect(submitMockRes.body.data.mode).toBe('mock');
      expect(submitMockRes.body.data.mockExamId).toBe(mockExam.id);
      expect(submitMockRes.body.data.correctCount).toBe(4);
      expect(submitMockRes.body.data.scorePercent).toBe(80);
      expect(submitMockRes.body.data.passed).toBe(true);

      // ---- 9. Analytics reflects the REAL activity just generated ----------
      const analyticsRes = await agent.get('/api/v1/qbank/analytics');
      expect(analyticsRes.status).toBe(200);
      // Both completed sessions (5 practice-test Qs + 5 mock-exam Qs), all answered.
      expect(analyticsRes.body.data.overall.totalAttempted).toBe(10);
      expect(analyticsRes.body.data.overall.totalCorrect).toBe(9); // 5 (qbank) + 4 (mock)
      expect(analyticsRes.body.data.overall.totalSkipped).toBe(0);

      // ---- 10. Separately: an admin approves a REAL pending bank-transfer
      // order for a second, fresh student fixture ---------------------------
      const { user: bankStudent, email: bankEmail, password: bankPassword } = await createVerifiedUser({
        email: uniqueEmail('e2e-happy-bank-student'),
        name: 'E2E Bank Transfer Student',
      });
      const bankUserAgent = 'jest-e2e-happy-bank-device/1.0';
      const bankAgent = request.agent(app);
      const bankLoginRes = await bankAgent.post('/api/v1/auth/login').set('User-Agent', bankUserAgent).send({
        email: bankEmail,
        password: bankPassword,
      });
      expect(bankLoginRes.status).toBe(401); // brand-new device, reverify required
      const bankReverifyCode = extractReverifyCode(bankEmail);
      const bankReverifyRes = await bankAgent
        .post('/api/v1/auth/reverify')
        .set('User-Agent', bankUserAgent)
        .send({ email: bankEmail, code: bankReverifyCode });
      expect(bankReverifyRes.status).toBe(200);

      const bankCourse = await createCourse({ price: 8000, validityDays: 90 });
      const bankOrderRes = await bankAgent.post('/api/v1/checkout/orders').send({ courseId: bankCourse.id, gateway: 'bank_transfer' });
      expect(bankOrderRes.status).toBe(201);
      const bankOrder = bankOrderRes.body.data.order;
      expect(bankOrder.status).toBe('pending');

      const uploadRes = await bankAgent
        .post('/api/v1/checkout/uploads/proof-image')
        .field('orderId', String(bankOrder.id))
        .attach('file', REAL_PNG, { filename: 'receipt.png', contentType: 'image/png' });
      expect(uploadRes.status).toBe(201);

      const proofRes = await bankAgent.post(`/api/v1/checkout/orders/${bankOrder.id}/bank-proof`).send({
        referenceNo: 'TXN-E2E-HAPPY-001',
        fileUrl: uploadRes.body.data.url,
      });
      expect(proofRes.status).toBe(200);
      expect(proofRes.body.data.status).toBe('awaiting_verification');

      const { agent: adminAgent, user: adminUser } = await createAdminSession(app);
      const queueRes = await adminAgent.get('/api/v1/admin/bank-transfers');
      expect(queueRes.status).toBe(200);
      expect(queueRes.body.data.some((o) => o.id === bankOrder.id)).toBe(true);

      const approveRes = await adminAgent.post(`/api/v1/admin/bank-transfers/${bankOrder.id}/approve`);
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('paid');

      const bankEnrollment = await Enrollment.findOne({
        where: { userId: bankStudent.id, courseId: bankCourse.id, orderId: bankOrder.id },
      });
      expect(bankEnrollment).not.toBeNull();
      expect(bankEnrollment.status).toBe('active');

      // ---- 11. The SAME admin resets the FIRST (main) student's devices ----
      const resetRes = await adminAgent.post(`/api/v1/admin/students/${user.id}/reset-devices`);
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.success).toBe(true);

      const mainStudentDevices = await UserDevice.findAll({ where: { userId: user.id } });
      expect(mainStudentDevices.length).toBeGreaterThan(0);
      mainStudentDevices.forEach((d) => expect(d.isActive).toBe(false));

      const mainStudentRefreshTokens = await RefreshToken.findAll({ where: { userId: user.id } });
      expect(mainStudentRefreshTokens.length).toBeGreaterThan(0);
      mainStudentRefreshTokens.forEach((rt) => expect(rt.revokedAt).not.toBeNull());

      const auditRow = await AuditLog.findOne({ where: { action: 'student.reset_devices', entityId: user.id } });
      expect(auditRow).not.toBeNull();
      expect(auditRow.actorUserId).toBe(adminUser.id);

      // The main student's now-revoked refresh token can no longer refresh.
      const refreshAfterReset = await agent.post('/api/v1/auth/refresh');
      expect(refreshAfterReset.status).toBe(401);
      expect(refreshAfterReset.body.error.code).toBe('UNAUTHENTICATED');
    },
    60000
  );
});
