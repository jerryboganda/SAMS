// server/src/services/couponService.js
// Coupon validation + discount math (docs/04_API_SPEC.md §5, docs/03_DATABASE_SCHEMA.md
// "Integrity & operational rules", docs/07_EXECUTION_PLAN.md 9.1-9.2). THE
// single shared quote-math function (computeQuoteAmounts) is used by BOTH
// POST /checkout/quote (via getQuote below) AND POST /checkout/orders
// (server/src/services/orderService.js's createOrder calls resolveCoupon +
// computeQuoteAmounts directly, reusing the SAME course row it already
// fetched rather than re-querying it here) — so quote and order-creation can
// never compute a different discount for the same inputs. Layering: routes
// -> controllers -> services -> models (CLAUDE.md §4).
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { toCents, fromCents } from '../utils/money.js';

const { Coupon, Course } = db;

// ---------------------------------------------------------------------------
// Coupon validation — docs/04_API_SPEC.md §5's 4 named error codes
// ---------------------------------------------------------------------------

/**
 * Loads+validates a coupon code, throwing one of the 4 named error codes
 * (docs/04_API_SPEC.md §5) on failure. Returns `null` (not an error) when
 * `code` is falsy/blank — "no coupon" is always a valid quote input.
 *
 * Check order (not prescribed by the spec — a judgment call, see
 * DECISIONS.md 2026-08-01): existence/active -> validity window -> usage cap
 * -> course-applicability.
 *
 * `docs/03_DATABASE_SCHEMA.md`'s coupons table only defines ONE "expired"
 * error code (`COUPON_EXPIRED`) that this task's brief explicitly folds
 * BOTH "not yet valid" (now < valid_from) and "no longer valid" (now >
 * valid_until) into — there is no separate "not yet started" code.
 *
 * Matching is case-insensitive by virtue of the `coupons.code` column's
 * table-inherited `utf8mb4_unicode_ci` collation (CLAUDE.md §1 fixed DB
 * decision) — no extra case-folding needed here.
 */
export async function resolveCoupon(code, courseId) {
  if (!code) return null;
  const trimmed = String(code).trim();
  if (!trimmed) return null;

  const coupon = await Coupon.findOne({ where: { code: trimmed } });
  if (!coupon || !coupon.isActive) {
    throw new ApiError(422, 'COUPON_INVALID', 'This coupon code is not valid.');
  }

  const now = new Date();
  const notYetValid = coupon.validFrom && now < new Date(coupon.validFrom);
  const noLongerValid = coupon.validUntil && now > new Date(coupon.validUntil);
  if (notYetValid || noLongerValid) {
    throw new ApiError(422, 'COUPON_EXPIRED', 'This coupon is not currently valid.');
  }

  // NULL max_uses = unlimited (docs/03_DATABASE_SCHEMA.md) — only compare
  // when a cap is actually set. This is a soft/UX-time check only; the
  // race-safe, authoritative enforcement (the thing that actually prevents
  // over-redemption under concurrency) happens later, at payment-success
  // time under a row lock — see orderService.js's completeOrderPayment.
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new ApiError(422, 'COUPON_EXHAUSTED', 'This coupon has reached its usage limit.');
  }

  // NULL course_id = valid for any course (docs/03_DATABASE_SCHEMA.md).
  if (coupon.courseId !== null && Number(coupon.courseId) !== Number(courseId)) {
    throw new ApiError(422, 'COUPON_NOT_APPLICABLE', 'This coupon is not valid for the selected course.');
  }

  return coupon;
}

// ---------------------------------------------------------------------------
// Shared, fixed-point-safe quote math
// ---------------------------------------------------------------------------

/**
 * `price` is a DECIMAL(10,2) value exactly as Sequelize hands it back (a
 * STRING, e.g. "15000.00") — see server/src/utils/money.js's header for why
 * this never does float multiplication. `coupon` may be `null` (no
 * discount, `discount=0`/`final=price`).
 *
 * Math (docs/07_EXECUTION_PLAN.md 9.1):
 *   type='percent' -> discount = round(price * value/100, 2)
 *   type='fixed'    -> discount = min(value, price)
 * Discount is always clamped into `[0, price]` afterward — "never discount
 * below zero" (task brief) covers both an (admin-misconfigured) over-100%
 * percent coupon and a fixed value larger than the price.
 */
