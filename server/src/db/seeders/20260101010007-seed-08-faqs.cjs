'use strict';

// server/src/db/seeders/20260101010007-seed-08-faqs.cjs
// Synchronized FAQs seeder.

const siteContentData = require('../demoData/siteContentData.cjs');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    let insertedCount = 0;

    for (const faq of siteContentData.faqs) {
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM faqs WHERE question = :q', {
        replacements: { q: faq.question },
      });
      if (existing.length === 0) {
        await queryInterface.bulkInsert('faqs', [
          {
            question: faq.question,
            answer: faq.answer,
            sort_order: faq.sort_order,
            is_active: faq.is_active,
            created_at: now,
            updated_at: now,
          },
        ]);
        insertedCount += 1;
      }
    }

    console.log(`[seed:faqs] inserted ${insertedCount} FAQ(s).`);
  },

  async down(queryInterface) {
    const questions = siteContentData.faqs.map((f) => f.question);
    await queryInterface.bulkDelete('faqs', { question: questions });
  },
};
