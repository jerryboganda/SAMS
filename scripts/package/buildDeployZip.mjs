#!/usr/bin/env node
// scripts/package/buildDeployZip.mjs
// (`.mjs` extension deliberate: root package.json has no top-level "type"
// field — CommonJS default — and this brief's only sanctioned root
// package.json edit is the single "package" script line, not adding a
// "type" field; `.mjs` gets unambiguous ES-module treatment from Node with
// zero package.json changes and no MODULE_TYPELESS_PACKAGE_JSON warning.)
// Phase 14.3 (docs/07_EXECUTION_PLAN.md) — builds `deploy.zip` at the repo
// root for the Hostinger ZIP-upload deploy path (docs/09_DEPLOYMENT_HOSTINGER.md
// §1.B.2 "ZIP: upload deploy.zip produced by npm run package"). Replaces the
// former deliberate-failure stub in root package.json's "package" script.
//
// AC (docs/07_EXECUTION_PLAN.md 14.3): "zip contains server/, client/dist,
// package.json, migrations — no dev junk."
//
// What ships (and why), concretely:
//   - <root>/package.json, <root>/package-lock.json
//       Needed so `npm install` on the target box reinstalls the exact
//       locked dependency tree (root's own tiny devDependencies —
//       concurrently/cross-env — plus, via the root `postinstall` hook,
//       server's runtime dependencies).
//   - server/package.json, server/package-lock.json, server/.sequelizerc
//       .sequelizerc is easy to forget but load-bearing: it's what points
//       sequelize-cli at src/db/{migrations,seeders} and src/db/config.cjs
//       instead of its own default ./migrations, ./seeders, ./config —
//       without it, the deploy runbook's `npm run migrate && npm run
//       seed:prod` step (docs/09_DEPLOYMENT_HOSTINGER.md §3 step 2) would
//       silently find zero migrations to run.
//   - server/src/** (recursive) — all real runtime source, including
//       src/db/migrations/ and src/db/seeders/ (the AC's "migrations" is a
//       subset of this, not a separate top-level thing in this codebase's
//       layout).
//   - client/dist/** (recursive) — the ALREADY-BUILT client. Deliberately
//       NOT client/src or client/package.json — see the "ZIP deploys ship a
//       pre-built client" note in docs/09_DEPLOYMENT_HOSTINGER.md for why,
//       and what that means for hPanel's "Build command" setting on this
//       deploy path specifically.
//
// Explicitly excluded ("no dev junk"): any node_modules anywhere, server/.env
// + server/.env.local (real secrets — must never ship), server/tests/ (AC's
// own explicit exclusion), server/scripts/ (dev/ops tooling — smoke tests,
// perf harness — not needed at runtime), server/eslint.config.js (lint
// config, not needed at runtime), .git, client/src, client/node_modules,
// and storage/** contents (uploads/backups/logs/proofs — regenerated at
// runtime via each service's own `fs.mkdirSync(..., {recursive:true})`, see
// e.g. services/backupService.js).
//
// Zip tool: no zip-capable package is a dependency anywhere in this repo
// (checked package.json in root/server/client before writing this), and
// CLAUDE.md §4 says keep dependencies minimal — so this shells out to a
// real system tool with a safe argv array (same "spawn a real CLI, argv
// array, never a shell-interpolated string" pattern already established by
// services/backupService.js's mysqldump call), never a shell string, never
// a new npm dependency. See resolveZipTool() below for the exact
// tool-detection order and the Windows/Git-tar PATH-ordering pitfall it
// works around (verified empirically on this repo's own dev machine).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/package -> scripts -> repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');
const CLIENT_DIST = path.join(REPO_ROOT, 'client', 'dist');
const OUT_FILE = path.join(REPO_ROOT, 'deploy.zip');

