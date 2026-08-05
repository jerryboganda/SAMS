// server/src/controllers/adminCouponController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/couponService.js's admin CRUD
// section. auth/deviceCheck/requireRole('admin') applied at
// routes/v1/admin/index.js; audit() applied per-route at
// routes/v1/admin/coupons.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as couponService from '../services/couponService.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

// docs/03_DATABASE_SCHEMA.md: coupons.code VARCHAR(40) UNIQUE. Charset is a
// judgment call (resolveCoupon() above only trims — no charset restriction
// today) — restricted here to the conventional promo-code alphabet
// (letters/digits/hyphen/underscore) purely as an admin-facing UX sanity
// check, not a security boundary (matching still happens as an exact string
// compare against whatever ends up stored). See DECISIONS.md 2026-08-05.
const codeField = z
  .string()
  .trim()
  .min(1, 'Coupon code is required.')
  .max(40, 'Coupon code must be 40 characters or fewer.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code may contain only letters, numbers, hyphens, and underscores.');

const couponCreateSchema = z.object({
  code: codeField,
  type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().positive('value must be greater than 0.'),
  courseId: z.coerce.number().int().positive().optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  validFrom: z.coerce.date().optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

// Cross-field rules (percent<=100, validFrom<validUntil) are enforced in
// couponService.js's admin functions instead of here — PATCH is partial, so
// only the service (which can see the coupon's EXISTING row) can correctly
// evaluate "effective" type/value/dates when a field is omitted from this
// particular request. See couponService.js#assertCouponBusinessRules.
const couponUpdateSchema = z
  .object({
    code: codeField.optional(),
    type: z.enum(['percent', 'fixed']).optional(),
    value: z.coerce.number().positive('value must be greater than 0.').optional(),
    courseId: z.coerce.number().int().positive().optional().nullable(),
    maxUses: z.coerce.number().int().positive().optional().nullable(),
    validFrom: z.coerce.date().optional().nullable(),
    validUntil: z.coerce.date().optional().nullable(),
    isActive: z.coerce.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required.' });

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const listCoupons = asyncHandler(async (req, res) => {
  const data = await couponService.listCouponsAdmin();
  ok(res, data);
});

export const createCoupon = asyncHandler(async (req, res) => {
  const body = validateBody(couponCreateSchema, req.body);
  const data = await couponService.createCouponAdmin(body);
  ok(res, data, 201);
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(couponUpdateSchema, req.body);
  const data = await couponService.updateCouponAdmin(id, body);
  ok(res, data);
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  await couponService.deleteCouponAdmin(id);
  ok(res, { success: true });
});

export const toggleCoupon = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const data = await couponService.toggleCouponAdmin(id);
  ok(res, data);
});

export default { listCoupons, createCoupon, updateCoupon, deleteCoupon, toggleCoupon };
