// server/tests/jobs/backupCron.test.js
// Unit tests for services/backupService.js#runDatabaseBackup -- the LOGIC
// behind jobs/backupCron.js, called directly (per this codebase's
// established convention, enrollmentLifecycleCron.test.js /
// statsReconciliationCron.test.js: don't try to test actual node-cron
// scheduling). This is the Phase 12.3 AC: "backup file appears in dev run
// with test schedule" -- verified here by running the real service function
// against the real (migrated) test database and asserting a genuine,
// non-empty .sql dump lands on disk, plus that rotation actually enforces
// `keep`.
import { afterAll, afterEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import db from '../../src/models/index.js';
import { env } from '../../src/config/env.js';
import { BACKUPS_DIR, runDatabaseBackup } from '../../src/services/backupService.js';

const { sequelize } = db;

// This suite runs under NODE_ENV=test, so runDatabaseBackup() targets
// DB_NAME_test (see backupService.js's currentDatabaseName()) -- the exact
// naming convention this test asserts against.
const TEST_DB_NAME = env.DB_NAME_test;

// Track every file this test file creates so afterEach can remove it --
// mirrors tests/admin/uploads.test.js's own storage-cleanup convention
// (writtenFiles array + afterEach sweep) so repeated `npm test` runs never
// accumulate cruft under storage/backups/.
const createdFiles = [];

function trackAndReturn(result) {
  if (result?.filePath) createdFiles.push(result.filePath);
  return result;
}

afterEach(() => {
  for (const filePath of createdFiles.splice(0)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // already deleted by rotation, or never created -- fine
    }
  }
});

afterAll(async () => {
  await sequelize.close();
});

describe('backupService.runDatabaseBackup', () => {
  test('produces a real, non-empty mysqldump .sql file under storage/backups/ named after the test database', async () => {
    const result = trackAndReturn(await runDatabaseBackup({ keep: 4 }));

    expect(result.success).toBe(true);
    expect(result.filePath).toBeTruthy();
    expect(path.dirname(result.filePath)).toBe(BACKUPS_DIR);
    expect(path.basename(result.filePath)).toMatch(
      new RegExp(`^${TEST_DB_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-.+\\.sql$`)
    );

    // A real file, with real content -- not an empty/failed dump.
    const stats = fs.statSync(result.filePath);
    expect(stats.size).toBeGreaterThan(0);

    const head = fs.readFileSync(result.filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 4096);
    expect(head).toMatch(/-- MySQL dump|CREATE TABLE/i);
  }, 30_000);

  test('rotation: keeps exactly `keep` most-recent backups for this database, deleting the rest', async () => {
    // Seed backup files directly (no need to shell out to mysqldump 5x --
    // rotation only cares about filenames/mtimes matching this DB's
    // pattern, not real SQL content) with staggered mtimes so oldest-first
    // deletion order is unambiguous.
    const seeded = [];
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    for (let i = 0; i < 6; i += 1) {
      const filePath = path.join(BACKUPS_DIR, `${TEST_DB_NAME}-seed-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
      fs.writeFileSync(filePath, '-- MySQL dump\nSEED FILE\n');
      const mtime = new Date(Date.now() - (10 - i) * 60_000); // each successive file is newer
      fs.utimesSync(filePath, mtime, mtime);
      seeded.push(filePath);
      createdFiles.push(filePath); // safety net in case the assertions below fail before rotation runs
    }

    const result = trackAndReturn(await runDatabaseBackup({ keep: 4 }));
    expect(result.success).toBe(true);

    const remaining = fs
      .readdirSync(BACKUPS_DIR)
      .filter((name) => name.startsWith(`${TEST_DB_NAME}-`) && name.endsWith('.sql'));

    // 6 seeded + 1 fresh real dump = 7 candidates -> rotated down to keep:4.
    expect(remaining.length).toBe(4);

    // The freshest file (this run's own real dump) must have survived.
    expect(remaining).toContain(path.basename(result.filePath));

    // The two oldest seeded files must be exactly the ones removed.
    const oldestTwo = seeded.slice(0, 2).map((p) => path.basename(p));
    for (const name of oldestTwo) {
      expect(remaining).not.toContain(name);
    }

    // Clean up whatever rotation left behind that createdFiles doesn't
    // already know about (the newest 3 seeded files survived rotation).
    for (const name of remaining) {
      createdFiles.push(path.join(BACKUPS_DIR, name));
    }
  }, 30_000);

  test('gracefully returns success:false (never throws) when mysqldump cannot be found', async () => {
    const originalPath = env.MYSQLDUMP_PATH;
    env.MYSQLDUMP_PATH = 'this-binary-does-not-exist-anywhere';
    try {
      const result = await runDatabaseBackup({ keep: 4 });
      expect(result.success).toBe(false);
      expect(result.filePath).toBeNull();
      expect(result.deletedCount).toBe(0);
    } finally {
      env.MYSQLDUMP_PATH = originalPath;
    }
  }, 15_000);
});