export function computeQuoteAmounts(price, coupon) {
  const priceCents = toCents(price);
  let discountCents = 0;

  if (coupon) {
    if (coupon.type === 'percent') {
      // "10.00"% -> 1000 — still an exact integer, no float math. Dividing
      // by 10000 below (not 100) folds BOTH the percent->fraction division
      // AND the *100-for-cents scaling the toCents() call above already
      // applied to `value`, in one integer division.
      const percentCentsInt = toCents(coupon.value);
      discountCents = Math.round((priceCents * percentCentsInt) / 10000);
    } else {
      discountCents = toCents(coupon.value);
    }
    discountCents = Math.min(Math.max(discountCents, 0), priceCents);
  }

  const finalCents = priceCents - discountCents;

  return {
    price: fromCents(priceCents),
    discount: fromCents(discountCents),
    final: fromCents(finalCents),
  };
}

// ---------------------------------------------------------------------------
// POST /checkout/quote
// ---------------------------------------------------------------------------

/** Full resolution for the quote endpoint: course + coupon + computed amounts, in one call. */
export async function getQuote({ courseId, couponCode }) {
  const course = await Course.findOne({ where: { id: courseId, isPublished: true } });
  if (!course) {
    throw new ApiError(404, 'NOT_FOUND', 'Course not found.');
  }
  const coupon = await resolveCoupon(couponCode, course.id);
  const amounts = computeQuoteAmounts(course.price, coupon);
  return { course, coupon, ...amounts };
}

// ---------------------------------------------------------------------------
// Admin coupon CRUD — docs/07_EXECUTION_PLAN.md 9.8, docs/04_API_SPEC.md §7.
// Added ALONGSIDE (not replacing) the student-facing quote logic above, per
// the task brief — this file already owns "everything coupon-shaped", so
// admin management lives here too rather than a third file. Serialization
// matches client/src/types/index.ts's `Coupon` interface exactly (CLAUDE.md
// §1a: prefer changing the backend to match the already-built frontend's
// existing TS types).
// ---------------------------------------------------------------------------

const COUPON_ADMIN_INCLUDE = [{ model: Course, as: 'course' }];

function serializeCouponAdmin(coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: Number(coupon.value),
    courseId: coupon.courseId ?? undefined,
    courseTitle: coupon.course?.title ?? undefined,
    maxUses: coupon.maxUses ?? undefined,
    usedCount: coupon.usedCount,
    validFrom: coupon.validFrom ?? undefined,
    validUntil: coupon.validUntil ?? undefined,
    isActive: coupon.isActive,
  };
}

async function findCouponOrThrow(id) {
  const coupon = await Coupon.findByPk(id, { include: COUPON_ADMIN_INCLUDE });
  if (!coupon) {
    throw new ApiError(404, 'NOT_FOUND', 'Coupon not found.');
  }
  return coupon;
}

/** `courseId===null/undefined` is always valid ("all courses", docs/03_DATABASE_SCHEMA.md) — only a NON-null value must resolve to a real course row. */
async function assertCourseExistsIfProvided(courseId) {
  if (courseId === null || courseId === undefined) return;
  const course = await Course.findByPk(courseId);
  if (!course) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'courseId does not reference an existing course.');
  }
}

/**
 * Cross-field checks that need the CURRENT row state to evaluate correctly
 * for a partial PATCH (a lone `{value: 150}` on an already-`type:'percent'`
 * coupon must still be rejected, even though `type` itself isn't in this
 * request) — done here in the service rather than in the controller's zod
 * schema, which only ever sees the request body in isolation. `effective*`
 * = the patch's value if present, else the existing row's own value.
 *
 * The percent-over-100 cap is a UX sanity check, not a security boundary —
 * couponService.js#computeQuoteAmounts already clamps any discount into
 * `[0, price]` defensively regardless of what's stored (see that function's
 * own doc comment) — but it's still worth rejecting at write time so an
 * admin doesn't accidentally create a nonsensical "150% off" coupon.
 */
