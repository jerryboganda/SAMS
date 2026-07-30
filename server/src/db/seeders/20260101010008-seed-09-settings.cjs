'use strict';

const SETTINGS = {
  'legal.privacy': {
    title: 'Privacy Policy',
    content:
      'SAMS Academy collects only the information needed to provide course access, QBank practice, and payment processing. We do not sell personal data to third parties. Contact support for data-access or deletion requests. (Placeholder text — replace with final legal copy before go-live.)',
  },
  'legal.terms': {
    title: 'Terms & Conditions',
    content:
      'By using SAMS Academy you agree to use course and QBank content for personal exam preparation only, not for redistribution. Course access is granted for the validity period shown at purchase. (Placeholder text — replace with final legal copy before go-live.)',
  },
  'legal.refund': {
    title: 'Refund Policy',
    content:
      'Refund requests are reviewed on a case-by-case basis and must be submitted within 7 days of purchase, before significant course or QBank usage. Approved refunds are processed to the original payment method where possible. (Placeholder text — replace with final legal copy before go-live.)',
  },
  'site.about': {
    title: 'About SAMS Academy',
    content:
      'SAMS Academy is a medical exam-prep platform offering video courses, a QBank of practice questions, and timed mock exams for the NRE and related licensing exams. (Placeholder text — replace with final marketing copy before go-live.)',
  },
};

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [existingRows] = await queryInterface.sequelize.query(
      "SELECT `key` FROM settings WHERE `key` IN (:keys)",
      { replacements: { keys: Object.keys(SETTINGS) } }
    );
    const existingKeys = new Set(existingRows.map((r) => r.key));

    const rows = Object.entries(SETTINGS)
      .filter(([key]) => !existingKeys.has(key))
      .map(([key, value]) => ({
        key,
        value: JSON.stringify(value),
        updated_at: now,
      }));

    if (rows.length === 0) {
      console.log('[seed:settings] legal/about settings already present, skipping.');
      return;
    }
    await queryInterface.bulkInsert('settings', rows);
    console.log(`[seed:settings] inserted ${rows.length} setting(s).`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('settings', { key: Object.keys(SETTINGS) });
  },
};
