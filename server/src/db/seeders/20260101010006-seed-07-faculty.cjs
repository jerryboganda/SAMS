'use strict';

// server/src/db/seeders/20260101010006-seed-07-faculty.cjs
// Synchronized faculty seeder.

const siteContentData = require('../demoData/siteContentData.cjs');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    let insertedCount = 0;

    for (const f of siteContentData.faculty) {
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM faculty WHERE name = :name', {
        replacements: { name: f.name },
      });
      if (existing.length === 0) {
        await queryInterface.bulkInsert('faculty', [
          {
            name: f.name,
            title: f.title,
            bio: f.bio,
            photo_url: f.photo_url,
            sort_order: f.sort_order,
            is_active: f.is_active,
            created_at: now,
            updated_at: now,
          },
        ]);
        insertedCount += 1;
      }
    }

    console.log(`[seed:faculty] inserted ${insertedCount} faculty member(s).`);
  },

  async down(queryInterface) {
    const facultyNames = siteContentData.faculty.map((f) => f.name);
    await queryInterface.bulkDelete('faculty', { name: facultyNames });
  },
};
