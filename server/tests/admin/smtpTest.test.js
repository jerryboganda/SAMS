// server/tests/admin/smtpTest.test.js
// POST /api/v1/admin/settings/smtp/test (Phase 13.3 — closes a previously
// flagged gap, see DECISIONS.md's pre-Phase-13.3 entry: "sendTestEmail()
// exists in admin.ts... not built, left as a flagged gap"). Covers:
//   - happy path via the real HTTP route (uses the real
//     server/src/utils/mailer.js transport, which in NODE_ENV=test/no-SMTP-
//     configured resolves to nodemailer's jsonTransport — no network I/O,
//     never throws, exactly the "mock transport" the task brief asks for).
//   - the security edge this endpoint exists to prevent: a request-body-
//     supplied `email` is IGNORED — the test email always goes to the
//     calling admin's own account address (req.user.id -> a fresh User
//     lookup), never an attacker-supplied relay target.
//   - the SMTP-failure mapping (mailer.js's `sendMail` never throws — it
//     always catches internally and resolves `null` on failure, logging
//     server-side; see its own doc comment) -> `sendSmtpTest`'s injectable
//     `sendMailFn` (test-only; production call sites never pass it) is
//     exercised DIRECTLY at the service layer here, covering both failure
//     shapes real `sendMail` callers can encounter (a caught-and-swallowed
//     falsy return, and a raw throw from a test double) — see
//     adminSettingsService.js#sendSmtpTest's own doc comment for why this is
//     the correct place to prove the failure-mapping behavior: nodemailer's
//     jsonTransport (this app's only transport in a test environment, by
//     design — no real SMTP server available to genuinely fail against)
//     never fails, so there is no way to provoke a REAL failure through the
//     full HTTP stack without either faking network conditions or replacing
//     the codebase's zero-precedent-for-ESM-module-mocking testing style;
//     the injectable seam is exactly what the task brief's own parenthetical
//     ("SMTP-failure path (mocked to throw)") anticipates.
//   - auth (401) / role (403) guards, same convention as every other admin
//     route test in this suite.
import { afterAll, describe, expect, jest, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { testOutbox } from '../../src/utils/mailer.js';
import { sendSmtpTest } from '../../src/services/adminSettingsService.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';

const { sequelize, AuditLog } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/admin/settings/smtp/test', () => {
  test('happy path: sends a real test email to the ADMIN\'S OWN account address, audited, response matches client contract', async () => {
    const { agent, user } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/settings/smtp/test').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // client/src/api/endpoints/admin.ts's sendTestEmail() types the unwrapped
    // `data` as `{ success: boolean; message: string }` — match it exactly.
    expect(res.body.data).toEqual({ success: true, message: expect.stringContaining(user.email) });

    const mail = [...testOutbox].reverse().find((m) => m.to === user.email && /SMTP test/i.test(m.subject));
    expect(mail).toBeTruthy();

    const auditRow = await AuditLog.findOne({ where: { action: 'settings.smtp_test' }, order: [['id', 'DESC']] });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('edge: a request-body-supplied `email` is IGNORED — always sends to the caller\'s own account address, never the body value (prevents using this endpoint as an arbitrary mail relay)', async () => {
    const { agent, user } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/settings/smtp/test').send({ email: 'attacker@example-evil.test' });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain(user.email);
    expect(res.body.data.message).not.toContain('attacker@example-evil.test');

    const mail = [...testOutbox].reverse().find((m) => /SMTP test/i.test(m.subject));
    expect(mail.to).toBe(user.email);
    expect(mail.to).not.toBe('attacker@example-evil.test');
  });

  test('validation: an invalid/oversized `email` body field is rejected -> 422, before ever attempting to send', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent
      .post('/api/v1/admin/settings/smtp/test')
      .send({ email: 'x'.repeat(300) });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session -> 401', async () => {
    const res = await request(app).post('/api/v1/admin/settings/smtp/test').send({});
    expect(res.status).toBe(401);
  });

  test('role failure: student session -> 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/settings/smtp/test').send({});
    expect(res.status).toBe(403);
  });
});

describe('adminSettingsService.sendSmtpTest — SMTP-failure mapping (service-level; see file header for why)', () => {
  const fakeUser = { id: 999999, email: 'admin-under-test@samsacademy.test' };

  test('a caught-and-swallowed failure (mailer.sendMail\'s real contract: resolves null, never throws) maps to 422 SMTP_TEST_FAILED with a safe, non-leaky message', async () => {
    const failingSendMail = jest.fn().mockResolvedValue(null);
    await expect(sendSmtpTest(fakeUser, { sendMailFn: failingSendMail })).rejects.toMatchObject({
      statusCode: 422,
      code: 'SMTP_TEST_FAILED',
    });
    await expect(sendSmtpTest(fakeUser, { sendMailFn: failingSendMail })).rejects.toThrow(
      /Could not send the test email/i
    );
  });

  test('a directly-thrown transport error is ALSO caught and mapped to the same friendly 422 — never a raw 500/stack leak', async () => {
    const throwingSendMail = jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:1'));
    let caught;
    try {
      await sendSmtpTest(fakeUser, { sendMailFn: throwingSendMail });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(422);
    expect(caught.code).toBe('SMTP_TEST_FAILED');
    // The raw transport error text must never reach the client-facing message.
    expect(caught.message).not.toContain('ECONNREFUSED');
  });

  test('happy path (service-level): a successful send resolves {success:true, message} referencing the recipient', async () => {
    const okSendMail = jest.fn().mockResolvedValue({ envelope: { to: [fakeUser.email] } });
    const result = await sendSmtpTest(fakeUser, { sendMailFn: okSendMail });
    expect(result).toEqual({ success: true, message: expect.stringContaining(fakeUser.email) });
    expect(okSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: fakeUser.email }));
  });
});
