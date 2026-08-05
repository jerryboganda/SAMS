// server/scripts/perf/lib/perfDb.js
// Shared connection/schema/model-loading helpers for the Phase 12.4 perf
// suite (server/scripts/perf/seedSyntheticLoad.js,
// server/scripts/perf/runPerfSuite.js — docs/07_EXECUTION_PLAN.md 12.4).
//
// Deliberately independent of server/src/db/sequelize.js +
// server/src/models/index.js's shared singleton, which is hard-wired to
// `NODE_ENV === 'test' ? DB_NAME_test : DB_NAME` — there is no third branch
// for a perf DB, and adding a `perf` value to NODE_ENV's enum would widen
// behavior across the entire app (helmet/CORS/logging all key off NODE_ENV)
// for a one-off scripting need, which this task's "don't touch app.js/
// index.js" constraint rules out anyway. Instead this module builds its OWN,
// fully separate Sequelize connection bound to `env.DB_NAME_PERF`, and
// re-loads the exact same model definition files server/src/models/*.js
// already export via the SAME dynamic-import + associate loop
// server/src/models/index.js itself runs (see loadPerfModels below) — just
// parameterized over a caller-supplied sequelize instance instead of that
// file's hard-wired singleton. Every EXPLAIN/query this suite runs is
// therefore against the real, current association/schema definitions, never
// a hand-rolled duplicate — while remaining physically incapable of
// resolving to DB_NAME or DB_NAME_test.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { Sequelize } from 'sequelize';
import { env } from '../../../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// lib/ -> perf/ -> scripts/ -> server/
export const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');
const MODELS_DIR = path.join(SERVER_ROOT, 'src', 'models');

export const PERF_DB_NAME = env.DB_NAME_PERF;

/**
 * Hard safety gate (CLAUDE.md: "must NEVER be destructive to the real dev
 * database or the auto-migrated-per-run test database"). Checked at the top
 * of every perf script's main() — refuses to proceed at all if DB_NAME_PERF
 * has been left equal to DB_NAME or DB_NAME_test (e.g. a misconfigured
 * .env), rather than silently reset-migrating/reseeding a real database.
 */
export function assertPerfDbIsolated() {
  if (PERF_DB_NAME === env.DB_NAME) {
    throw new Error(
      `[perf] DB_NAME_PERF ("${PERF_DB_NAME}") must not equal DB_NAME (the real dev DB). Refusing to proceed.`
    );
  }
  if (PERF_DB_NAME === env.DB_NAME_test) {
    throw new Error(
      `[perf] DB_NAME_PERF ("${PERF_DB_NAME}") must not equal DB_NAME_test (the jest test DB reset by ` +
        `server/tests/globalSetup.cjs on every \`npm test\` run). Refusing to proceed.`
    );
  }
}

/**
 * `CREATE DATABASE IF NOT EXISTS` via a one-off raw connection with no
 * database selected (mysql2 — the same driver Sequelize itself uses under
 * the hood, already a dependency; no new package needed). If the configured
 * DB_USER lacks a global CREATE DATABASE privilege (common on a
 * least-privilege app DB user — confirmed true for this project's own local
 * dev credential while building this suite, see docs/PERF_REPORT.md), this
 * throws a clear, actionable error with the one-time bootstrap GRANT an
 * operator needs to run, rather than a bare MySQL access-denied stack trace.
 */
export async function ensureDatabaseExists() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASS,
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${PERF_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    throw new Error(
      `[perf] Could not CREATE DATABASE IF NOT EXISTS \`${PERF_DB_NAME}\` as DB_USER="${env.DB_USER}" (${err.message}). ` +
        `This DB user needs either a global CREATE DATABASE privilege, or a one-time pre-provisioned grant: ` +
        `GRANT ALL PRIVILEGES ON \`${PERF_DB_NAME}\`.* TO '${env.DB_USER}'@'${env.DB_HOST}'; FLUSH PRIVILEGES; ` +
        `— run once by an operator with sufficient MySQL privileges, then re-run this script.`
    );
  } finally {
    await conn.end();
  }
}

