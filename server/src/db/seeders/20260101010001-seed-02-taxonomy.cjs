'use strict';

const SUBJECTS = [
  'Anatomy',
  'Physiology',
  'Biochemistry',
  'Pathology',
  'Pharmacology',
  'Microbiology',
  'Immunology',
  'Behavioral Science',
  'Biostatistics',
];

const BODY_SYSTEMS = [
  'Cardiovascular',
  'Respiratory',
  'GIT',
  'Renal',
  'Endocrine',
  'Reproductive',
  'MSK',
  'Neuro',
  'Heme/Onc',
  'General Principles',
];

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [existingSubjects] = await queryInterface.sequelize.query('SELECT name FROM subjects');
    const existingSubjectNames = new Set(existingSubjects.map((r) => r.name));
    const subjectRows = SUBJECTS.filter((name) => !existingSubjectNames.has(name)).map((name, idx) => ({
      name,
      sort_order: SUBJECTS.indexOf(name),
      created_at: now,
      updated_at: now,
    }));
    if (subjectRows.length > 0) {
      await queryInterface.bulkInsert('subjects', subjectRows);
      console.log(`[seed:taxonomy] inserted ${subjectRows.length} subject(s).`);
    } else {
      console.log('[seed:taxonomy] subjects already present, skipping.');
    }

    const [existingSystems] = await queryInterface.sequelize.query('SELECT name FROM body_systems');
    const existingSystemNames = new Set(existingSystems.map((r) => r.name));
    const systemRows = BODY_SYSTEMS.filter((name) => !existingSystemNames.has(name)).map((name) => ({
      name,
      sort_order: BODY_SYSTEMS.indexOf(name),
      created_at: now,
      updated_at: now,
    }));
    if (systemRows.length > 0) {
      await queryInterface.bulkInsert('body_systems', systemRows);
      console.log(`[seed:taxonomy] inserted ${systemRows.length} body system(s).`);
    } else {
      console.log('[seed:taxonomy] body_systems already present, skipping.');
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('subjects', { name: SUBJECTS });
    await queryInterface.bulkDelete('body_systems', { name: BODY_SYSTEMS });
  },
};
