#!/usr/bin/env node
// server/scripts/smoke/prodSmoke.js
// Phase 14.1 (docs/07_EXECUTION_PLAN.md) — "Production build check:
// NODE_ENV=production npm start from clean clone + .env -> app fully works
// with mock drivers. AC: scripted smoke passes." This formalizes the ad hoc
// clean-clone proof (npm install -> npm run build -> npm run migrate ->
// NODE_ENV=production npm start -> curl health/public-courses/SPA-fallback/
// security-headers) into a real, repeatable, unattended script — same
// shell-out-to-sequelize-cli pattern already established by
// server/tests/globalSetup.cjs and server/scripts/perf/lib/perfDb.js,
// mirrored rather than reinvented.
//
// Usage:
//   node scripts/smoke/prodSmoke.js
//   node scripts/smoke/prodSmoke.js --port=5099 --timeout=30000
//   node scripts/smoke/prodSmoke.js --env-file=../.env.smoke --skip-migrate
//   DB_NAME=sams_academy_test node scripts/smoke/prodSmoke.js   # see below
//
// Flags:
//   --port=<n>        port the smoke-test server instance binds to
//                      (default 5099 — deliberately NOT 5000, so this never
//                      collides with a real dev server already running).
//   --node-env=<env>  NODE_ENV used for BOTH the migration step
//                      (`sequelize-cli --env <env>`, see server/src/db/
//                      config.cjs) and the booted server process
//                      (default 'production' — see rationale below).
//   --timeout=<ms>    health-poll timeout before failing loudly (default 30000)
//   --env-file=<path> extra .env file to load (relative to CWD) BEFORE
//                      server/src/config/env.js loads its own — useful for
//                      pointing a full deploy-shaped config at this script
//                      without touching server/.env.
//   --skip-migrate    skip the migration step (assumes schema already current)
//   --keep-alive      don't shut the server down at the end (debugging only)
//
// Why NODE_ENV defaults to 'production' here specifically (every other
// script in this codebase reads NODE_ENV as-is, never hardcodes it): this
// script's entire job (14.1's own title) is proving the exact
// `NODE_ENV=production npm start` path documented in
// docs/09_DEPLOYMENT_HOSTINGER.md and README.md actually works end to end —
// so both the migration step and the booted server are pinned to
// NODE_ENV=production by default. --node-env is an explicit escape hatch
// (e.g. re-pointing this same harness at the `test` sequelize-cli env
// during local verification of the script itself), not the intended normal
// usage.
//
// DB target: never hardcoded or invented by this script. Whatever
// DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS are already set to (via
// server/.env, a repo-root .env, real process.env vars, or --env-file
// above — see server/src/config/env.js's own load order) is exactly what
// gets migrated and booted against, same as a plain `npm run migrate` /
// `npm start` would use. To safely exercise this script itself against a
// throwaway database rather than a real dev DB, override DB_NAME on the
// command line, e.g.:
//   DB_NAME=sams_academy_test node scripts/smoke/prodSmoke.js
// (server/tests/globalSetup.cjs already re-migrates sams_academy_test fresh
// before every real `npm test` run regardless of what's left in it
// afterwards, so reusing it here for a one-off manual smoke run is safe.)
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/smoke -> scripts -> server
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    port: 5099,
    nodeEnv: 'production',
    timeoutMs: 30000,
    envFile: null,
    skipMigrate: false,
    keepAlive: false,
  };
  for (const a of args) {
    if (a.startsWith('--port=')) opts.port = Number(a.slice('--port='.length));
    else if (a.startsWith('--node-env=')) opts.nodeEnv = a.slice('--node-env='.length);
    else if (a.startsWith('--timeout=')) opts.timeoutMs = Number(a.slice('--timeout='.length));
    else if (a.startsWith('--env-file=')) opts.envFile = a.slice('--env-file='.length);
    else if (a === '--skip-migrate') opts.skipMigrate = true;
    else if (a === '--keep-alive') opts.keepAlive = true;
  }
  return opts;
}

const opts = parseArgs();

if (opts.envFile) {
  const resolved = path.resolve(process.cwd(), opts.envFile);
  const result = dotenv.config({ path: resolved });
  if (result.error) {
    console.error(`[smoke] FAIL — could not load --env-file="${resolved}": ${result.error.message}`);
    process.exit(1);
  }
  console.log(`[smoke] loaded extra env file: ${resolved}`);
}

