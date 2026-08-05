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

export default { resolveCoupon, computeQuoteAmounts, getQuote };
