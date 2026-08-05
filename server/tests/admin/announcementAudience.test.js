// server/tests/admin/announcementAudience.test.js
// docs/07_EXECUTION_PLAN.md 10.2's "batched blast" + audience-resolution ACs:
// (1) an audience='course' announcement fans out Notification rows to
// exactly the enrolled-active students of that course, no one else; (2)
// services/announcementService.js#sendAnnouncementEmailBlast batches emails
// correctly when called directly with a tiny batchSize/delayMs (same "test
// the service function directly, don't test real-time scheduling"
// discipline as jobs/enrollmentLifecycleCron.js).
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import * as announcementService from '../../src/services/announcementService.js';
import { createAdminSession } from '../helpers/adminSession.js';
import { createCourse } from '../helpers/publicFixtures.js';
import { createActiveEnrollment } from '../helpers/studentFixtures.js';
import { createVerifiedUser, uniqueEmail } from '../helpers/testUsers.js';

const { sequelize, Notification, Announcement } = db;

beforeEach(() => {
  testOutbox.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/admin/announcements (audience=course fan-out)', () => {
  test('exactly the enrolled-active students of the target course get a Notification row — no one else', async () => {
    const { agent } = await createAdminSession(app);
    const courseA = await createCourse();
    const courseB = await createCourse();

    const { user: studentA1 } = await createVerifiedUser({ email: uniqueEmail('aud-a1') });
    const { user: studentA2 } = await createVerifiedUser({ email: uniqueEmail('aud-a2') });
    const { user: studentA3 } = await createVerifiedUser({ email: uniqueEmail('aud-a3') });
    const { user: studentB } = await createVerifiedUser({ email: uniqueEmail('aud-b') });
    const { user: studentNeverEnrolled } = await createVerifiedUser({ email: uniqueEmail('aud-none') });

    await createActiveEnrollment(studentA1, courseA);
    await createActiveEnrollment(studentA2, courseA);
    await createActiveEnrollment(studentA3, courseA);
    await createActiveEnrollment(studentB, courseB);
    // studentNeverEnrolled: no enrollment row at all.

    const res = await agent.post('/api/v1/admin/announcements').send({
      title: 'Course A only notice',
      body: 'This only concerns Course A students.',
      audience: 'course',
      courseId: courseA.id,
      sendEmail: false,
    });
    expect(res.status).toBe(201);

    const rows = await Notification.findAll({ where: { type: 'announcement', title: 'Course A only notice' } });
    const recipientUserIds = rows.map((r) => r.userId).sort((a, b) => a - b);
    const expected = [studentA1.id, studentA2.id, studentA3.id].sort((a, b) => a - b);
    expect(recipientUserIds).toEqual(expected);

    expect(recipientUserIds).not.toContain(studentB.id);
    expect(recipientUserIds).not.toContain(studentNeverEnrolled.id);
  });
});

describe('announcementService.sendAnnouncementEmailBlast', () => {
  test('batches emails across chunks and eventually emails every recipient with an email', async () => {
    const recipients = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createVerifiedUser({ email: uniqueEmail(`blast-${i}`) }))
    );
    const userIds = recipients.map((r) => r.user.id);

    const announcement = await Announcement.create({
      title: 'Blast test announcement',
      body: 'This is the blast body.',
      audience: 'all',
      sendEmail: true,
    });

    const start = Date.now();
    const result = await announcementService.sendAnnouncementEmailBlast(userIds, announcement, { batchSize: 2, delayMs: 10 });
    const elapsedMs = Date.now() - start;

    expect(result.sent).toBe(5);
    const matchingMails = testOutbox.filter((m) => m.subject === '[SAMS Academy] Blast test announcement');
    expect(matchingMails.length).toBe(5);
    const mailedTo = matchingMails.map((m) => m.to).sort();
    expect(mailedTo).toEqual(recipients.map((r) => r.email).sort());

    // 5 recipients / batchSize 2 -> 3 chunks -> 2 inter-chunk delays of
    // ~10ms each. Loose lower-bound check only (no precise timing
    // assertion) — just confirms batching actually paused between chunks.
    expect(elapsedMs).toBeGreaterThanOrEqual(15);
  }, 15000);
});
