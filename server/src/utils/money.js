// server/src/utils/money.js
// Fixed-point-safe money helpers for DECIMAL(10,2) columns (docs/07_EXECUTION_PLAN.md
// 9.1-9.2, docs/03_DATABASE_SCHEMA.md "Integrity & operational rules": "All
// money math server-side, DECIMAL only"). Sequelize/mysql2 hand back DECIMAL
// columns as JS STRINGS (e.g. `course.price === "15000.00"`, not a number) —
// deliberately, so callers don't lose precision doing float math on them.
// `Number("19.99") * 100` is `1998.9999999999998` in IEEE-754 double, NOT
// the exact `1999`, because 19.99 has no exact binary floating-point
// representation (the specific digits affected vary by value — this is why
// money math must never round-trip through float multiplication at all,
// rather than trying to special-case the "bad" values). These helpers
// convert a decimal string/number (at most 2
// fractional digits, as every money column in this schema is DECIMAL(10,2))
// to an integer number of "cents" via pure STRING splitting — never a float
// multiply — do all arithmetic on that integer (exact, since JS numbers
// represent every integer up to 2^53 exactly), then format back to a
// canonical 2-decimal-place string. See DECISIONS.md 2026-08-01.
"use strict";

/** Decimal string/number (<=2 fractional digits) -> integer cents. Never uses float multiplication. */
export function toCents(value) {
  const str = String(value).trim();
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [intPartRaw, fracPartRaw = ''] = unsigned.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;
  // Pad short fractions ("5" -> "50") and truncate any extra digits — every
  // money/percent value in this schema is DECIMAL(10,2), so there should
  // never legitimately be more than 2, but this stays safe either way.
  const fracPart = `${fracPartRaw}00`.slice(0, 2);
  const cents = Number(intPart) * 100 + Number(fracPart);
  return negative ? -cents : cents;
}

/** Integer cents -> canonical "1234.56"-style decimal string (2 fractional digits, never scientific notation). */
export function fromCents(cents) {
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const intPart = Math.floor(abs / 100);
  const fracPart = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

export default { toCents, fromCents };
