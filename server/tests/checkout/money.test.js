// server/tests/checkout/money.test.js
// Unit tests for server/src/utils/money.js's fixed-point-safe cents
// conversion — the thing that makes couponService's quote math never lose
// precision doing float math on Sequelize's DECIMAL-as-string columns
// (docs/03_DATABASE_SCHEMA.md "Integrity & operational rules").
import { describe, expect, test } from '@jest/globals';
import { toCents, fromCents } from '../../src/utils/money.js';

describe('money.toCents / money.fromCents', () => {
  test('toCents parses a plain DECIMAL(10,2) string exactly', () => {
    expect(toCents('15000.00')).toBe(1500000);
    expect(toCents('0.00')).toBe(0);
    expect(toCents('99.99')).toBe(9999);
  });

  test('toCents avoids the classic float-multiply precision bug (19.99 * 100 !== 1999 in IEEE-754)', () => {
    // Sanity-check the bug actually exists in plain float math, so this test
    // is proving something real, not a tautology.
    expect(19.99 * 100).not.toBe(1999);
    // Our string-based conversion gets the exact integer regardless.
    expect(toCents('19.99')).toBe(1999);
    expect(toCents(19.99)).toBe(1999);
  });

  test('toCents pads a short fraction and handles negatives', () => {
    expect(toCents('10')).toBe(1000);
    expect(toCents('10.5')).toBe(1050);
    expect(toCents('-10.50')).toBe(-1050);
  });

  test('fromCents is the exact inverse of toCents for a range of values', () => {
    for (const str of ['0.00', '0.01', '1.00', '99.99', '15000.00', '15000.10', '123456.78']) {
      expect(fromCents(toCents(str))).toBe(str);
    }
  });

  test('fromCents never uses scientific notation and always shows 2 decimals', () => {
    expect(fromCents(5)).toBe('0.05');
    expect(fromCents(100000000)).toBe('1000000.00');
  });
});
