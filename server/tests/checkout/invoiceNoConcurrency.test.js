// server/tests/checkout/invoiceNoConcurrency.test.js
// docs/07_EXECUTION_PLAN.md 9.2's own AC: "write a real concurrency test:
// fire N concurrent order-creation calls, assert N distinct, sequential
// invoice numbers with zero collisions/gaps" — mirrors the rigor of
// tests/student/video/streamLockConcurrency.test.js's per-user row-lock
// proof, applied here to orderService.js's generateInvoiceNo() locked
// read-modify-write against settings['invoice_seq'].
import { afterAll, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';

const { sequelize, Setting } = db;

// Same figure docs/07_EXECUTION_PLAN.md 5.6's own stream-lock reproduction
// used (tests/student/video/streamLockConcurrency.test.js) — enough to
// reliably exercise real connection-pool interleaving.
const CONCURRENT_REQUESTS = 15;

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/checkout/orders — invoice_no is race-safe under real concurrency', () => {
  test(`${CONCURRENT_REQUESTS} genuinely concurrent order-creation calls get ${CONCURRENT_REQUESTS} distinct, sequential invoice numbers — zero collisions, zero gaps`, async () => {
    const email = uniqueEmail('invoiceNo-concurrency');
    await createVerifiedUser({ email });
    const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: 'jest-invoiceNo-concurrency' });

    const courses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => createCourse({ price: 1000 }))
    );

    // Read the counter's current value immediately before firing the batch —
    // jest runs this whole suite `--runInBand` (server/package.json), i.e.
    // strictly sequentially across test FILES, so nothing else can be
    // consuming this counter while this one test's own concurrent batch is
    // in flight; the resulting sequence numbers must be an exact contiguous
    // run starting right after this snapshot.
    const seqRowBefore = await Setting.findByPk('invoice_seq');
    const currentYear = new Date().getUTCFullYear();
    const seqBefore =
      seqRowBefore && seqRowBefore.value && seqRowBefore.value.year === currentYear ? seqRowBefore.value.seq : 0;

    // The critical part: fire all requests together (every promise created
    // before any is awaited), not one after another — genuine overlap in
    // flight, exercising the real race window in generateInvoiceNo().
    const responses = await Promise.all(
      courses.map((course) => agent.post('/api/v1/checkout/orders').send({ courseId: course.id, gateway: 'mock' }))
    );

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const invoiceNos = responses.map((res) => res.body.data.order.invoiceNo);

    // Zero collisions: every invoice number is unique.
    expect(new Set(invoiceNos).size).toBe(CONCURRENT_REQUESTS);

    // Zero gaps: the sequence portion is an exact contiguous run.
    const seqNumbers = invoiceNos
      .map((no) => {
        const match = no.match(/^SAMS-(\d{4})-(\d{5})$/);
        expect(match).not.toBeNull();
        expect(Number(match[1])).toBe(currentYear);
        return Number(match[2]);
      })
      .sort((a, b) => a - b);
    const expectedSeqNumbers = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => seqBefore + 1 + i);
    expect(seqNumbers).toEqual(expectedSeqNumbers);
  }, 30000);
});
