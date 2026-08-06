# SAMS Academy

Secure medical exam-prep LMS (video courses + QBank + mock exams + payments + admin panel). See [`docs/00_START_HERE.md`](docs/00_START_HERE.md) for the full spec set and [`CLAUDE.md`](CLAUDE.md) for project rules.

## Prerequisites

- Node.js 20 LTS (target/production version — Hostinger pins Node 20). This repo's own dev environment has been run on Node 25 throughout most of its history (no Node 20 install or version manager — nvm/fnm/volta — was available on that box); `npm run verify` and `npm run smoke` are the source of truth for "does it work here" regardless of which 20.x/newer runtime you're on.
- MySQL 8.x reachable from your machine. Three ways to get one for local dev:
  1. **Native install (what this repo's dev environment currently uses):** install MySQL Server 8.4 directly (e.g. `winget install --id Oracle.MySQL -e` on Windows, or your OS's package manager), initialize a data directory, run it as a service, then create a database + user matching your `.env`.
  2. **Docker (simplest if you have it):** `docker run --name sams-mysql -e MYSQL_ROOT_PASSWORD=root -p 3306:3306 -d mysql:8` then create the app database/user inside it.
  3. **Managed/remote dev DB:** point `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` at any reachable MySQL 8 instance (e.g. a cloud dev database).

## First-time setup

```bash
git clone <this repo> sams-academy && cd sams-academy
npm install                    # installs the root's own tiny devDeps, THEN
                                # automatically cascades into `npm install --prefix server`
                                # and `npm install --prefix client` via the root
                                # postinstall hook — one command, no separate
                                # `--prefix server` / `--prefix client` steps needed.
cp .env.example server/.env    # then edit server/.env with your real local DB credentials
```

Create the app database + user (adjust names/password to match `server/.env`):

```sql
CREATE DATABASE sams_academy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE sams_academy_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sams_app'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON sams_academy.* TO 'sams_app'@'localhost';
GRANT ALL PRIVILEGES ON sams_academy_test.* TO 'sams_app'@'localhost';
```

Migrate + seed + run:

```bash
npm run migrate    # creates all tables (sequelize-cli, against server/.env's DB_*)
npm run seed        # demo data: admin, demo student, 1 course, 200 questions,
                     # a mock exam, a coupon, faculty bios, FAQs, legal pages,
                     # some demo test-attempt activity
npm run dev          # Express API (nodemon, :5000) + Vite client (:3000, proxies /api -> :5000)
```

Open `http://localhost:3000`. `GET http://localhost:5000/api/v1/health` → `{"success":true,"data":{"status":"ok","db":true|false}}` is the fastest way to confirm the server booted and whether it can currently reach MySQL.

To instead run the whole thing as one production-shaped process on one port (what Hostinger actually runs — see `docs/09_DEPLOYMENT_HOSTINGER.md`):

```bash
npm run build    # builds the client to client/dist
npm start        # serves API + built SPA from one process (already forces NODE_ENV=production internally, via cross-env)
```

## Admin login

The demo seeder (`npm run seed`) creates:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@samsacademy.com` | `Admin@12345` |
| Student (demo, dev/local only) | `student@samsacademy.com` | `Student@123` |

A real go-live deploy uses `npm run seed:prod` instead of `npm run seed` (see `docs/09_DEPLOYMENT_HOSTINGER.md`'s first-deploy runbook) — that seeds **only** real baseline content (the admin account above, taxonomy, FAQs, legal/about settings) and **skips every demo-only seeder** (no demo student, no demo course, no demo questions, no demo mock exam, no demo coupon, no demo faculty bios, no demo test-attempt activity). Either way: **log in as admin and change the password immediately** — it's a fixed, publicly-documented default in this repo.

## Scripts (root `package.json`; each also exists standalone under `server/package.json` / `client/package.json`)

| Script | Does |
|---|---|
| `npm install` | Installs root deps, then cascades into `server/` and `client/` automatically (`postinstall` → `install:all`) |
| `npm run dev` | Runs the Express API (nodemon, :5000) and the Vite client (:3000, proxying `/api` → :5000) together |
| `npm run build` | Builds the client to `client/dist` |
| `npm start` | Production boot: `node server/src/index.js` serving the API + built client from one process |
| `npm run migrate` / `migrate:undo` / `migrate:undo:all` | Sequelize-cli migrations (server) |
| `npm run seed` | Full demo-data seeder (server) — local dev / QA |
| `npm run seed:prod` | Real go-live seeder (`SEED_MODE=prod`) — admin + taxonomy + FAQs + legal pages only, no demo content |
| `npm run seed:undo` | Reverts all seeders |
| `npm run lint` | Lints server + client |
| `npm run test` | Tests server (Jest+Supertest, needs `DB_NAME_test` reachable — migrated fresh automatically per run) + client (Vitest) |
| `npm run verify` | `lint && test && build` — must be green before any phase in `docs/07_EXECUTION_PLAN.md` is considered done |
| `npm run smoke` | Unattended production build/boot smoke test (`server/scripts/smoke/prodSmoke.js`, docs/07_EXECUTION_PLAN.md 14.1) — migrates, boots a real `NODE_ENV=production` server on a scratch port, and asserts health/public-API/SPA-fallback/security-headers all work, then shuts it down cleanly |
| `npm run package` | Builds `deploy.zip` (`scripts/package/buildDeployZip.mjs`, docs/07_EXECUTION_PLAN.md 14.3) for the Hostinger ZIP-upload deploy path — see `docs/09_DEPLOYMENT_HOSTINGER.md` |

## Deployment

See [`docs/09_DEPLOYMENT_HOSTINGER.md`](docs/09_DEPLOYMENT_HOSTINGER.md) for the full Hostinger Business runbook (hPanel setup, environment variables, first-deploy steps, backups, troubleshooting).

## Architecture map

This is a **single Node.js monolith** (Express serves both `/api/v1/*` JSON and the built React SPA from `client/dist`, SPA-fallback routed *after* the API/uploads routers so `/api/*`/`/uploads/*` 404s correctly instead of returning `index.html`) — see [`docs/02_ARCHITECTURE.md`](docs/02_ARCHITECTURE.md) for the full picture, request lifecycle, and DB schema map. Server-side layering is strict `routes → controllers → services → models` (controllers validate with `zod` and call a service; all business logic and ORM calls live in `services/`, never in controllers). Video (Bunny Stream) and payments (JazzCash/EasyPaisa/Raast/bank-transfer, with PayFast/Safepay as config-gated placeholder stubs) are both behind small adapter interfaces (`VideoProvider`, `PaymentGateway`) with a zero-credential `mock` driver as the dev/test default, so the app runs fully offline until real provider keys are supplied (see `COMPLETION_REPORT.md` for exactly which services are mocked and how to switch each to its real driver). The `client/` app is a **pre-built, already-designed UI** (exported from Google AI Studio) with a mock/real API-branching layer that mirrors `docs/04_API_SPEC.md` field-for-field — per `CLAUDE.md §1a`, ongoing frontend work here means *wiring the existing UI to the real API and fixing response-shape drift*, not redesigning or rebuilding it.