function runCli(args) {
  execFileSync('npx', ['sequelize-cli', ...args, '--env', 'perf'], {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
    shell: true,
  });
}

/**
 * Full schema reset — `db:migrate:undo:all` (swallowing the "nothing to
 * undo" first-run error) then `db:migrate`, both against `--env perf`
 * (server/src/db/config.cjs's new `perf` key) — the EXACT SAME mechanism
 * server/tests/globalSetup.cjs already established for `--env test`,
 * mirrored rather than reinvented per this task's own instruction. Used by
 * seedSyntheticLoad.js as its idempotent-re-run strategy — see that file's
 * header comment for the full rationale.
 */
export function resetPerfSchema() {
  try {
    runCli(['db:migrate:undo:all']);
  } catch {
    // First-ever run against this perf DB (no SequelizeMeta table yet) —
    // nothing to undo, safe to ignore and proceed straight to migrating.
  }
  runCli(['db:migrate']);
}

/**
 * Applies any PENDING migrations without undoing/dropping anything first —
 * used by Part C (adding a new index migration) to upgrade an
 * already-seeded perf DB in place so a before/after re-measurement is
 * against the SAME seeded data, not a freshly wiped-and-reseeded one.
 */
export function migratePerfDb() {
  runCli(['db:migrate']);
}

/**
 * Builds a fresh Sequelize connection bound to the perf DB — same
 * dialect/timezone/underscored/pool options as server/src/db/sequelize.js,
 * just a different, isolated database name (never imports that file, so
 * there is no way for this to accidentally resolve to DB_NAME/DB_NAME_test).
 */
export function buildPerfSequelize({ logging = false } = {}) {
  return new Sequelize(PERF_DB_NAME, env.DB_USER, env.DB_PASS, {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: 'mysql',
    timezone: '+00:00',
    logging,
    define: { underscored: true, timestamps: true },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    dialectOptions: { connectTimeout: 5000 },
  });
}

/**
 * Re-loads every server/src/models/*.js factory against the given
 * (perf-bound) sequelize instance — the exact same dynamic-import +
 * associate loop server/src/models/index.js itself runs, just parameterized
 * so it can target a connection other than that file's own hard-wired
 * singleton. Never modifies server/src/models/index.js or any model file.
 */
export async function loadPerfModels(sequelize) {
  const modelFiles = fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.js') && f !== 'index.js');
  const db = {};
  for (const file of modelFiles) {
    const mod = await import(pathToFileURL(path.join(MODELS_DIR, file)).href);
    const defineModel = mod.default;
    const model = defineModel(sequelize);
    db[model.name] = model;
  }
  for (const modelName of Object.keys(db)) {
    if (typeof db[modelName].associate === 'function') {
      db[modelName].associate(db);
    }
  }
  db.sequelize = sequelize;
  return db;
}

// ---------------------------------------------------------------------------
// Small generation utilities shared by seedSyntheticLoad.js
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) — same technique already established by server/src/db/seeders/20260101010003-seed-04-questions.cjs and 20260101010009-seed-10-demo-activity.cjs, reused here at a much larger N so re-runs of this script are reproducible. */
export function mulberry32(seed) {
  let s = seed;
  return function rand() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

export function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

export function shuffle(rand, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * `bulkCreate` in fixed-size batches (never one INSERT per row — the same
 * batching-discipline tradeoff server/src/services/statsService.js's header
 * comment discusses for its own bulk `UPDATE`, applied here to `bulkCreate`
 * instead). Returns the full concatenated array of created instances (with
 * `.id` populated per MySQL's consecutive auto-increment allocation for a
 * single bulk INSERT statement — verified empirically while building this
 * script), so callers can immediately use real FK ids for the next table
 * without a follow-up SELECT.
 */
export async function bulkInsertBatched(Model, rows, { batchSize = 3000, label } = {}) {
  const inserted = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const created = await Model.bulkCreate(chunk, { validate: false });
    inserted.push(...created);
    if (label) {
      process.stdout.write(`\r[perf] ${label}: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }
  }
  if (label) process.stdout.write('\n');
  return inserted;
}