function fail(message) {
  console.error(`[package] FAIL — ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Preconditions
// ---------------------------------------------------------------------------

function assertPreconditions() {
  const distIndex = path.join(CLIENT_DIST, 'index.html');
  if (!fs.existsSync(CLIENT_DIST) || !fs.existsSync(distIndex)) {
    fail(`client/dist not found (or missing index.html) at "${CLIENT_DIST}" — run \`npm run build\` first. ` + 'This script packages the already-built client; it does not build it (per docs/07_EXECUTION_PLAN.md 14.3).');
  }
  for (const rel of ['package.json', 'package-lock.json']) {
    if (!fs.existsSync(path.join(REPO_ROOT, rel))) fail(`root "${rel}" not found at repo root.`);
  }
  for (const rel of ['package.json', '.sequelizerc', path.join('src', 'index.js')]) {
    if (!fs.existsSync(path.join(SERVER_DIR, rel))) fail(`server/"${rel}" not found.`);
  }
}

// ---------------------------------------------------------------------------
// 2. Stage exactly the files/dirs that should ship, into a throwaway temp
//    dir (never inside the repo — nothing to accidentally commit or leave
//    behind), preserving the final relative layout the zip should have.
// ---------------------------------------------------------------------------

function copyFile(src, destRel, stagingDir) {
  const dest = path.join(stagingDir, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, destRel, stagingDir) {
  const dest = path.join(stagingDir, destRel);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function stageFiles() {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sams-deploy-'));

  // --- repo root ---
  copyFile(path.join(REPO_ROOT, 'package.json'), 'package.json', stagingDir);
  copyFile(path.join(REPO_ROOT, 'package-lock.json'), 'package-lock.json', stagingDir);

  // --- server (source + manifest only — never node_modules/.env/tests) ---
  copyFile(path.join(SERVER_DIR, 'package.json'), path.join('server', 'package.json'), stagingDir);
  copyFile(path.join(SERVER_DIR, 'package-lock.json'), path.join('server', 'package-lock.json'), stagingDir);
  copyFile(path.join(SERVER_DIR, '.sequelizerc'), path.join('server', '.sequelizerc'), stagingDir);
  copyDir(path.join(SERVER_DIR, 'src'), path.join('server', 'src'), stagingDir);

  // --- client (already-built output only — never src/node_modules) ---
  copyDir(CLIENT_DIST, path.join('client', 'dist'), stagingDir);

  return stagingDir;
}

// ---------------------------------------------------------------------------
// 3. Zip tool resolution + invocation.
// ---------------------------------------------------------------------------

function commandWorks(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'ignore' });
  return !res.error && res.status === 0;
}

/**
 * Resolution order, each shelled out to directly (argv array, no shell
 * string) — mirrors services/backupService.js's mysqldump-spawning pattern:
 *   1. `zip` on PATH — the friendliest cross-platform option (ships by
 *      default on most Linux distros and macOS; this is what a Linux CI box
 *      or Hostinger's own shell would have).
 *   2. Windows: an EXPLICIT path to the OS's own System32\tar.exe (bsdtar,
 *      ships with Windows 10 1803+/Windows 11, supports `--format=zip`).
 *      Resolved by absolute path rather than the bare `tar` command name on
 *      purpose: on a dev box with Git for Windows installed, PATH commonly
 *      resolves plain `tar` to Git's bundled GNU tar first (verified on
 *      this repo's own dev machine — `where tar` / `Get-Command tar -All`
 *      list `Git\usr\bin\tar.exe` before `System32\tar.exe`), and GNU tar
 *      has no zip-writing support at all (`tar: zip: Invalid archive
 *      format`). Going straight to the absolute System32 path sidesteps
 *      that ambiguity entirely.
 *   3. Any other `tar` on PATH that understands `--format=zip` (macOS ships
 *      bsdtar as its default `tar`; some Linux distros do too).
 */
