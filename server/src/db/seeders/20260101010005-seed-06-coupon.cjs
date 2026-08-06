'use strict';

const COUPON_CODE = 'WELCOME10';

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    if (process.env.SEED_MODE === 'prod') {
      console.log('[seed:coupon] skipped — SEED_MODE=prod (demo-only content).');
      return;
    }

    const now = new Date();
    const [existing] = await queryInterface.sequelize.query('SELECT id FROM coupons WHERE code = :code', {
      replacements: { code: COUPON_CODE },
    });
    if (existing.length > 0) {
      console.log('[seed:coupon] WELCOME10 already present, skipping.');
      return;
    }

    await queryInterface.bulkInsert('coupons', [
      {
        code: COUPON_CODE,
        type: 'percent',
        value: 10.0,
        course_id: null,
        max_uses: null,
        used_count: 0,
        valid_from: null,
        valid_until: null,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
    console.log('[seed:coupon] inserted WELCOME10 coupon.');
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('coupons', { code: COUPON_CODE });
  },
};
