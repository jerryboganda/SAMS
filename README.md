# SAMS Academy

Secure medical exam-prep LMS (video courses + QBank + mock exams + payments + admin panel). See [`docs/00_START_HERE.md`](docs/00_START_HERE.md) for the full spec set and [`CLAUDE.md`](CLAUDE.md) for project rules.

> This README covers local dev setup only. The full deployment/admin/architecture guide is a Phase 14 deliverable (`docs/07_EXECUTION_PLAN.md` 14.2) — this file will grow into that.

## Prerequisites

- Node.js 20 LTS (target/production version — Hostinger pins Node 20). Local dev has been run on Node 25 in this repo's early history; if you're on something other than 20.x, `npm run verify` is still the source of truth for "does it work here."
- MySQL 8.x reachable from your machine. Three ways to get one for local dev:
  1. **Native install (what this repo's dev environment currently uses):** install MySQL Server 8.4 directly (e.g. `winget install --id Oracle.MySQL -e` on Windows, or your OS's package manager), initialize a data directory, run it as a service, then create a database + user matching your `.env`.
  2. **Docker (simplest if you have it):** `docker run --name sams-mysql -e MYSQL_ROOT_PASSWORD=root -p 3306:3306 -d mysql:8` then create the app database/user inside it.
  3. **Managed/remote dev DB:** point `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` at any reachable MySQL 8 instance (e.g. a cloud dev database).

## First-time setup

```bash
npm install --prefix server
npm install --prefix client
cp .env.example server/.env   # then edit server/.env with your real local DB credentials
```

Create the app database + user (adjust names/password to match `server/.env`):

```sql
CREATE DATABASE sams_academy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE sams_academy_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sams_app'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON sams_academy.* TO 'sams_app'@'localhost';
GRANT ALL PRIVILEGES ON sams_academy_test.* TO 'sams_app'@'localhost';
```

## Scripts (root `package.json`)

| Script | Does |
|---|---|
| `npm run dev` | Runs the Express API (nodemon, :5000) and the Vite client (:3000, proxying `/api` → :5000) together |
| `npm run build` | Builds the client to `client/dist` |
| `npm start` | Production boot: `node server/src/index.js` serving the API + built client from one process |
| `npm run migrate` / `migrate:undo` | Sequelize-cli migrations (server) |
| `npm run seed` | Demo data seeder (server) |
| `npm run lint` | Lints server + client |
| `npm run test` | Tests server (Jest+Supertest, needs `DB_NAME_test` reachable) + client (Vitest) |
| `npm run verify` | `lint && test && build` — must be green before any phase in `docs/07_EXECUTION_PLAN.md` is considered done |

`GET http://localhost:5000/api/v1/health` → `{"success":true,"data":{"status":"ok","db":true|false}}` is the fastest way to confirm the server booted and whether it can currently reach MySQL.

## Project structure

See `docs/02_ARCHITECTURE.md §2` for the full repository layout (`server/`, `client/`, `storage/`, `docs/`, `.claude/agents/`).
