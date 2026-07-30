'use strict';

const FACULTY = [
  {
    name: 'Dr. Ayesha Raza',
    title: 'MBBS, FCPS (Internal Medicine)',
    bio: 'Dr. Ayesha has over 10 years of experience teaching internal medicine to NRE and USMLE candidates, with a focus on high-yield clinical reasoning.',
  },
  {
    name: 'Dr. Bilal Ahmed',
    title: 'MBBS, MRCP (UK)',
    bio: 'Dr. Bilal specializes in cardiovascular and respiratory medicine and has authored practice questions for multiple licensing-exam prep programs.',
  },
  {
    name: 'Dr. Sana Khalid',
    title: 'MBBS, MPhil (Pharmacology)',
    bio: 'Dr. Sana leads pharmacology and biochemistry content development, translating dense basic-science material into exam-focused lessons.',
  },
];

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [[{ cnt }]] = await queryInterface.sequelize.query('SELECT COUNT(*) AS cnt FROM faculty');
    if (Number(cnt) >= FACULTY.length) {
      console.log('[seed:faculty] faculty already present, skipping.');
      return;
    }

    const rows = FACULTY.map((f, idx) => ({
      name: f.name,
      title: f.title,
      bio: f.bio,
      photo_url: null,
      sort_order: idx,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('faculty', rows);
    console.log(`[seed:faculty] inserted ${rows.length} faculty member(s).`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('faculty', { name: FACULTY.map((f) => f.name) });
  },
};
