'use strict';

// server/src/db/seeders/20260101010002-seed-03-course.cjs
// Synchronized course curriculum seeder.

const coursesData = require('../demoData/coursesData.cjs');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const courseSlugs = coursesData.map((c) => c.slug);
    const [existingCourses] = await queryInterface.sequelize.query(
      'SELECT id, slug FROM courses WHERE slug IN (:slugs)',
      { replacements: { slugs: courseSlugs } }
    );
    const existingSlugs = new Set(existingCourses.map((c) => c.slug));

    let insertedCount = 0;
    for (let cIdx = 0; cIdx < coursesData.length; cIdx += 1) {
      const courseDef = coursesData[cIdx];
      if (existingSlugs.has(courseDef.slug)) continue;

      await queryInterface.bulkInsert('courses', [
        {
          title: courseDef.title,
          slug: courseDef.slug,
          exam_category: courseDef.exam_category,
          short_description: courseDef.short_description,
          description: courseDef.description,
          thumbnail_url: courseDef.thumbnail_url,
          price: courseDef.price,
          currency: courseDef.currency,
          validity_days: courseDef.validity_days,
          includes_qbank: courseDef.includes_qbank,
          is_published: courseDef.is_published,
          sort_order: courseDef.sort_order ?? cIdx,
          created_at: now,
          updated_at: now,
        },
      ]);

      const [[courseRow]] = await queryInterface.sequelize.query(
        'SELECT id FROM courses WHERE slug = :slug',
        { replacements: { slug: courseDef.slug } }
      );
      const courseId = courseRow.id;

      for (let sIdx = 0; sIdx < courseDef.sections.length; sIdx += 1) {
        const sectionDef = courseDef.sections[sIdx];
        await queryInterface.bulkInsert('course_sections', [
          {
            course_id: courseId,
            title: sectionDef.title,
            sort_order: sIdx,
            created_at: now,
            updated_at: now,
          },
        ]);

        const [[sectionRow]] = await queryInterface.sequelize.query(
          'SELECT id FROM course_sections WHERE course_id = :courseId AND title = :title',
          { replacements: { courseId, title: sectionDef.title } }
        );
        const sectionId = sectionRow.id;

        const lectureRows = sectionDef.lectures.map((lec, lIdx) => ({
          course_id: courseId,
          section_id: sectionId,
          title: lec.title,
          description: `${lec.title} — essential clinical and basic science lecture for ${courseDef.title}.`,
          video_provider: 'mock',
          video_ref: `mock-${courseDef.slug}-s${sIdx + 1}-l${lIdx + 1}`,
          duration_seconds: lec.duration_seconds || (lec.minutes || 20) * 60,
          is_free_preview: Boolean(lec.is_free_preview),
          is_published: true,
          sort_order: lIdx,
          created_at: now,
          updated_at: now,
        }));
        await queryInterface.bulkInsert('lectures', lectureRows);
      }
      insertedCount += 1;
    }

    console.log(`[seed:course] inserted ${insertedCount} course(s).`);
  },

  async down(queryInterface) {
    const courseSlugs = coursesData.map((c) => c.slug);
    await queryInterface.bulkDelete('courses', { slug: courseSlugs });
  },
};
