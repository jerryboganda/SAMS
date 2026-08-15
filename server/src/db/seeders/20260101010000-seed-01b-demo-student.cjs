'use strict';

// server/src/db/seeders/20260101010000-seed-01b-demo-student.cjs
// Demo student accounts for development, testing, and initial bootstrap.

const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS, DEMO_STUDENTS } = require('../demoData/studentActivityData.cjs');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const emails = DEMO_STUDENTS.map((s) => s.email);
    const [existing] = await queryInterface.sequelize.query(
      'SELECT email FROM users WHERE email IN (:emails)',
      { replacements: { emails } }
    );
    const existingEmails = new Set(existing.map((r) => r.email));

    const rows = DEMO_STUDENTS.filter((s) => !existingEmails.has(s.email)).map((s) => ({
      name: s.name,
      email: s.email,
      phone: null,
      password_hash: bcrypt.hashSync(s.password, BCRYPT_ROUNDS),
      role: 'student',
      status: 'active',
      email_verified_at: now,
      twofa_enabled: false,
      twofa_secret: null,
      twofa_backup_codes: null,
      last_login_at: null,
      created_at: now,
      updated_at: now,
    }));

    if (rows.length > 0) {
      await queryInterface.bulkInsert('users', rows);
      console.log(`[seed:demo-student] inserted ${rows.length} demo student(s).`);
    } else {
      console.log('[seed:demo-student] demo students already present, skipping.');
    }
  },

  async down(queryInterface) {
    const emails = DEMO_STUDENTS.map((s) => s.email);
    await queryInterface.bulkDelete('users', { email: emails });
  },
};
