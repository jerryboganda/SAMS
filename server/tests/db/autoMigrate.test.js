// server/tests/db/autoMigrate.test.js
// Unit test verifying programmatic auto-migration execution
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import db from '../../src/models/index.js';
import { runAutoMigrations } from '../../src/db/autoMigrate.js';

const { sequelize } = db;

describe('Automatic Database Migrator (autoMigrate.js)', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('runAutoMigrations runs idempotently and verifies SequelizeMeta state', async () => {
    // Should run smoothly without throwing any errors
    await expect(runAutoMigrations()).resolves.not.toThrow();

    // Verify SequelizeMeta table exists and has recorded migrations
    const [rows] = await sequelize.query('SELECT `name` FROM `SequelizeMeta` ORDER BY `name` ASC;');
    expect(rows.length).toBeGreaterThan(0);

    // Verify latest migration is present in SequelizeMeta
    const hasLatestMigration = rows.some((r) => r.name.includes('create-subscription-packages'));
    expect(hasLatestMigration).toBe(true);

    // Second run should be a clean no-op
    await expect(runAutoMigrations()).resolves.not.toThrow();
  });
});
