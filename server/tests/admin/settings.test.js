// server/tests/admin/settings.test.js
// GET/PUT /admin/settings (docs/07_EXECUTION_PLAN.md Phase 4.1/4.4;
// docs/04_API_SPEC.md §7: "returned masked, write-only fields"). Covers the
// settings-mask-roundtrip requirement explicitly called out in the task
// brief: a masked value submitted back unedited must NOT overwrite the real
// stored secret.
//
// Test ordering note: the `settings` table is shared/not reset between test
// files (server/tests/globalSetup.cjs migrates once, doesn't wipe per file).
// The "graceful missing-key defaults" describe block below is placed FIRST
// and is the only place in this whole test suite that ever writes to the
// `site`/`payments`/`video`/`smtp` settings keys (no other test file touches
// them — only `legal.*`/`site.about`, which pages.test.js also uses, hence
// this file's own legal assertions target content strings unique to this
// file rather than asserting emptiness).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';

const { sequelize, AuditLog, Setting } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/settings — graceful missing-key defaults', () => {
  test('happy path: fresh DB returns sensible empty defaults for every section, no error', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.site).toEqual(
      expect.objectContaining({ name: '', supportEmail: '', facebookUrl: '' })
    );
    expect(res.body.data.payments.enabledGateways).toEqual([]);
    expect(res.body.data.payments.gatewayKeys).toEqual(
      expect.objectContaining({ jazzcashMerchantId: '', safepaySecret: '' })
    );
    expect(res.body.data.video).toEqual(
      expect.objectContaining({ bunnyLibraryId: '', bunnyApiKey: '' })
    );
    expect(res.body.data.smtp).toEqual(expect.objectContaining({ host: '', password: '' }));
    // Not asserting emptiness here: `legal.*` keys are shared with
    // tests/public/pages.test.js, whose row-creation timing relative to this
    // file isn't something this test should depend on — only the shape
    // (never errors, always all 3 string fields) is this test's concern.
    expect(res.body.data.legal).toEqual({
      privacyPolicy: expect.any(String),
      termsAndConditions: expect.any(String),
      refundPolicy: expect.any(String),
    });
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/settings');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/settings');
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/admin/settings/:section — site (non-sensitive)', () => {
  test('happy path: updates and round-trips a non-sensitive section', async () => {
    const { agent, user } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings/site').send({
      name: 'SAMS Academy',
      supportEmail: 'support@samsacademy.test',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('SAMS Academy');
    expect(res.body.data.supportEmail).toBe('support@samsacademy.test');

    const auditRow = await AuditLog.findOne({ where: { action: 'settings.update' }, order: [['id', 'DESC']] });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);

    const getRes = await agent.get('/api/v1/admin/settings');
    expect(getRes.body.data.site.name).toBe('SAMS Academy');
  });

  test('validation failure: unknown settings section in URL → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings/bogus-section').send({ name: 'x' });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).put('/api/v1/admin/settings/site').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.put('/api/v1/admin/settings/site').send({ name: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/admin/settings/:section — payments (sensitive-field masking + roundtrip)', () => {
  test('happy path: sensitive fields come back masked, never raw', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings/payments').send({
      bankName: 'Meezan Bank Limited',
      iban: 'PK36MEZN0001234567890123',
      accountNumber: '01020103456789',
      gatewayKeys: {
        jazzcashMerchantId: 'MC_JAZZ_987654',
        jazzcashPassword: 'SuperSecretPass1',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.bankName).toBe('Meezan Bank Limited'); // not sensitive, echoed raw
    expect(res.body.data.iban).toBe('****0123');
    expect(res.body.data.accountNumber).toBe('****6789');
    expect(res.body.data.gatewayKeys.jazzcashMerchantId).toBe('****7654');
    expect(res.body.data.gatewayKeys.jazzcashPassword).toBe('****ass1');

    // The raw values must never appear anywhere in the JSON response body.
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain('PK36MEZN0001234567890123');
    expect(bodyText).not.toContain('SuperSecretPass1');
  });

  test('edge (mask-roundtrip): submitting the masked placeholder back unedited does NOT clobber the real stored secret', async () => {
    const { agent } = await createAdminSession(app);

    const first = await agent.put('/api/v1/admin/settings/payments').send({
      bankName: 'Original Bank',
      iban: 'PK11AAAA1111222233334444',
      gatewayKeys: { safepaySecret: 'RealSafepaySecretValue' },
    });
    expect(first.status).toBe(200);
    const maskedIban = first.body.data.iban;
    const maskedSecret = first.body.data.gatewayKeys.safepaySecret;
    expect(maskedIban).toBe('****4444');
    expect(maskedSecret).toBe('****alue');

    // Admin edits only bankName in the UI; the iban/secret <input> fields
    // still hold whatever GET/PUT last rendered into them (the mask) and get
    // resubmitted verbatim, unedited.
    const second = await agent.put('/api/v1/admin/settings/payments').send({
      bankName: 'Renamed Bank',
      iban: maskedIban,
      gatewayKeys: { safepaySecret: maskedSecret },
    });
    expect(second.status).toBe(200);
    expect(second.body.data.bankName).toBe('Renamed Bank');
    expect(second.body.data.iban).toBe('****4444'); // still renders the same mask
    expect(second.body.data.gatewayKeys.safepaySecret).toBe('****alue');

    // Prove it directly against the raw stored row — the real secret must
    // still be the ORIGINAL value, not literally overwritten with asterisks.
    const row = await Setting.findByPk('payments');
    expect(row.value.iban).toBe('PK11AAAA1111222233334444');
    expect(row.value.gatewayKeys.safepaySecret).toBe('RealSafepaySecretValue');
  });

  test('edge: submitting a genuinely NEW secret value (not the mask) DOES overwrite the stored one', async () => {
    const { agent } = await createAdminSession(app);
    await agent.put('/api/v1/admin/settings/payments').send({ iban: 'PK00OLD00000000000000001' });

    const changed = await agent.put('/api/v1/admin/settings/payments').send({ iban: 'PK99NEW99999999999999999' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.iban).toBe('****9999');

    const row = await Setting.findByPk('payments');
    expect(row.value.iban).toBe('PK99NEW99999999999999999');
  });

  test('validation failure: enabledGateways with an unknown gateway id → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings/payments').send({ enabledGateways: ['not_a_real_gateway'] });
    expect(res.status).toBe(422);
  });
});