function assertCouponBusinessRules({ effectiveType, effectiveValue, effectiveValidFrom, effectiveValidUntil }) {
  if (effectiveType === 'percent' && effectiveValue !== undefined && Number(effectiveValue) > 100) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'A percent coupon value cannot exceed 100.');
  }
  if (effectiveValidFrom && effectiveValidUntil && new Date(effectiveValidFrom) >= new Date(effectiveValidUntil)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'validFrom must be before validUntil.');
  }
}

function translateUniqueConstraintError(err) {
  if (err?.name === 'SequelizeUniqueConstraintError') {
    throw new ApiError(409, 'CONFLICT', 'A coupon with this code already exists.');
  }
  throw err;
}

export async function listCouponsAdmin() {
  const coupons = await Coupon.findAll({ order: [['id', 'DESC']], include: COUPON_ADMIN_INCLUDE });
  return coupons.map(serializeCouponAdmin);
}

export async function createCouponAdmin(data) {
  await assertCourseExistsIfProvided(data.courseId ?? null);
  assertCouponBusinessRules({
    effectiveType: data.type,
    effectiveValue: data.value,
    effectiveValidFrom: data.validFrom ?? null,
    effectiveValidUntil: data.validUntil ?? null,
  });

  let created;
  try {
    created = await Coupon.create({
      code: data.code,
      type: data.type,
      value: data.value,
      courseId: data.courseId ?? null,
      maxUses: data.maxUses ?? null,
      validFrom: data.validFrom ?? null,
      validUntil: data.validUntil ?? null,
      isActive: data.isActive ?? true,
    });
  } catch (err) {
    translateUniqueConstraintError(err);
  }
  return serializeCouponAdmin(await findCouponOrThrow(created.id));
}

export async function updateCouponAdmin(id, data) {
  const coupon = await findCouponOrThrow(id);
  if (data.courseId !== undefined) await assertCourseExistsIfProvided(data.courseId);

  assertCouponBusinessRules({
    effectiveType: data.type !== undefined ? data.type : coupon.type,
    effectiveValue: data.value !== undefined ? data.value : Number(coupon.value),
    effectiveValidFrom: data.validFrom !== undefined ? data.validFrom : coupon.validFrom,
    effectiveValidUntil: data.validUntil !== undefined ? data.validUntil : coupon.validUntil,
  });

  const patch = {};
  if (data.code !== undefined) patch.code = data.code;
  if (data.type !== undefined) patch.type = data.type;
  if (data.value !== undefined) patch.value = data.value;
  if (data.courseId !== undefined) patch.courseId = data.courseId;
  if (data.maxUses !== undefined) patch.maxUses = data.maxUses;
  if (data.validFrom !== undefined) patch.validFrom = data.validFrom;
  if (data.validUntil !== undefined) patch.validUntil = data.validUntil;
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  // `usedCount` is server-controlled only, via the redemption path in
  // orderService.js#completeOrderPayment — deliberately never read from
  // `data` here even if a caller's body somehow included it (the
  // controller's zod schema already omits it from the accepted shape; this
  // is defense in depth, per the task brief).

  try {
    await coupon.update(patch);
  } catch (err) {
    translateUniqueConstraintError(err);
  }
  return serializeCouponAdmin(await findCouponOrThrow(id));
}

/**
 * `orders.coupon_id` is `ON DELETE SET NULL` (docs/03_DATABASE_SCHEMA.md) —
 * that FK behavior was clearly designed to make a hard coupon delete DB-safe
 * even when orders already reference it (those orders keep their own
 * already-computed `discount_amount`/`final_amount`; only the FK pointer is
 * cleared). Per the task brief's own steer, this deliberately does NOT add
 * an extra "already used" guard (unlike adminCourseService.js's
 * course-delete guard, which exists because `courses` has no such
 * SET-NULL safety net) — see DECISIONS.md 2026-08-05.
 */
export async function deleteCouponAdmin(id) {
  await findCouponOrThrow(id);
  await Coupon.destroy({ where: { id } });
}

export async function toggleCouponAdmin(id) {
  const coupon = await findCouponOrThrow(id);
  await coupon.update({ isActive: !coupon.isActive });
  return serializeCouponAdmin(await findCouponOrThrow(id));
}

export default {
  resolveCoupon,
  computeQuoteAmounts,
  getQuote,
  listCouponsAdmin,
  createCouponAdmin,
  updateCouponAdmin,
  deleteCouponAdmin,
  toggleCouponAdmin,
};
