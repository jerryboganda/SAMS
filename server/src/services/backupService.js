// server/src/services/backupService.js
// Phase 12.3 — weekly DB backup logic (docs/10_SECURITY_CHECKLIST.md §H:
// "Weekly mysqldump rotation + Hostinger backups; restore procedure
// documented"; docs/09_DEPLOYMENT_HOSTINGER.md: "Weekly mysqldump to
// storage/backups (keep 4)"). Mirrors this codebase's established
// "thin cron wrapper in jobs/, real logic directly unit-tested in
// services/" split — see jobs/enrollmentLifecycleCron.js +
// services/enrollmentLifecycleService.js for the exact precedent this file
// copies. jobs/backupCron.js is the node-cron SCHEDULING ONLY; everything
// below is called DIRECTLY by server/tests/jobs/backupCron.test.js, never
// by exercising real cron scheduling.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env, REPO_ROOT } from '../config/env.js';
import logger from '../utils/logger.js';

// Same directory precedent as utils/logger.js's LOG_DIR: storage/<thing>
// under the repo root, created on demand.
export const BACKUPS_DIR = path.join(REPO_ROOT, 'storage', 'backups');

// Same NODE_ENV-based DB name selection as db/sequelize.js's own
// `databaseName` — deliberately mirrored rather than imported, since
// sequelize.js computes it as a local const, not an export. This is what
// makes runDatabaseBackup() "work correctly in whatever NODE_ENV it runs
// under": in dev/production it dumps DB_NAME; when this function is called
// directly by the test suite (NODE_ENV=test), it dumps DB_NAME_test — the
// same real test database the rest of the suite already runs against —
// never the dev/production database. The actual cron *registration*
// (jobs/backupCron.js -> jobs/index.js#registerCronJobs) is never even
// reached under NODE_ENV=test in the first place (server/index.js only
// calls registerCronJobs() when NODE_ENV !== 'test'), so there's no
// separate schedule-time guard needed here — this function-level DB
// selection is what keeps a *direct* test-time call safe/correct too.
function currentDatabaseName() {
  return env.NODE_ENV === 'test' ? env.DB_NAME_test : env.DB_NAME;
}

// ISO timestamps contain `:` — invalid in Windows filenames and just
// awkward everywhere else. Swap `:` and `.` for `-` so the result is safe
// on every OS while staying sortable (still lexicographically ordered,
// oldest-to-newest) — e.g. "2026-08-05T03-00-00-000Z".
function filenameSafeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Spawns mysqldump (never a shell-interpolated `exec` string — execFile/
 * spawn with an argv array avoids shell-injection entirely, even though
 * every argument here comes from trusted env vars) and streams its stdout
 * straight to `outFilePath`. The DB password is passed via the MYSQL_PWD
 * child-process env var, never a `--password=` CLI flag — a `--password=`
 * flag is visible to any other process on the box via `ps`/task manager,
 * a real concern on shared hosting (same reasoning as this project's other
 * secret-handling code).
 */
function spawnMysqldump({ args, outFilePath }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const out = fs.createWriteStream(outFilePath);
    let child;

    const finishWithError = (err) => {
      if (settled) return;
      settled = true;
      out.destroy();
      reject(err);
    };

    try {
      child = spawn(env.MYSQLDUMP_PATH, args, {
        env: { ...process.env, MYSQL_PWD: env.DB_PASS },
      });
    } catch (err) {
      // Synchronous throw (rare, but spawn can throw for some invalid
      // option combos) — treat identically to the async 'error' event below.
      finishWithError(err);
      return;
    }

    // 'error' fires for things like "mysqldump not installed / not on
    // PATH" (ENOENT) — must be handled gracefully, not crash the caller.
    child.on('error', finishWithError);

    let stderrTail = '';
    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000); // bounded, avoid unbounded memory growth
    });

    child.stdout.pipe(out);

    child.on('close', (code) => {
      if (settled) return;
      // Wait for the write stream to actually finish flushing to disk
      // before resolving, so callers can trust the file is complete the
      // moment this promise resolves.
      out.end(() => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`mysqldump exited with code ${code}: ${stderrTail.trim()}`));
        }
      });
    });
  });
}

