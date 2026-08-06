// server/src/controllers/adminSettingsController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import { ApiError } from '../utils/apiError.js';
import * as adminSettingsService from '../services/adminSettingsService.js';
import { ADMIN_SETTINGS_SECTIONS, ADMIN_SETTINGS_RAW_KEYS } from '../config/constants.js';
import db from '../models/index.js';

const { User } = db;

// --- Per-section schemas -------------------------------------------------
// Every field optional (partial-update friendly) — a masked/unedited secret
// round-tripped back is handled by adminSettingsService's mask-aware merge,
// not by validation here.

const siteSectionSchema = z.object({
  name: z.string().trim().max(150).optional(),
  tagline: z.string().trim().max(300).optional(),
  supportEmail: z.string().trim().max(190).optional(),
  supportPhone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  facebookUrl: z.string().trim().max(300).optional(),
  instagramUrl: z.string().trim().max(300).optional(),
  youtubeUrl: z.string().trim().max(300).optional(),
});

const gatewayKeysSchema = z.object({
  jazzcashMerchantId: z.string().trim().max(200).optional(),
  jazzcashPassword: z.string().trim().max(200).optional(),
  jazzcashIntegritySalt: z.string().trim().max(200).optional(),
  easypaisaStoreId: z.string().trim().max(200).optional(),
  easypaisaHashKey: z.string().trim().max(200).optional(),
  payfastMerchantId: z.string().trim().max(200).optional(),
  payfastSecuredKey: z.string().trim().max(200).optional(),
  safepayApiKey: z.string().trim().max(200).optional(),
  safepaySecret: z.string().trim().max(200).optional(),
});

const paymentsSectionSchema = z.object({
  bankName: z.string().trim().max(150).optional(),
  accountTitle: z.string().trim().max(150).optional(),
  iban: z.string().trim().max(50).optional(),
  accountNumber: z.string().trim().max(50).optional(),
  branchCode: z.string().trim().max(100).optional(),
  raastId: z.string().trim().max(50).optional(),
  raastIban: z.string().trim().max(50).optional(),
  raastQrImage: z.string().trim().max(300).optional(),
  enabledGateways: z.array(z.enum(['jazzcash', 'easypaisa', 'raast', 'payfast', 'safepay', 'bank_transfer'])).optional(),
  gatewayKeys: gatewayKeysSchema.optional(),
});

const videoSectionSchema = z.object({
  bunnyLibraryId: z.string().trim().max(100).optional(),
  bunnyCdnHostname: z.string().trim().max(200).optional(),
  bunnyApiKey: z.string().trim().max(300).optional(),
  bunnyTokenAuthKey: z.string().trim().max(300).optional(),
});

const smtpSectionSchema = z.object({
  host: z.string().trim().max(150).optional(),
  port: z.union([z.string().trim().max(10), z.coerce.number().int()]).optional(),
  user: z.string().trim().max(190).optional(),
  password: z.string().trim().max(300).optional(),
  fromName: z.string().trim().max(200).optional(),
  secure: z.coerce.boolean().optional(),
});

const legalSectionSchema = z.object({
  privacyPolicy: z.string().max(200000).optional(),
  termsAndConditions: z.string().max(200000).optional(),
  refundPolicy: z.string().max(200000).optional(),
});

const SECTION_SCHEMAS = {
  site: siteSectionSchema,
  payments: paymentsSectionSchema,
  video: videoSectionSchema,
  smtp: smtpSectionSchema,
  legal: legalSectionSchema,
};

const rawSettingSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().max(200000),
});

const sectionParamSchema = z.object({ section: z.enum(ADMIN_SETTINGS_SECTIONS) });

const bulkSettingsBodySchema = z
  .record(z.string(), z.any())
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one settings key is required.' });

// `email` is accepted-but-ignored (client/src/api/endpoints/admin.ts's
// sendTestEmail(email) call shape sends it) — the actual recipient is always
// the authenticated admin's own account email, never a body-supplied
// address (see adminSettingsService.js#sendSmtpTest's doc comment). Loosely
// typed (no `.email()` refinement) on purpose: an ignored field must never
// itself cause a spurious 422.
const smtpTestBodySchema = z.object({ email: z.string().trim().max(190).optional() });

// --- Helpers ---------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const getSettings = asyncHandler(async (req, res) => {
  const data = await adminSettingsService.getAllSettings();
  ok(res, data);
});

export const updateSettingsSection = asyncHandler(async (req, res) => {
  const { section } = validateBody(sectionParamSchema, req.params);
  const body = validateBody(SECTION_SCHEMAS[section], req.body);
  const data = await adminSettingsService.updateSection(section, body);
  ok(res, data);
});

export const updateSettingsBulk = asyncHandler(async (req, res) => {
  const body = validateBody(bulkSettingsBodySchema, req.body);

  const normalized = {};
  for (const [key, value] of Object.entries(body)) {
    if (SECTION_SCHEMAS[key]) {
      normalized[key] = validateBody(SECTION_SCHEMAS[key], value ?? {});
    } else if (ADMIN_SETTINGS_RAW_KEYS.includes(key)) {
      normalized[key] = validateBody(rawSettingSchema, value ?? {});
    } else {
      throw new ApiError(422, 'VALIDATION_ERROR', `Unknown or disallowed settings key "${key}".`, { key });
    }
  }

  const data = await adminSettingsService.updateMany(normalized);
  ok(res, data);
});

/**
 * POST /admin/settings/smtp/test — `req.user` only carries `{id, role}`
 * (see middleware/auth.js), never `email`, so the full row is loaded fresh
 * by id rather than trusting anything from the request.
 */
export const sendSmtpTest = asyncHandler(async (req, res) => {
  validateBody(smtpTestBodySchema, req.body ?? {});
  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  }
  const data = await adminSettingsService.sendSmtpTest(user);
  ok(res, data);
});
