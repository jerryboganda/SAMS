// server/tests/checkout/duplicatePurchaseRace.test.js
// docs/07_EXECUTION_PLAN.md 9.9, section C: assertNotAlreadyEnrolled is only
// checked at ORDER-CREATION time, not at PAYMENT-COMPLETION time. A student
// can legitimately create TWO separate `pending` orders for the SAME course
// (two browser tabs -- neither has an active enrollment yet, so both pass
// the order-creation-time ALREADY_ENROLLED gate), then both complete payment
// nearly simultaneously (two mock-gateway redirects racing). Each
// completion locks its OWN order row -- nothing serializes the two against
// each other -- so both concurrently reach
// enrollmentService.createEnrollmentFromOrder for the same (user, course).
//
// Two tests here, deliberately different in KIND:
//
// 1. A real HTTP Promise.all race (same rigor as
//    tests/checkout/couponRedemptionRace.test.js). Empirically (verified
//    repeatedly while writing this test), createEnrollmentFromOrder's
//    existing "flip the current active row to expired, then insert" logic
//    is timing-robust enough that ordinary event-loop interleaving usually
//    resolves this WITHOUT ever hitting the raw unique-index collision at
//    all (the second completion's own flip-check simply sees the first
//    completion's just-committed active row and folds it in) -- a
//    perfectly legitimate, non-buggy outcome. So this test asserts the
//    OUTCOME the task brief actually cares about (no crash, both orders
//    paid, exactly one ACTIVE enrollment survives) rather than asserting
//    HOW that outcome was reached.
// 2. A deterministic, manually-sequenced test (two real, explicitly
//    interleaved transactions) that FORCES the true low-level race and
//    proves it's a genuine InnoDB DEADLOCK (`ER_LOCK_DEADLOCK`) -- the
//    error orderService.js#completeOrderPayment's retry wrapper
//    (`isDeadlockError`) is written to detect -- see that test's own header
//    comment for the full mechanism (a gap-lock interaction, not a plain
//    duplicate-key rejection) and why it's proven at this level rather than
//    by trying to force the exact same sub-statement timing window through
//    the real HTTP/completeOrderPayment call.
//
// See DECISIONS.md 2026-08-05 for the full writeup of the chosen outcome
// (both orders end up 'paid' -- the student's money was taken on both --
// but only ONE active enrollment is ever created, and neither request ever
// surfaces a raw/unhandled error).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Order, Enrollment } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('Concurrent double-purchase: same user, two pending orders for the SAME course, completing payment nearly simultaneously', () => {
  test('real HTTP Promise.all race: both orders end up paid; exactly one ACTIVE enrollment survives; neither request 500s', async () => {
    const email = uniqueEmail('dup-purchase');
    const { user } = await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-dup-purchase' });
    const course = await createCourse({ price: 4000 });

    // Two SEPARATE pending orders for the SAME course -- both legitimately
    // pass the order-creation-time ALREADY_ENROLLED gate, since neither has
    // completed payment yet.
    const orderResA = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
    const orderResB = await agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' });
    expect(orderResA.status).toBe(201);
    expect(orderResB.status).toBe(201);
    expect(orderResA.body.data.order.id).not.toBe(orderResB.body.data.order.id);

    const returnPathA = `/api/v1/checkout/return/mock${new URL(orderResA.body.data.redirectUrl).search}`;
    const returnPathB = `/api/v1/checkout/return/mock${new URL(orderResB.body.data.redirectUrl).search}`;

    // Both promises created before either is awaited -- genuinely concurrent.
    const [resA, resB] = await Promise.all([request(app).get(returnPathA), request(app).get(returnPathB)]);

    // Neither ever surfaces as a raw error to the browser -- always a
    // graceful redirect either way, even for the losing side of the
    // enrollment race.
    expect(resA.status).toBe(302);
    expect(resB.status).toBe(302);

    const [finalOrderA, finalOrderB] = await Promise.all([
      Order.findByPk(orderResA.body.data.order.id),
      Order.findByPk(orderResB.body.data.order.id),
    ]);

    // The student's payment is real on BOTH orders -- both are marked paid
    // regardless of which one won the enrollment-creation race (see
    // completeOrderPayment's doc comment / DECISIONS.md 2026-08-05 for why
    // "mark paid either way" was chosen over silently leaving the loser
    // unpaid).
    expect(finalOrderA.status).toBe('paid');
    expect(finalOrderB.status).toBe('paid');

    // Exactly one ACTIVE enrollment survives for this (user, course) --
    // whether that's because the low-level uq_enr_active collision was
    // caught gracefully, or because the ordinary "flip stale active to
    // expired" logic in enrollmentService.js absorbed the second completion
    // first (both are legitimate, non-crashing outcomes -- see file header).
    const activeEnrollments = await Enrollment.findAll({ where: { userId: user.id, courseId: course.id, status: 'active' } });
    expect(activeEnrollments.length).toBe(1);

    // And never more than 2 rows total (one possible "created then
    // immediately superseded" row from the self-healing path, plus the
    // surviving active one) -- i.e. never a silent duplicate INSERT outside
    // either understood code path.
    const allEnrollments = await Enrollment.findAll({ where: { userId: user.id, courseId: course.id } });
    expect(allEnrollments.length).toBeLessThanOrEqual(2);
  }, 30000);

  test('deterministic DB-level proof: two genuinely simultaneous flip-then-insert sequences deadlock (not a plain duplicate-key error) -- exactly the ER_LOCK_DEADLOCK completeOrderPayment\'s retry logic is written to detect', async () => {
    // The real HTTP test above proves the end-to-end OUTCOME is always
    // graceful, but WHICH internal mechanism resolves any given real race is
    // inherently timing-dependent (verified empirically while building this
    // test, including several dead-end attempts worth recording): MySQL/
    // InnoDB takes a GAP LOCK on the (empty) "status='active'" range in
    // idx_enr_expiry for a non-matching `UPDATE ... WHERE status='active'`
    // under REPEATABLE READ (its normal phantom-read protection) --
    // enrollmentService.js's own flip-check is exactly such an UPDATE. So
    // when BOTH sides' flip-checks run first (each finding 0 rows to flip,
    // each now holding a gap lock on that same empty range), BOTH sides'
    // subsequent INSERTs conflict with the OTHER side's gap lock --
    // reproducibly a genuine InnoDB DEADLOCK (`ER_LOCK_DEADLOCK`), not a
    // clean post-commit duplicate-key rejection. This is why
    // completeOrderPayment's `isDeadlockError` retry exists at all (a
    // duplicate-key-only catch would have left this, the MORE common real
    // shape of this race, uncaught and crashing the loser's whole
    // transaction -- reproduced live while building this test before the
    // retry wrapper was added: the loser's order reverted to 'pending'
    // instead of 'paid'). This test reproduces that exact interleaving
    // directly and deterministically (two real, manually-sequenced
    // transactions, both flips before either insert, both inserts racing
    // concurrently) to prove the error really is
    // `SequelizeDatabaseError` / `err.parent.code === 'ER_LOCK_DEADLOCK'` --
    // exactly what `isDeadlockError()` checks for.
    const { user } = await createVerifiedUser({ email: uniqueEmail('dup-purchase-deadlock') });
    const course = await createCourse({ price: 3000 });

    async function flipActive(transaction) {
      return Enrollment.update(
        { status: 'expired' },
        { where: { userId: user.id, courseId: course.id, status: 'active' }, transaction }
      );
    }
    async function insertActive(transaction) {
      return Enrollment.create(
        {
          userId: user.id,
          courseId: course.id,
          orderId: null,
          source: 'purchase',
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 100000000),
          status: 'active',
        },
        { transaction }
      );
    }
    async function settle(transaction, insertPromise) {
      try {
        const row = await insertPromise;
        await transaction.commit();
        return { ok: true, row };
      } catch (err) {
        await transaction.rollback().catch(() => {});
        return { ok: false, name: err.name, code: err.parent?.code, message: err.parent?.message || err.message };
      }
    }

    const t1 = await sequelize.transaction();
    const t2 = await sequelize.transaction();

    // Both flips run first, while NEITHER side has inserted yet -- both
    // correctly find 0 rows to flip, and both now hold a gap lock on the
    // same empty "active" range.
    await flipActive(t1);
    await flipActive(t2);

    // Both inserts start together (real concurrency, not sequential
    // awaits) -- this is what turns the two gap locks into a genuine
    // deadlock cycle.
    const [r1, r2] = await Promise.all([settle(t1, insertActive(t1)), settle(t2, insertActive(t2))]);

    const results = [r1, r2];
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    expect(winners.length).toBe(1); // exactly one side wins
    expect(losers.length).toBe(1); // exactly one side loses

    // The loser's failure is a genuine deadlock -- exactly what
    // orderService.js#isDeadlockError checks for.
    expect(losers[0].name).toBe('SequelizeDatabaseError');
    expect(losers[0].code).toBe('ER_LOCK_DEADLOCK');

    // Exactly one active enrollment survives -- the constraint did its job.
    const rows = await Enrollment.findAll({ where: { userId: user.id, courseId: course.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('active');
  }, 15000);
});
