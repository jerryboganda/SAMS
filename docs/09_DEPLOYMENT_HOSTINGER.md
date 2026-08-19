# 09 — Deployment: Hostinger Business Plan (single Node.js web app)

Hostinger Business supports managed **Node.js web apps** deployed from a **GitHub repo** (auto-build on push) or a **ZIP upload**, plus MySQL databases — all from hPanel. This app is designed to fit that: one process, `npm start`, MySQL, no ffmpeg/Redis/Docker. (Exact quotas evolve — confirm current limits in hPanel → your plan details.)

## 1. One-time setup in hPanel

**A. MySQL**
1. hPanel → **Databases → MySQL** → create database + user (all privileges). Note host (often `localhost` from the app; hPanel shows the exact host), db name (`uXXXX_sams`), user, password.
2. Optional: enable remote MySQL temporarily for your IP to run checks from your machine.

**B. Node.js web app**
1. hPanel → **Websites → Add website → Node.js app** (or Web Apps section) on your domain/subdomain (e.g., `samsacademy.com` or `app.samsacademy.com`).
2. Choose deployment method:
   - **GitHub (recommended):** connect the repo, branch `main`. Auto-deploys on push. Ships the FULL repo (including `client/src`), so Hostinger's own `npm install` + `npm run build` rebuilds the client from source every deploy — see step 3's Build command below, used as-is for this method.
   - **ZIP:** upload `deploy.zip` produced by `npm run package` (Phase 14.3 script, `scripts/package/buildDeployZip.mjs`). This zip deliberately ships an **already-built `client/dist`** and intentionally excludes `client/src`/`client/package.json` (see that script's own header comment for the full "what ships and why" list) — so for THIS method only, override the Build command from step 3 to **`npm install --ignore-scripts && npm install --prefix server`** instead of the default `npm run build`. Reasoning: `npm run build` = `vite build --prefix client`, which needs `client/src` present and would fail hard against a zip that only has `client/dist`; `--ignore-scripts` on the root install skips the root `postinstall` hook (which would otherwise try `npm install --prefix client` and fail with no `client/package.json` present), while still installing root's own tiny devDependencies (`cross-env`/`concurrently`, needed by `npm start`); the second command installs server's real runtime dependencies. No client install/build step is needed at all for this method — `client/dist` is static output, consumed directly by Express at runtime, not a build input.
3. Settings: Node version **20**; Build command: `npm run build` (GitHub method) — see the ZIP-method override immediately above if deploying via ZIP instead; Start command: `npm start`; **Entry file: `server/src/start.cjs`** — see the "Entry file" note immediately below, this is NOT `server/src/index.js`; root = repo root. (Hostinger injects `PORT` — the app already reads `process.env.PORT`.) `npm run build` itself only builds the client (`vite build --prefix client`) — it does NOT install dependencies; Hostinger's Node.js app feature runs `npm install` automatically before the configured Build command, and since the root `package.json`'s `postinstall` hook now cascades into `npm install --prefix server` + `npm install --prefix client` (Phase 14.1), that automatic `npm install` step correctly installs everything both the build and the running app need, with no extra manual `--prefix` install steps required — this is the same install path verified end-to-end by `npm run smoke` (§7 below) and by a real clean-clone `npm install && npm run build && npm start` run.
   - **Entry file — must be `server/src/start.cjs`, not `server/src/index.js`.** Hostinger's managed Node.js runner loads the configured "Entry file" via `require()`, not `node <entry>`. `server/src/index.js` is a real ESM module whose import graph contains genuine top-level `await` (confirmed live in Hostinger's own runtime logs as `ERR_REQUIRE_ASYNC_MODULE`), and Node cannot `require()` an ESM graph that uses top-level await. `server/src/start.cjs` is a plain CommonJS loader shim (always CJS regardless of `server/package.json`'s `"type":"module"`) that `require()`s trivially, then loads the real app via a dynamic `import('./index.js')` — exempt from the restriction. This only affects Hostinger's own entry-file setting; local dev, `npm start`, and `npm run smoke` are unaffected (they all still run `node server/src/index.js` directly). If hPanel's Node.js app UI has no separate "Entry file" field and only a Start command, set the Start command to `node server/src/start.cjs` instead of `npm start`.
4. Add all **environment variables** from §2 in the app's Environment settings.
5. Deploy → wait for build → site live with free SSL (enable "Force HTTPS").

**C. Email (SMTP)** — hPanel → Emails → create `noreply@samsacademy.com`; use its SMTP host/port/user/pass in env.

## 2. Environment variables (mirror of `.env.example`)

```ini
NODE_ENV=production
PORT=                      # injected by Hostinger; leave empty/default 5000 locally
APP_URL=https://samsacademy.com
JWT_SECRET=<64 random chars>          # openssl rand -hex 32
JWT_REFRESH_SECRET=<64 random chars>
COOKIE_SECURE=true

DB_HOST=<from hPanel>  DB_PORT=3306  DB_NAME=uXXXX_sams  DB_USER=uXXXX_sams  DB_PASS=***

SMTP_HOST=smtp.hostinger.com  SMTP_PORT=465  SMTP_SECURE=true
SMTP_USER=noreply@samsacademy.com  SMTP_PASS=***  MAIL_FROM="SAMS Academy <noreply@samsacademy.com>"

VIDEO_PROVIDER=bunny                  # 'mock' until Bunny is ready
BUNNY_LIBRARY_ID=  BUNNY_API_KEY=  BUNNY_TOKEN_AUTH_KEY=  BUNNY_CDN_HOSTNAME=

PAYMENTS_ENABLED_GATEWAYS=jazzcash,easypaisa,raast,bank_transfer   # add payfast/safepay when integrated
JAZZCASH_MERCHANT_ID=  JAZZCASH_PASSWORD=  JAZZCASH_INTEGRITY_SALT=  JAZZCASH_ENV=sandbox
EASYPAISA_STORE_ID=  EASYPAISA_HASH_KEY=  EASYPAISA_ENV=sandbox
# Raast needs NO env keys — set Raast ID / IBAN / QR image in Admin → Settings (shown at checkout, proof-approval flow)
PAYFAST_MERCHANT_ID=  PAYFAST_SECURED_KEY=          # PLACEHOLDER — future integration
SAFEPAY_API_KEY=  SAFEPAY_SECRET=                   # PLACEHOLDER — future integration

ADMIN_ALERT_EMAIL=admin@samsacademy.com
```

## 3. First-deploy runbook (in order)

1. Deploy app (build green, app running).
2. Run migrations + seed **once**: hPanel SSH (Business includes SSH) → `cd <app dir> && npm run migrate && npm run seed:prod` (prod seed = admin user + taxonomy + legal pages only, **no demo data** — the seeder supports `SEED_MODE=prod`).
3. Log in as admin → immediately change admin password → Settings: fill bank details, legal pages, SMTP test button.
4. Bunny Stream: create video library → enable **token authentication** + set allowed referer to your domain → paste keys in env → flip `VIDEO_PROVIDER=bunny` → redeploy → upload one test video → attach to a hidden lecture → verify playback + watermark + expiry.
5. Payments: keep `sandbox` env values → run a 10 PKR sandbox purchase end-to-end (JazzCash + EasyPaisa) → verify auto-activation + invoice email → switch to production creds. Fill Raast ID / IBAN / QR in Admin → Settings and do one real small Raast payment → approve in the queue. PayFast/Safepay stay disabled until you sign up with them (then: fill env keys, add to `PAYMENTS_ENABLED_GATEWAYS`, complete the stub per their docs). Set gateway return/IPN URLs to `https://<domain>/api/v1/checkout/return/<gw>` and `/api/v1/webhooks/payments/<gw>` in each merchant portal.
6. Cron safety net (hPanel → Advanced → Cron Jobs): the app already runs its own weekly DB backup (`mysqldump` → `storage/backups`, keep 4) and other maintenance sweeps via node-cron INSIDE the process (`server/src/jobs/`) — there is no separate HTTP "trigger" route to hit for this, it just runs on the app's own schedule as long as the process is up. The one thing worth adding externally is a daily `curl -s https://<domain>/api/v1/health` as a keep-alive/uptime monitor (so a sleeping/crashed app gets noticed), plus optionally re-checking `storage/backups/` after the app's Sunday 03:00 backup window to confirm files are actually landing.
7. Point DNS, force HTTPS, submit sitemap to Search Console.
8. Enable Hostinger's WAF/CDN (hPanel → Website → your domain → Security/Performance, exact menu name varies by plan) — `docs/10_SECURITY_CHECKLIST.md §H` requires this be noted here as a panel-level step; it's not application code, just a checkbox in hPanel, but easy to forget it's a required delivery step.

## 4. Updating the app
GitHub method: merge to `main` → auto build+deploy (zero-touch). ZIP method: `npm run build && npm run package` (rebuild the client first — `npm run package` intentionally does NOT rebuild it itself, it only packages whatever `client/dist` already exists) → upload the new `deploy.zip` → re-apply the Build-command override from §1.B.2 if this is a fresh hPanel app setup (an existing app that's already been configured with the override keeps it across re-deploys). Migrations: the app features built-in automated programmatic migrations on startup (`server/src/db/autoMigrate.js`) which automatically inspects `SequelizeMeta` and executes all pending `.cjs` migrations on every rebuild, deploy, or restart with zero manual intervention. Manual `npm run migrate:auto` or `npm run migrate` can also be run if desired.

## 5. Hostinger-specific guardrails already built into the app
- Reads `PORT` from env; binds `0.0.0.0`.
- `trust proxy` enabled (Hostinger sits behind a proxy/CDN) so rate-limit & IP logging see real IPs.
- RAM-lean: no video processing, no headless browsers; PDF invoices via pdfkit (light).
- All writable paths under `./storage` (persisted); logs rotate (10 MB × 5) so inode/disk limits are safe.
- Weekly `mysqldump` to `storage/backups` (keep 4, filenames `<dbName>-<ISO-timestamp>.sql`, see `server/src/services/backupService.js`) **plus** rely on Hostinger's own daily backups. **Restore procedure:** `mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < storage/backups/<dbName>-<timestamp>.sql` (create/empty the target database first if restoring into a fresh instance rather than overwriting in place — the dump contains `CREATE TABLE`/data only, no `CREATE DATABASE`). Rehearse this at least once against a scratch database before relying on it in a real incident.
- If the panel shows the app "sleeping"/restarting: check RAM graph first; the app targets <400 MB RSS.

## 6. Troubleshooting quick table
| Symptom | Check |
|---|---|
| 503 after deploy | Build log in hPanel; Node version = 20; start cmd `npm start` |
| `ERR_REQUIRE_ASYNC_MODULE` in runtime logs | Entry file is set to `server/src/index.js` instead of `server/src/start.cjs` — fix the Entry file setting per §1.B.3 and redeploy |
| DB connect error | DB_HOST exact value from hPanel (not always localhost), user privileges |
| Emails not sending | SMTP 465 secure=true, correct mailbox password, SPF/DKIM enabled in hPanel |
| Payments callback never fires | IPN URL uses https + correct path; check `payment_events` for raw hits; gateway portal logs |
| Video plays locally not in prod | Bunny referer allowlist includes production domain; server clock (token expiry) |

## 7. Pre-deploy smoke test (recommended, local)
Before pushing/uploading a release, run `npm run smoke` (`server/scripts/smoke/prodSmoke.js`, Phase 14.1) locally: it runs migrations, boots a real `NODE_ENV=production` server on a scratch port (default 5099), and asserts `/api/v1/health` reports `db:true`, `/api/v1/public/courses` responds, the SPA deep-link fallback (`GET /courses`) returns `200 text/html`, and the CSP/`X-Frame-Options` security headers (set by `helmet()` in `server/src/app.js` — see `docs/10_SECURITY_CHECKLIST.md §A` for the full policy) are present — then shuts the server down cleanly. It prints a clear PASS/FAIL line per check and exits non-zero on any failure, so it's safe to wire into a pre-push hook or CI step. It never invents its own database — point it at a throwaway DB via `DB_NAME=<db>` if you don't want it touching your real dev database (see the script's own header comment for the full flag list).

## 8. SSH access for AI-assisted / automated production tasks

An SSH key was set up 2026-08-08 so a future session (human or AI agent) can do server-side production work — running migrations/seeds, reading real logs, checking live process/env state — without needing a human at a browser for every step. **Read this whole section before touching the production server.**

**Connection details** (current as of 2026-08-08 — re-verify host/port/user from hPanel → the site → Advanced → SSH Access if anything below fails, they can change):
```
Host: 46.202.138.251   Port: 65002   User: u372263031
```
**Private key**: `C:\Users\Admin\.ssh\sams_deploy\hostinger_sams` (ed25519, no passphrase) — lives **only on the machine that generated it**, is `.gitignore`d/never committed, and is **not** portable to a session running on a different machine. If it's missing:
1. Generate a new one: `ssh-keygen -t ed25519 -f ~/.ssh/sams_deploy/hostinger_sams -N "" -C "sams-deploy-automation"`.
2. hPanel → the site → **Advanced → SSH Access**: confirm status is **Active** (toggle it on if not — it's off by default on a fresh app).
3. Scroll to **SSH keys → Add SSH key** → paste the new `.pub` file's contents, any name (e.g. `sams-deploy-automation`).
4. Connect: `ssh -p 65002 -i ~/.ssh/sams_deploy/hostinger_sams u372263031@46.202.138.251`.

**Never** type the account's SSH *password* into anything, or ask an AI agent to — key-based auth is the point of this setup precisely so that's never needed again.

### Directory layout on the server
```
/home/u372263031/domains/<current-domain>/
├── public_html/                  # static passthrough, not the real app
├── hbuilds/
│   ├── config/.env               # the deployed env file — see the quirk below before editing
│   ├── current -> versions/<build-uuid>/   # symlink to the live build
│   ├── versions/<build-uuid>/nodejs/       # actual running app + node_modules (server + client/dist)
│   └── last-source/               # full source checkout used to build
```
**`<current-domain>` changes if the domain is ever reconnected** (e.g. it was `sandybrown-shark-303326.hostingersite.com` before, is `radiopad.eu` as of 2026-08-08 — see HANDOFF.md/DECISIONS.md for why). Always re-derive it rather than hardcoding a path:
```bash
ls /home/u372263031/domains/
```

### Node/npm — not on PATH by default
```bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH   # node v20.19.4, npm — confirmed working path 2026-08-08
```

### The database is MariaDB, not MySQL 8 — despite CLAUDE.md §1
Confirmed live: `mysql --version` → `11.8.8-MariaDB`. Write migrations/raw SQL to be MariaDB-compatible (see migration `20260101000035`'s fix in `DECISIONS.md`'s 2026-08-08 entry for a real example — MariaDB rejects an explicit `NULL` after `VIRTUAL` in a generated-column definition that MySQL 8 silently accepts). The real DB host for the app to connect to is **`srv1864.hstgr.io`** (or IP `153.92.15.53`), not `localhost` — `localhost`/`127.0.0.1` only works for something running co-located on the DB's own host (e.g. phpMyAdmin), not the Node app's container. Get the current values from hPanel → Databases → Remote MySQL if this ever changes.

### Running migrations / seeds manually
`sequelize-cli` is a **devDependency**, and Hostinger's automatic `npm install` on deploy omits devDependencies — so `npm run migrate`/`npm run seed:prod` (which call the `sequelize-cli` binary directly) fail with `command not found`. Run it via `npx` instead, from inside `hbuilds/current/nodejs/server`, with the real env sourced:
```bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
cd /home/u372263031/domains/<current-domain>/hbuilds/current/nodejs/server
set -a; source /home/u372263031/domains/<current-domain>/hbuilds/config/.env; set +a
export NODE_ENV=production
npx --yes sequelize-cli@6.6.2 db:migrate
npx --yes sequelize-cli@6.6.2 db:seed:all              # or: SEED_MODE=prod npx --yes sequelize-cli@6.6.2 db:seed:all
```

### ⚠️ Env vars are snapshotted at DEPLOY time, not read on every process restart
This is the single most important thing to know before changing config. Editing `hbuilds/config/.env` directly over SSH **does** get consumed correctly — but only at the **next real deploy cycle** (a GitHub push, or hPanel's Redeploy button). A bare process restart (see below) reuses whatever env block Hostinger's `lsnode` launcher cached at the *last* real deploy and will **not** pick up a same-session file edit. Concretely:
- **To change an env var and have it actually take effect right now**: edit it in hPanel → Environment variables (this itself triggers a real redeploy), **or** edit `hbuilds/config/.env` over SSH and then trigger a real deploy yourself — the simplest is pushing any commit to `main` (even a docs-only one), since the repo is GitHub-connected with auto-deploy on push.
- **What does NOT work**: edit the file, then `kill -TERM` the app process expecting a fresh env — confirmed empirically 2026-08-08, the respawned process still had the stale pre-edit values.
- Full incident writeup: `DECISIONS.md`'s 2026-08-08 "Hostinger platform quirk" entry.

### Restarting the app process (without a full redeploy)
Safe for a lightweight restart when you do **not** need new env vars (e.g. after the app hangs, or to clear in-memory state) — it will **not** refresh env, see above:
```bash
pgrep -f lsnode                          # find the current PID(s) — sometimes 2 sibling processes
kill -TERM <pid> [<pid2>]                # graceful; server.js's own SIGTERM handler shuts down cleanly, launcher respawns within ~5s
```
Verify it came back: `curl -sk https://<current-domain>/api/v1/health` should return `{"success":true,"data":{"status":"ok","db":true}}` within a few seconds. If `db:false` or it stays down, don't keep retrying blind — check `hbuilds/current/nodejs/console.log` (below) for the real error first.

### Reading real logs
hPanel's own "Runtime Logs" panel (Websites → site → Runtime logs) was unreliable during 2026-08-07/08 troubleshooting — it repeatedly failed to show fresh entries even minutes after hitting the app. **The actual, reliable source is the log file on disk**:
```bash
cat /home/u372263031/domains/<current-domain>/hbuilds/current/nodejs/console.log
```
This is a live JSON-lines dump of everything the app's winston logger + raw `console.warn`/`console.error` write (including the `[env]` startup warnings from `server/src/config/env.js` — e.g. the mock-payment-gateway-in-production warning, the fixed-OTP-bypass warning if active). It accumulates across simple process restarts within the same deployed build and resets on a real new deploy.

### Health check
```bash
curl -sk https://<current-domain>/api/v1/health
# {"success":true,"data":{"status":"ok","db":true}}
```

### Known state as of 2026-08-08 (verify, don't assume — re-check live)
- Domain: `radiopad.eu` (**temporary** per the user — the site was originally on `sandybrown-shark-303326.hostingersite.com`; check `APP_URL` in Environment variables and `ls /home/u372263031/domains/` if this doc is stale).
- Remote MySQL access is set to "Any Host" (hPanel → Databases → Remote MySQL) because the app's real outbound IP is IPv6 and didn't match its displayed IPv4 website IP — a real, if narrower-than-ideal, tradeoff; consider pinning to a real static egress IP later if Hostinger support can provide one.
- Two manual-QA test accounts exist in production (`mindreader420123@gmail.com` admin, `mindreader_420@yahoo.com` student) with a fixed `000000` login-reverify bypass scoped to just those two emails via `DEV_FIXED_OTP_CODE`/`DEV_FIXED_OTP_EMAILS` env vars — see `DECISIONS.md`'s 2026-08-08 entries for the full reasoning and how to remove it.
