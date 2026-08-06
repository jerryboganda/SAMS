'use strict';
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12; // CLAUDE.md §1: bcrypt (12 rounds)

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  // Real baseline: the one true admin account, safe and required for every
  // environment including a fresh production instance. Demo/dev-only users
  // (e.g. the demo student) live in seed-01b-demo-student.cjs so SEED_MODE=prod
  // can skip them without touching this real-content seeder.
  async up(queryInterface) {
    const now = new Date();
    const [existing] = await queryInterface.sequelize.query(
      "SELECT email FROM users WHERE email = 'admin@samsacademy.com'"
    );
    if (existing.length > 0) {
      console.log('[seed:users] admin already present, skipping.');
      return;
    }

    await queryInterface.bulkInsert('users', [
      {
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
      },
    ]);
    console.log('[seed:users] inserted admin user.');
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'admin@samsacademy.com' });
  },
};
