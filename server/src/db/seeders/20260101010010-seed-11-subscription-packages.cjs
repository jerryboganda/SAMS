'use strict';

// server/src/db/seeders/20260101010010-seed-11-subscription-packages.cjs
// Synchronized subscription packages seeder.

const PACKAGES = [
  {
    title: 'NRE Step 1 Comprehensive Mastery Package',
    slug: 'nre-step-1-mastery',
    description:
      'Complete all-in-one preparation package for NRE Step 1 exam candidates with video lectures, question bank, and timed mock exams.',
    exam_category: 'NRE1',
    price: 15000.0,
    original_price: 20000.0,
    currency: 'PKR',
    validity_days: 180,
    included_course_ids: JSON.stringify([1]),
    includes_qbank: true,
    includes_mock_exams: true,
    max_devices: 2,
    features: JSON.stringify([
      'Full 180 Days Access',
      'Complete HD Video Curriculum',
      '5,000+ Verified QBank MCQs',
      'Timed Mock Exam Simulator',
      'DRM Multi-Device Access',
    ]),
    badge: 'Most Popular',
    sort_order: 1,
    is_active: true,
    is_popular: true,
  },
  {
    title: 'USMLE Step 1 High-Yield Prep Pass',
    slug: 'usmle-step-1-prep',
    description:
      'High-yield comprehensive package for USMLE Step 1 preparation with clinical vignettes, subject videos, and test simulations.',
    exam_category: 'USMLE1',
    price: 25000.0,
    original_price: 35000.0,
    currency: 'PKR',
    validity_days: 365,
    included_course_ids: JSON.stringify([2]),
    includes_qbank: true,
    includes_mock_exams: true,
    max_devices: 2,
    features: JSON.stringify([
      '365 Days Full Validity',
      'All System-Wise Video Modules',
      'USMLE-Style Clinical Vignettes',
      'Unlimited Mock Exam Retakes',
      'Expert Faculty Doubt Support',
    ]),
    badge: 'Best Value',
    sort_order: 2,
    is_active: true,
    is_popular: false,
  },
  {
    title: 'All-Access Clinical Exam Bundle',
    slug: 'all-access-bundle',
    description:
      'Ultimate all-in-one bundle giving unlimited access to all courses, question banks, and mock exams for NRE, USMLE, and SMLE.',
    exam_category: 'BUNDLE',
    price: 45000.0,
    original_price: 65000.0,
    currency: 'PKR',
    validity_days: 365,
    included_course_ids: JSON.stringify([1, 2, 3]),
    includes_qbank: true,
    includes_mock_exams: true,
    max_devices: 2,
    features: JSON.stringify([
      'Complete All-Course Access (NRE + USMLE + SMLE)',
      'Full QBank Access with Explanations',
      'All Specialty Mock Examinations',
      'Priority WhatsApp Support',
      'Free Updates to New Curriculum',
    ]),
    badge: 'Full Access Pass',
    sort_order: 3,
    is_active: true,
    is_popular: false,
  },
];

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const slugs = PACKAGES.map((p) => p.slug);
    const [existingRows] = await queryInterface.sequelize.query(
      'SELECT slug FROM subscription_packages WHERE slug IN (:slugs)',
      { replacements: { slugs } }
    );
    const existingSlugs = new Set(existingRows.map((r) => r.slug));

    const rowsToInsert = PACKAGES.filter((p) => !existingSlugs.has(p.slug)).map((p) => ({
      ...p,
      created_at: now,
      updated_at: now,
    }));

    if (rowsToInsert.length === 0) {
      console.log('[seed:subscription-packages] All packages already seeded, skipping.');
      return;
    }

    await queryInterface.bulkInsert('subscription_packages', rowsToInsert);
    console.log(`[seed:subscription-packages] inserted ${rowsToInsert.length} subscription package(s).`);
  },

  async down(queryInterface) {
    const slugs = PACKAGES.map((p) => p.slug);
    await queryInterface.bulkDelete('subscription_packages', { slug: slugs });
  },
};