function resolveZipTool() {
  if (commandWorks('zip', ['-v'])) {
    return { label: 'zip', cmd: 'zip', buildArgs: (outFile, entries) => ['-rq', outFile, ...entries] };
  }
  if (process.platform === 'win32') {
    const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(systemTar) && commandWorks(systemTar, ['--version'])) {
      return {
        label: `${systemTar} (bsdtar --format=zip)`,
        cmd: systemTar,
        buildArgs: (outFile, entries) => ['--format=zip', '-cf', outFile, ...entries],
      };
    }
  }
  if (commandWorks('tar', ['--version'])) {
    return {
      label: 'tar (--format=zip)',
      cmd: 'tar',
      buildArgs: (outFile, entries) => ['--format=zip', '-cf', outFile, ...entries],
    };
  }
  fail(
    'No zip-capable tool found (tried `zip`, Windows System32 tar.exe, and `tar --format=zip`). ' +
      'Install Info-ZIP `zip` (or ensure a bsdtar-based `tar` is on PATH) and re-run `npm run package`.'
  );
  return null; // unreachable — fail() exits the process
}

function buildZip(stagingDir) {
  if (fs.existsSync(OUT_FILE)) fs.rmSync(OUT_FILE);

  const tool = resolveZipTool();
  const entries = fs.readdirSync(stagingDir); // ['package.json', 'package-lock.json', 'server', 'client']
  const args = tool.buildArgs(OUT_FILE, entries);
  console.log(`[package] zipping with: ${tool.label}`);
  execFileSync(tool.cmd, args, { cwd: stagingDir, stdio: 'inherit' });
}

/** Lists the archive's contents back out for verification — same tool
 * family used to build it (`zip -l` isn't universal; `-sf`/`unzip -l`
 * availability varies, but every zip-capable tool this script can resolve
 * also supports LISTING via `tar -tf`, since a real PKZIP file's central
 * directory is format-standard — bsdtar and Info-ZIP's own `zip -sf` both
 * work, but `tar -tf` is the one guaranteed available in every branch of
 * resolveZipTool() above, so it's what this always uses regardless of which
 * branch built the archive). */
function listZip() {
  const tarCmd = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const output = execFileSync(tarCmd, ['-tf', OUT_FILE], { encoding: 'utf8' });
  return output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function main() {
  assertPreconditions();
  console.log('[package] staging files...');
  const stagingDir = stageFiles();
  try {
    console.log(`[package] building ${OUT_FILE} ...`);
    buildZip(stagingDir);

    const listing = listZip();
    const stat = fs.statSync(OUT_FILE);
    console.log(`[package] wrote ${OUT_FILE} (${(stat.size / 1024 / 1024).toFixed(2)} MB, ${listing.length} entries):`);
    for (const entry of listing) console.log(`[package]   ${entry}`);

    // Guardrails: fail loudly (non-zero exit) if anything that must never
    // ship slipped in, or anything required is missing — cheap, mechanical
    // re-check of the AC on the ACTUAL produced archive, not just the
    // staging logic above.
    const forbidden = listing.filter((e) => /(^|\/)node_modules\//.test(e) || /(^|\/)\.env(\.|$)/.test(e) || /(^|\/)tests\//.test(e) || e.startsWith('.git/'));
    if (forbidden.length > 0) fail(`archive contains forbidden entries:\n${forbidden.join('\n')}`);

    const required = ['package.json', 'server/package.json', 'server/src/index.js', 'client/dist/index.html'];
    const missing = required.filter((r) => !listing.includes(r) && !listing.some((e) => e === r));
    if (missing.length > 0) fail(`archive is missing required entries: ${missing.join(', ')}`);
    const hasMigrations = listing.some((e) => e.startsWith('server/src/db/migrations/') && (e.endsWith('.js') || e.endsWith('.cjs')));
    if (!hasMigrations) fail('archive has no files under server/src/db/migrations/ — migrations would be missing on deploy.');

    console.log('[package] PASS — deploy.zip contains server/, client/dist, package.json, and migrations; no forbidden entries found.');
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

main();