const results = []; // { name, pass, detail }
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`[smoke] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, { timeoutMs = 5000, ...rest } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'manual', ...rest });
  } finally {
    clearTimeout(timer);
  }
}

let serverProcess = null;

/** Sends SIGTERM (the exact signal server/src/index.js's own graceful-
 * shutdown handler listens for), waits for a clean exit, and SIGKILLs as a
 * last resort — guarantees this script never leaves an orphaned node
 * process running, success or failure.
 *
 * Platform note (verified running this script on this repo's Windows dev
 * box): Node's own docs are explicit that Windows has no real POSIX signal
 * delivery — `child.kill('SIGTERM')` there terminates the process directly
 * (equivalent to SIGKILL) rather than invoking index.js's SIGTERM handler,
 * so `serverProcess.exitCode` will read `null` (terminated, not exited) on
 * Windows even on a fully "clean" run. On Linux (Hostinger, and any real
 * CI), the same call properly delivers SIGTERM and exercises index.js's
 * actual graceful-shutdown path (server.close() + sequelize.close() +
 * exit(0)). Either way, the property this function guarantees — no
 * orphaned process left behind — holds on both platforms; only the
 * *mechanism* differs. */
async function shutdownServer() {
  if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    serverProcess.once('exit', finish);
    serverProcess.kill('SIGTERM');
    // index.js's own force-exit timer fires at 10s — give it headroom, then
    // escalate rather than hang this script forever.
    const killTimer = setTimeout(() => {
      if (!settled && serverProcess && serverProcess.exitCode === null) {
        console.warn('[smoke] server did not exit within 12s of SIGTERM — sending SIGKILL.');
        serverProcess.kill('SIGKILL');
      }
    }, 12000);
    killTimer.unref();
  });
}

async function waitForHealth(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(`server process exited early (code ${serverProcess.exitCode}) while waiting for health — see [server] output above`);
    }
    try {
      const res = await fetchWithTimeout(`${baseUrl}/api/v1/health`, { timeoutMs: 3000 });
      if (res.ok) {
        const body = await res.json();
        if (body?.success === true && body?.data?.status === 'ok') {
          return body;
        }
        lastErr = new Error(`health responded but not fully ready: ${JSON.stringify(body)}`);
      } else {
        lastErr = new Error(`health responded HTTP ${res.status}`);
      }
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for /api/v1/health — last error: ${lastErr?.message}`);
}

async function checkPublicCourses(baseUrl) {
  const res = await fetchWithTimeout(`${baseUrl}/api/v1/public/courses`, { timeoutMs: 5000 });
  const body = await res.json().catch(() => null);
  if (res.status !== 200) throw new Error(`expected HTTP 200, got ${res.status}`);
  if (!body || body.success !== true) throw new Error(`expected {success:true,...}, got ${JSON.stringify(body)}`);
  const items = body.data?.items ?? body.data?.courses ?? body.data;
  return { count: Array.isArray(items) ? items.length : 'n/a' };
}

async function checkSpaFallback(baseUrl) {
  const res = await fetchWithTimeout(`${baseUrl}/courses`, { timeoutMs: 5000 });
  const contentType = res.headers.get('content-type') || '';
  if (res.status !== 200) throw new Error(`expected HTTP 200, got ${res.status}`);
  if (!contentType.includes('text/html')) throw new Error(`expected text/html content-type, got "${contentType}"`);
  return { status: res.status, contentType };
}

async function checkSecurityHeaders(baseUrl) {
  const res = await fetchWithTimeout(`${baseUrl}/`, { timeoutMs: 5000 });
  const csp = res.headers.get('content-security-policy');
  const xfo = res.headers.get('x-frame-options');
  if (!csp) throw new Error('missing Content-Security-Policy header on /');
  if (!xfo) throw new Error('missing X-Frame-Options header on /');
  return { cspPreview: csp.length > 60 ? `${csp.slice(0, 60)}…` : csp, xfo };
}

