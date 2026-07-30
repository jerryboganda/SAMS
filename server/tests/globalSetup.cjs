// server/tests/globalSetup.cjs
// Jest globalSetup: runs once before any test file loads. Ensures the
// dedicated DB_NAME_test MySQL database has a fresh, fully-migrated schema
// for every test run (docs/08_TESTING_QA.md: "migrated fresh per run"),
// so `npm test` is self-sufficient on a clean clone without a manual
// migration step. Plain CommonJS (.cjs) deliberately — same reasoning as
// server/src/db/config.cjs: sequelize-cli's own migration runner requires()
// its config synchronously, and Jest's globalSetup is loaded the same way
// regardless of the package's "type": "module" setting.
'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function globalSetup() {
  const serverRoot = path.resolve(__dirname, '..');
  const run = (args) =>
    execFileSync('npx', ['sequelize-cli', ...args, '--env', 'test'], {
      cwd: serverRoot,
      stdio: 'inherit',
      shell: true,
    });

  try {
    run(['db:migrate:undo:all']);
  } catch {
    // First-ever run against this test DB (no SequelizeMeta table yet) —
    // nothing to undo, safe to ignore and proceed straight to migrating.
  }
  run(['db:migrate']);
};