describe('PUT /api/v1/admin/settings/:section — video/smtp masking', () => {
  test('happy path: bunnyApiKey and smtp.password are masked on read', async () => {
    const { agent } = await createAdminSession(app);
    const videoRes = await agent.put('/api/v1/admin/settings/video').send({ bunnyApiKey: 'bunny-real-api-key-0001' });
    expect(videoRes.body.data.bunnyApiKey).toBe('****0001');

    const smtpRes = await agent.put('/api/v1/admin/settings/smtp').send({ host: 'smtp.hostinger.com', password: 'RealSmtpPass9' });
    expect(smtpRes.body.data.host).toBe('smtp.hostinger.com');
    expect(smtpRes.body.data.password).toBe('****ass9');

    const row = await Setting.findByPk('smtp');
    expect(row.value.password).toBe('RealSmtpPass9');
  });
});

describe('PUT /api/v1/admin/settings/:section — legal (never masked)', () => {
  test('happy path: updates one legal field, others default empty until set', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings/legal').send({ privacyPolicy: 'Our unique privacy text 4.1.' });
    expect(res.status).toBe(200);
    expect(res.body.data.privacyPolicy).toBe('Our unique privacy text 4.1.');

    // Backed by the same granular `legal.privacy` key the public route reads.
    const publicRes = await request(app).get('/api/v1/public/pages/legal.privacy');
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.content).toBe('Our unique privacy text 4.1.');
  });
});

describe('PUT /api/v1/admin/settings — bulk (one or more keys per call)', () => {
  test('happy path: updates a section and a raw legal/about key in a single call', async () => {
    // Uses `legal.refund` (not `site.about`) deliberately: `site.about` is
    // asserted elsewhere (tests/public/pages.test.js) to have NO settings
    // row at all ("an allowed key with no settings row 404s") — writing it
    // here would make that test's outcome depend on cross-file run order.
    // `legal.refund` isn't touched by any other test file.
    const { agent, user } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings').send({
      site: { tagline: 'Bulk-updated tagline.' },
      'legal.refund': { content: 'Bulk-updated refund policy content 4.1.' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.site.tagline).toBe('Bulk-updated tagline.');
    expect(res.body.data['legal.refund'].content).toBe('Bulk-updated refund policy content 4.1.');

    const auditRow = await AuditLog.findOne({ where: { action: 'settings.update' }, order: [['id', 'DESC']] });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);

    const publicRes = await request(app).get('/api/v1/public/pages/legal.refund');
    expect(publicRes.body.data.content).toBe('Bulk-updated refund policy content 4.1.');
  });

  test('validation failure: a disallowed/unknown key is rejected → 422, nothing written', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings').send({ 'payments.jazzcash_secret_raw': { content: 'x' } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation failure: empty body → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.put('/api/v1/admin/settings').send({});
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).put('/api/v1/admin/settings').send({ site: { name: 'x' } });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.put('/api/v1/admin/settings').send({ site: { name: 'x' } });
    expect(res.status).toBe(403);
  });
});
