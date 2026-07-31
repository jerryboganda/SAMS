// server/src/routes/v1/admin/settings.js
// GET/PUT /admin/settings (docs/04_API_SPEC.md §7). Two write shapes:
// PUT /admin/settings/:section (matches client/src/api/endpoints/admin.ts's
// updateSettings(section, data) exactly) and PUT /admin/settings (bulk,
// one-or-more keys — the spec's literal `PUT /admin/settings` contract,
// also how legal/about pages get edited). auth/deviceCheck/
// requireRole('admin') applied at routes/v1/admin/index.js.
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

export default router;