/**
 * Deletes every backup file for `databaseName` beyond the newest `keep`.
 * Matches on this DB's own filename prefix only, so backups for a
 * differently-named database (e.g. a one-off manual dump) are never
 * touched. Sorted by mtime (newest first), filename as a tiebreaker (the
 * ISO-timestamp filenames sort identically to mtime order in practice, but
 * a tiebreak avoids any ambiguity when two dumps land in the same
 * millisecond-truncated mtime).
 */
function rotateBackups(databaseName, keep) {
  const prefix = `${databaseName}-`;
  let entries;
  try {
    entries = fs.readdirSync(BACKUPS_DIR);
  } catch {
    return 0; // directory doesn't exist yet — nothing to rotate
  }

  const files = entries
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sql'))
    .map((name) => {
      const filePath = path.join(BACKUPS_DIR, name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(filePath).mtimeMs;
      } catch {
        // file vanished between readdir and stat — sorts last, harmless
      }
      return { name, filePath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));

  const toDelete = files.slice(Math.max(keep, 0));
  let deletedCount = 0;
  for (const file of toDelete) {
    try {
      fs.unlinkSync(file.filePath);
      deletedCount += 1;
    } catch (err) {
      logger.error(`[backup] failed to delete old backup "${file.name}": ${err.message}`);
    }
  }
  return deletedCount;
}

/**
 * Runs a full mysqldump of the current database, writes it to
 * storage/backups/{dbName}-{timestamp}.sql, then rotates old backups for
 * that same database down to `keep` (default 4 — "mysqldump rotate 4" per
 * docs/07_EXECUTION_PLAN.md 12.3 / docs/09_DEPLOYMENT_HOSTINGER.md).
 *
 * Best-effort/non-crashing by design (same philosophy as every other cron
 * job in this codebase, e.g. enrollmentLifecycleCron.js's per-sweep
 * try/catch): if mysqldump isn't installed/on PATH, or exits non-zero, this
 * logs the failure and resolves with `{success:false}` rather than
 * throwing — a failed backup must never crash the calling cron tick or the
 * server process.
 *
 * @returns {Promise<{success: boolean, filePath: string|null, deletedCount: number}>}
 */
export async function runDatabaseBackup({ keep = 4 } = {}) {
  const databaseName = currentDatabaseName();

  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const filename = `${databaseName}-${filenameSafeTimestamp()}.sql`;
  const filePath = path.join(BACKUPS_DIR, filename);

  // --single-transaction: consistent InnoDB snapshot without table locks,
  // so a backup running against a live app never blocks student traffic.
  const args = [
    '-h', env.DB_HOST,
    '-P', String(env.DB_PORT),
    '-u', env.DB_USER,
    '--single-transaction',
    '--routines',
    databaseName,
  ];

  try {
    await spawnMysqldump({ args, outFilePath: filePath });
  } catch (err) {
    logger.error(`[backup] mysqldump failed for database "${databaseName}": ${err.message}`);
    // Clean up whatever partial file may have been created — a 0-byte or
    // truncated .sql file must never masquerade as a real backup, and must
    // never survive to be counted by a later rotation.
    try {
      fs.unlinkSync(filePath);
    } catch {
      // never created / already gone — fine
    }
    return { success: false, filePath: null, deletedCount: 0 };
  }

  logger.info(`[backup] database backup written: ${filePath}`);

  const deletedCount = rotateBackups(databaseName, keep);
  if (deletedCount > 0) {
    logger.info(`[backup] rotation: deleted ${deletedCount} old backup(s) for "${databaseName}" (keeping ${keep}).`);
  }

  return { success: true, filePath, deletedCount };
}

export default { runDatabaseBackup };
