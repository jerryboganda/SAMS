// server/src/db/sequelize.js
// Single shared Sequelize instance, built from the zod-validated env config.
// Naming strategy: docs/03_DATABASE_SCHEMA.md uses snake_case columns
// (created_at/updated_at, user_id, ...) throughout, so `underscored: true`
// is set globally — models declare camelCase JS attributes (createdAt,
// userId) and Sequelize maps them to snake_case columns automatically.
// This is a deliberate Phase-0 decision so Phase 1 models don't have to
// fight column naming later (see DECISIONS.md).
import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

// docs/08_TESTING_QA.md: jest+supertest always run against the dedicated
// DB_NAME_test database (migrated fresh per run), never the dev database.
const databaseName = env.NODE_ENV === 'test' ? env.DB_NAME_test : env.DB_NAME;

export const sequelize = new Sequelize(databaseName, env.DB_USER, env.DB_PASS, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  timezone: '+00:00', // store/read all DATETIMEs as UTC
  logging: env.NODE_ENV === 'development' ? (msg) => logger.debug(msg) : false,
  define: {
    underscored: true,
    timestamps: true,
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: {
    connectTimeout: 5000,
  },
});

/**
 * Attempts a short-timeout DB authentication check. Never throws — callers
 * (e.g. the /health route) get a clean boolean instead of a crash/hang.
 */
export async function checkDbConnection(timeoutMs = 4000) {
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB authenticate timed out')), timeoutMs)),
    ]);
    return true;
  } catch (err) {
    logger.warn(`[db] connection check failed: ${err.message}`);
    return false;
  }
}

export default sequelize;
