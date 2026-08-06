'use strict';
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12; // CLAUDE.md §1: bcrypt (12 rounds)

// Demo/dev-only: a fake student account for local dev + manual QA. Split out
// of seed-01-users.cjs so SEED_MODE=prod (real production go-live) never
// creates it — see 09_DEPLOYMENT_HOSTINGER.md go-live runbook.
/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    if (process.env.SEED_MODE === 'prod') {
      console.log('[seed:demo-student] skipped — SEED_MODE=prod (demo-only content).');
      return;
    }

    const now = new Date();
    const [existing] = await queryInterface.sequelize.query(
      "SELECT email FROM users WHERE email = 'student@samsacademy.com'"
    );
    if (existing.length > 0) {
      console.log('[seed:demo-student] demo student already present, skipping.');
      return;
    }

    await queryInterface.bulkInsert('users', [
      {
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
      },
    ]);
    console.log('[seed:demo-student] inserted demo student user.');
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'student@samsacademy.com' });
  },
};
