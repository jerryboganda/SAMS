// server/src/routes/v1/admin/settings.js
// GET/PUT /admin/settings (docs/04_API_SPEC.md §7). Two write shapes:
// PUT /admin/settings/:section (matches client/src/api/endpoints/admin.ts's
// updateSettings(section, data) exactly) and PUT /admin/settings (bulk,
// one-or-more keys — the spec's literal `PUT /admin/settings` contract,
// also how legal/about pages get edited). Plus POST /admin/settings/smtp/test
// (Phase 13.3 — matches client/src/api/endpoints/admin.ts's sendTestEmail()
// call shape). auth/deviceCheck/requireRole('admin') applied at
// routes/v1/admin/index.js.
import { Router } from 'express';
import * as adminSettingsController from '../../../controllers/adminSettingsController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/settings', adminSettingsController.getSettings);

router.put(
  '/settings',
  audit('settings.update', 'setting', {
    entityId: () => null,
    summary: (req) => `Bulk-updated settings keys: ${Object.keys(req.body || {}).join(', ')}`,
  }),
  adminSettingsController.updateSettingsBulk
);

router.put(
  '/settings/:section',
  audit('settings.update', 'setting', {
    entityId: () => null,
    summary: (req) => `Updated settings section "${req.params.section}"`,
  }),
  adminSettingsController.updateSettingsSection
);

// POST /admin/settings/smtp/test (Phase 13.3) — auth/deviceCheck/
// requireRole('admin') already applied at routes/v1/admin/index.js, same as
// every other route in this file. Audited like every other admin mutation
// (docs/02_ARCHITECTURE.md §3) — the audit middleware only fires on a
// genuine 2xx `{success:true, ...}` response (see middleware/audit.js), so a
// caught SMTP failure (which responds 422) is correctly never logged as a
// successful mutation.
router.post(
  '/settings/smtp/test',
  audit('settings.smtp_test', 'setting', {
    entityId: () => null,
    summary: () => 'Sent an SMTP test email to their own account address',
  }),
  adminSettingsController.sendSmtpTest
);

export default router;
