// server/tests/helpers/checkoutFixtures.js
// Shared fixture builder for Phase 9.1-9.2 checkout/coupon supertest specs —
// mirrors tests/helpers/publicFixtures.js/studentFixtures.js's pattern (rows
// created directly via the model layer; server/tests/globalSetup.cjs
// migrates the test DB fresh per run but never seeds it).
import db from '../../src/models/index.js';

const { Coupon } = db;

let counter = 0;
function uniqueSuffix(prefix = 'fixture') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/** A generic-application (courseId: null), unlimited-use, always-valid, active coupon unless overridden. */
export async function createCoupon(overrides = {}) {
  return Coupon.create({
    code: overrides.code || `TEST${uniqueSuffix('coupon').toUpperCase().replace(/[^A-Z0-9]/g, '')}`.slice(0, 40),
    type: 'percent',
    value: 10,
    courseId: null,
    maxUses: null,
    usedCount: 0,
    validFrom: null,
    validUntil: null,
    isActive: true,
    ...overrides,
  });
}

export default { createCoupon };
