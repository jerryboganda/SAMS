// server/src/db/config.cjs
// sequelize-cli config (dev/test/production), built from the same fixed env
// var names used by server/src/config/env.js. Kept as plain CommonJS
// (.cjs) deliberately: server/package.json sets "type": "module" for the
// app's own ESM source, but sequelize-cli's config/migration/seeder loader
// requires() this file, which is incompatible with ESM syntax — .cjs sidesteps
// that regardless of the package's "type" field. See DECISIONS.md.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env') });

const base = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
  timezone: '+00:00',
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: {
    ...base,
    database: process.env.DB_NAME || 'sams_academy',
  },
  test: {
    ...base,
    database: process.env.DB_NAME_test || 'sams_academy_test',
    logging: false,
  },
  // Phase 12.4 perf-suite DB (docs/07_EXECUTION_PLAN.md) — a THIRD, dedicated
  // database for server/scripts/perf/*'s synthetic 10k-question/1k-user load,
  // migrated fresh by those scripts themselves via `sequelize-cli --env perf`
  // (same shell-out mechanism server/tests/globalSetup.cjs already uses for
  // `--env test`). Never assumed to pre-exist; never touches DB_NAME/DB_NAME_test.
  perf: {
    ...base,
    database: process.env.DB_NAME_PERF || 'sams_academy_perf',
    logging: false,
  },
  production: {
    ...base,
    database: process.env.DB_NAME || 'sams_academy',
    logging: false,
  },
};
