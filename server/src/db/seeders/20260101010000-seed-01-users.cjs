'use strict';
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12; // CLAUDE.md §1: bcrypt (12 rounds)

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [existing] = await queryInterface.sequelize.query(
      "SELECT email FROM users WHERE email IN ('admin@samsacademy.com', 'student@samsacademy.com')"
    );
    const existingEmails = new Set(existing.map((r) => r.email));

    const rows = [];
    if (!existingEmails.has('admin@samsacademy.com')) {
      rows.push({
        name: 'Admin',
        email: 'admin@samsacademy.com',
        phone: null,
        password_hash: bcrypt.hashSync('Admin@12345', BCRYPT_ROUNDS),
        role: 'admin',
        status: 'active',
        email_verified_at: now,
        twofa_enabled: false,
        twofa_secret: null,
        twofa_backup_codes: null,
        last_login_at: null,
        created_at: now,
        updated_at: now,
      });
    }
    if (!existingEmails.has('student@samsacademy.com')) {
      rows.push({
        name: 'Demo Student',
        email: 'student@samsacademy.com',
        phone: null,
        password_hash: bcrypt.hashSync('Student@123', BCRYPT_ROUNDS),
        role: 'student',
        status: 'active',
        email_verified_at: now,
        twofa_enabled: false,
        twofa_secret: null,
        twofa_backup_codes: null,
        last_login_at: null,
        created_at: now,
        updated_at: now,
      });
    }

    if (rows.length === 0) {
      console.log('[seed:users] admin + demo student already present, skipping.');
      return;
    }
    await queryInterface.bulkInsert('users', rows);
    console.log(`[seed:users] inserted ${rows.length} user(s).`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: ['admin@samsacademy.com', 'student@samsacademy.com'],
    });
  },
};