function runMigrations(nodeEnv) {
  execFileSync('npx', ['sequelize-cli', 'db:migrate', '--env', nodeEnv], {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
}

async function main() {
  console.log(`[smoke] target: NODE_ENV=${opts.nodeEnv} PORT=${opts.port} timeout=${opts.timeoutMs}ms (server root: ${SERVER_ROOT})`);

  // Pin NODE_ENV for both the migration step below and the child server
  // process spawned later, then load the zod-validated env loader — its own
  // validation IS the "confirm required env vars are set" gate (throws with
  // a clear field-level error and non-zero exit on anything genuinely
  // invalid); on success it also emits its own startup warnings for any
  // insecure default still in use (JWT secrets, APP_ENCRYPTION_KEY, `mock`
  // payment gateway in production) — exactly the visibility this step needs
  // without duplicating that logic.
  process.env.NODE_ENV = opts.nodeEnv;
  let env;
  try {
    ({ env } = await import(pathToFileURL(path.join(SERVER_ROOT, 'src', 'config', 'env.js')).href));
    record(
      '1/6 env config loads + validates',
      true,
      `DB=${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}, VIDEO_PROVIDER=${env.VIDEO_PROVIDER}, PAYMENTS_ENABLED_GATEWAYS=${env.PAYMENTS_ENABLED_GATEWAYS}`
    );
  } catch (err) {
    record('1/6 env config loads + validates', false, err.message);
    printSummaryAndExit();
    return;
  }

  // -------------------------------------------------------------------
  // 2. Migrations — against whatever DB env currently points at.
  // -------------------------------------------------------------------
  if (opts.skipMigrate) {
    record('2/6 run migrations', true, 'skipped via --skip-migrate');
  } else {
    try {
      runMigrations(opts.nodeEnv);
      record('2/6 run migrations', true, `sequelize-cli db:migrate --env ${opts.nodeEnv}`);
    } catch (err) {
      record('2/6 run migrations', false, err.message);
      printSummaryAndExit();
      return;
    }
  }

  // -------------------------------------------------------------------
  // 3. Boot the real server process.
  // -------------------------------------------------------------------
  try {
    serverProcess = spawn(process.execPath, ['src/index.js'], {
      cwd: SERVER_ROOT,
      env: { ...process.env, NODE_ENV: opts.nodeEnv, PORT: String(opts.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (buf) => process.stdout.write(`[server] ${buf}`));
    serverProcess.stderr.on('data', (buf) => process.stderr.write(`[server] ${buf}`));
    record('3/6 boot server process', true, `pid=${serverProcess.pid}, node src/index.js`);
  } catch (err) {
    record('3/6 boot server process', false, err.message);
    printSummaryAndExit();
    return;
  }

  // -------------------------------------------------------------------
  // 4/5. Poll health, then run the rest of the assertion set.
  // -------------------------------------------------------------------
  const baseUrl = `http://127.0.0.1:${opts.port}`;
  let healthy = false;
  try {
    const body = await waitForHealth(baseUrl, opts.timeoutMs);
    record('4/6 GET /api/v1/health ready', true, `db:${body.data.db}`);
    healthy = true;
  } catch (err) {
    record('4/6 GET /api/v1/health ready', false, err.message);
  }

  if (healthy) {
    try {
      const r = await checkPublicCourses(baseUrl);
      record('5/6 GET /api/v1/public/courses', true, `items=${r.count}`);
    } catch (err) {
      record('5/6 GET /api/v1/public/courses', false, err.message);
    }

    try {
      const r = await checkSpaFallback(baseUrl);
      record('5/6 GET /courses (SPA deep-link fallback)', true, `${r.status} ${r.contentType}`);
    } catch (err) {
      record('5/6 GET /courses (SPA deep-link fallback)', false, err.message);
    }

    try {
      const r = await checkSecurityHeaders(baseUrl);
      record('5/6 security headers on /', true, `X-Frame-Options=${r.xfo}, CSP="${r.cspPreview}"`);
    } catch (err) {
      record('5/6 security headers on /', false, err.message);
    }
  } else {
    record('5/6 GET /api/v1/public/courses', false, 'skipped — health check did not pass');
    record('5/6 GET /courses (SPA deep-link fallback)', false, 'skipped — health check did not pass');
    record('5/6 security headers on /', false, 'skipped — health check did not pass');
  }

  // -------------------------------------------------------------------
  // 6. Shutdown.
  // -------------------------------------------------------------------
  if (opts.keepAlive) {
    console.log(`[smoke] --keep-alive set — leaving server running at ${baseUrl} (pid=${serverProcess?.pid}).`);
    record('6/6 shutdown server cleanly', true, 'skipped via --keep-alive');
  } else {
    try {
      await shutdownServer();
      record('6/6 shutdown server cleanly', true, `exitCode=${serverProcess?.exitCode}`);
    } catch (err) {
      record('6/6 shutdown server cleanly', false, err.message);
    }
  }

  printSummaryAndExit();
}

function printSummaryAndExit() {
  const failed = results.filter((r) => !r.pass);
  console.log('');
  console.log('[smoke] ==================== SUMMARY ====================');
  for (const r of results) {
    console.log(`[smoke] ${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(
    failed.length === 0
      ? `[smoke] RESULT: ALL ${results.length} CHECKS PASSED`
      : `[smoke] RESULT: ${failed.length}/${results.length} CHECK(S) FAILED`
  );
  console.log('[smoke] ===================================================');
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main()
  .catch(async (err) => {
    console.error('[smoke] FATAL — unexpected error:', err.stack || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Belt-and-braces: never leave an orphaned server process running even
    // if something above threw outside the normal control flow.
    await shutdownServer();
  });
