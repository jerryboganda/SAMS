// server/src/adapters/payments/manualGatewayShared.js
// Shared read-only helper for the two manual pseudo-gateway drivers
// (raast.js, bank_transfer.js — docs/07_EXECUTION_PLAN.md 9.5/9.6). Both
// source their `manualDetails` payload (and their own completeness check —
// see each driver's own `createCheckout()` doc comment) from the SAME
// admin-editable `settings['payments']` row, read directly via the model
// layer — the SAME precedent as server/src/services/orderService.js's own
// direct `Setting.findByPk('invoice_seq')` use (task brief, point 4) — NOT
// via services/adminSettingsService.js, whose `getAllSettings()` additionally
// MASKS sensitive leaves (iban, raastId, raastIban, ...) for the admin
// Settings UI's own GET response. That masking is correct/required for that
// UI but would be actively WRONG here: this driver needs the REAL, unmasked
// values to actually build a student-facing checkout payload. Importing
// from a `services/*` module into an `adapters/*` module would also invert
// this codebase's normal `routes -> controllers -> services -> models`
// layering (CLAUDE.md §4) for no real benefit, so this reads the `Setting`
// model directly instead, exactly like orderService.js already does.
//
// Mirrors adminSettingsService.js's `SECTION_DEFAULTS.payments` shape (only
// the subset these two drivers actually need) so a fresh/unconfigured DB —
// where no `settings` row keyed `'payments'` exists yet at all — never
// crashes `isConfigured()`/`createCheckout()`; it just correctly reports
// "not configured" until an admin fills in Settings > Payments.
import db from '../../models/index.js';

const { Setting } = db;

const PAYMENTS_SETTINGS_KEY = 'payments';

const DEFAULTS = {
  bankName: '',
  accountTitle: '',
  iban: '',
  accountNumber: '',
  branchCode: '',
  raastId: '',
  raastIban: '',
  raastQrImage: '',
};

/** Raw (UNMASKED) `settings['payments']` row, merged onto DEFAULTS so every field this module cares about is always at least `''` (never `undefined`). */
export async function readPaymentsSettings() {
  const row = await Setting.findByPk(PAYMENTS_SETTINGS_KEY);
  const value = row && typeof row.value === 'object' && row.value !== null ? row.value : {};
  return { ...DEFAULTS, ...value };
}

export default { readPaymentsSettings };
