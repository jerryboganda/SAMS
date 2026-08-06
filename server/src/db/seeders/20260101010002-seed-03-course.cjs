'use strict';

const COURSE_SLUG = 'nre-step-1-complete-course';

const SECTIONS = [
  {
    title: 'Section 1: Basic Sciences Foundations',
    lectures: [
      { title: 'Orientation & How to Use the QBank', minutes: 8, freePreview: true },
      { title: 'High-Yield Anatomy Review', minutes: 22 },
      { title: 'Core Physiology Concepts', minutes: 25 },
    ],
  },
  {
    title: 'Section 2: Systemic Pathology Review',
    lectures: [
      { title: 'Cardiovascular System Overview', minutes: 30 },
      { title: 'Respiratory & Renal Systems', minutes: 27 },
      { title: 'GIT, Endocrine & Neuro Highlights', minutes: 33 },
    ],
  },
];

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    if (process.env.SEED_MODE === 'prod') {
      console.log('[seed:course] skipped — SEED_MODE=prod (demo-only content).');
      return;
    }

    const now = new Date();

    const [existingCourse] = await queryInterface.sequelize.query(
      'SELECT id FROM courses WHERE slug = :slug',
      { replacements: { slug: COURSE_SLUG } }
    );
    if (existingCourse.length > 0) {
      console.log('[seed:course] course already present, skipping.');
      return;
    }

    await queryInterface.bulkInsert('courses', [
      {
        title: 'NRE Step 1 Complete Course',
        slug: COURSE_SLUG,
        exam_category: 'NRE1',
        short_description: 'A complete NRE Step 1 prep course covering basic sciences and systemic pathology.',
        description:
          'This course walks through the core basic-science foundations and systemic pathology topics tested ' +
          'on the NRE Step 1 exam, paired with a full QBank of practice questions and a timed mock exam. ' +
          'Includes video lectures, lecture bookmarks/progress tracking, and 180 days of access.',
        thumbnail_url: null,
        price: 15000.0,
        currency: 'PKR',
        validity_days: 180,
        includes_qbank: true,
        is_published: true,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
    ]);

    const [[{ id: courseId }]] = await queryInterface.sequelize.query(
      'SELECT id FROM courses WHERE slug = :slug',
      { replacements: { slug: COURSE_SLUG } }
    );

    for (let sIdx = 0; sIdx < SECTIONS.length; sIdx += 1) {
      const section = SECTIONS[sIdx];
      await queryInterface.bulkInsert('course_sections', [
        {
          course_id: courseId,
          title: section.title,
          sort_order: sIdx,
          created_at: now,
          updated_at: now,
        },
      ]);
      const [[{ id: sectionId }]] = await queryInterface.sequelize.query(
        'SELECT id FROM course_sections WHERE course_id = :courseId AND title = :title',
        { replacements: { courseId, title: section.title } }
      );

      const lectureRows = section.lectures.map((lec, lIdx) => ({
        course_id: courseId,
        section_id: sectionId,
        title: lec.title,
        description: `${lec.title} — part of ${section.title}.`,
        video_provider: 'mock',
        video_ref: `mock-lecture-${sIdx + 1}-${lIdx + 1}`,
        duration_seconds: lec.minutes * 60,
        is_free_preview: Boolean(lec.freePreview),
        is_published: true,
        sort_order: lIdx,
        created_at: now,
        updated_at: now,
      }));
      await queryInterface.bulkInsert('lectures', lectureRows);
    }

    console.log('[seed:course] inserted 1 course, 2 sections, 6 lectures.');
  },

  async down(queryInterface) {
    // FK ON DELETE CASCADE handles course_sections + lectures.
    await queryInterface.bulkDelete('courses', { slug: COURSE_SLUG });
  },
};
