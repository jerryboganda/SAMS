'use strict';

// server/src/db/seeders/20260101010005-seed-06-coupon.cjs
// Synchronized coupons seeder.

const siteContentData = require('../demoData/siteContentData.cjs');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    let insertedCount = 0;

    for (const c of siteContentData.coupons) {
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM coupons WHERE code = :code', {
        replacements: { code: c.code },
      });
      if (existing.length === 0) {
        await queryInterface.bulkInsert('coupons', [
          {
            code: c.code,
            type: c.type,
            value: c.value,
            course_id: c.course_id,
            max_uses: c.max_uses,
            used_count: c.used_count || 0,
            valid_from: null,
            valid_until: null,
            is_active: c.is_active,
            created_at: now,
            updated_at: now,
          },
        ]);
        insertedCount += 1;
      }
    }

    console.log(`[seed:coupon] inserted ${insertedCount} coupon(s).`);
  },

  async down(queryInterface) {
    const couponCodes = siteContentData.coupons.map((c) => c.code);
    await queryInterface.bulkDelete('coupons', { code: couponCodes });
  },
};
