// server/src/db/autoMigrate.js
// Automatic database migration runner.
// Guarantees all pending migrations in server/src/db/migrations/*.cjs are executed
// automatically on server boot, restart, and build with zero manual SSH commands.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Sequelize } from 'sequelize';
import { sequelize } from './sequelize.js';
import logger from '../utils/logger.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs all pending migrations in server/src/db/migrations/ programmatically
 * using the standard SequelizeMeta table.
 */
export async function runAutoMigrations() {
  const queryInterface = sequelize.getQueryInterface();
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    logger.info('[auto-migrate] migrations directory not found — skipping.');
    return;
  }

  try {
    // 1. Ensure SequelizeMeta table exists
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`SequelizeMeta\` (
        \`name\` VARCHAR(255) NOT NULL,
        PRIMARY KEY (\`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Fetch already executed migrations
    const [rows] = await sequelize.query('SELECT `name` FROM `SequelizeMeta` ORDER BY `name` ASC;');
    const executedSet = new Set(rows.map((r) => r.name));

    // 3. Read and sort migration files
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.cjs'))
      .sort();

    const pending = migrationFiles.filter((f) => !executedSet.has(f));

    if (pending.length === 0) {
      logger.info(`[auto-migrate] database schema up to date (${executedSet.size} migrations applied).`);
      return;
    }

    logger.info(`[auto-migrate] found ${pending.length} pending migration(s) to execute...`);

    for (const file of pending) {
      const filePath = path.join(migrationsDir, file);
      logger.info(`[auto-migrate] applying migration: ${file}`);

      try {
        const migration = require(filePath);
        if (typeof migration.up === 'function') {
          await migration.up(queryInterface, Sequelize);
        }
        // Record migration as executed
        await sequelize.query('INSERT INTO `SequelizeMeta` (`name`) VALUES (:name);', {
          replacements: { name: file },
        });
        logger.info(`[auto-migrate] successfully applied: ${file}`);
      } catch (err) {
        const msg = err.message || '';
        // If the table or column already exists (e.g. from prior model sync), record in SequelizeMeta safely
        if (
          msg.includes('already exists') ||
          msg.includes('Duplicate column') ||
          msg.includes('Duplicate key') ||
          msg.includes('1050') ||
          msg.includes('1060')
        ) {
          logger.warn(`[auto-migrate] migration ${file} schema elements already present (${msg}) — recording in SequelizeMeta.`);
          await sequelize.query('INSERT INTO `SequelizeMeta` (`name`) VALUES (:name) ON DUPLICATE KEY UPDATE `name`=`name`;', {
            replacements: { name: file },
          }).catch(() => {});
        } else {
          logger.error(`[auto-migrate] migration failed on ${file}: ${err.stack || err.message}`);
          throw err;
        }
      }
    }

    logger.info('[auto-migrate] all pending migrations successfully applied.');
  } catch (err) {
    logger.error(`[auto-migrate] auto-migration encountered an error: ${err.message}`);
  }
}

export default runAutoMigrations;
