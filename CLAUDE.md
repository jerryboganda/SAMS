# CLAUDE.md — SAMS Academy Project Rules

You are building **SAMS Academy**, a secure medical exam-prep LMS (video courses + QBank + mock exams + payments + admin panel). This file is law. Specs live in `./docs/` — read them all before writing code.

## 1. Fixed technology decisions (never change these)

- **Runtime:** Node.js 20 LTS. Single process, single app (Hostinger Business = one Node.js web app).
- **Backend:** Express 4.x + Sequelize ORM + `mysql2` driver (pure JS — no native binaries, no Prisma engines; shared hosting safe).
- **Database:** MySQL 8 (InnoDB, `utf8mb4_unicode_ci`). Migrations via `sequelize-cli`. Never `sync({force})` outside tests.
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + React Router v6 + TanStack Query + Zustand. Recharts for graphs. `hls.js` for video.
- **Monolith layout:** Express serves `client/dist` statically with SPA fallback; all API under `/api/v1`. One `npm start` boots everything.
- **Auth:** JWT access (15 min) + rotating refresh token (30 d) in `httpOnly` `SameSite=Lax` cookies. bcrypt (12 rounds). Optional TOTP 2FA (`otplib`).
- **Validation:** `zod` on every route input. **Email:** `nodemailer` (SMTP). **Jobs:** `node-cron` in-process. **Logs:** `winston` (file + console). **Security middleware:** `helmet`, `express-rate-limit`, `hpp`, CORS locked to `APP_URL`.
- **Video:** never stored or transcoded on our server. External provider behind the `VideoProvider` adapter (default **Bunny Stream**; `mock` driver for dev). See `docs/02_ARCHITECTURE.md §6`.
- **Payments:** behind the `PaymentGateway` adapter — JazzCash + EasyPaisa (full drivers), Raast (manual proof flow via Settings details, driver slot for later), PayFast + Safepay (PLACEHOLDER stubs only — do NOT fully integrate; config-gated, `GATEWAY_NOT_CONFIGURED` when unconfigured), bank-transfer-manual, `mock` for dev. See `§7`.

## 1a. Frontend is already built — integrate, do not rebuild

`client/` is a **finished production UI exported from Google AI Studio** (built via the prompt pack in `docs/11_AISTUDIO_FRONTEND_PROMPTS.md`), with a mock API layer that mirrors `04_API_SPEC.md` field-for-field. Treat it as a deliverable to wire up, not a scaffold to redo.

- `CONFIG.USE_MOCK` is `false`; `CONFIG.API_BASE_URL` is `"/api/v1"` (same-origin). `apiFetch` in `client/src/api/client.ts` already sends `credentials:"include"` unconditionally — no change needed there.
- Every module in `client/src/api/endpoints/*.ts` already branches `if (CONFIG.USE_MOCK) return mock…(); else return apiFetch(realPath)`, with `realPath` matching `04_API_SPEC.md` exactly. With the mock flag off, those real calls are now live — most "wire it up" work is verifying the branch fires and fixing response-shape mismatches, not writing new client code.
- Per `07_EXECUTION_PLAN.md`, the **frontend-build sub-tasks in Phases 3–11 are re-scoped**: "build the UI" becomes "wire the exported UI to the real API + fix contract drift." Backend, security, and test sub-tasks in those phases are unchanged. When a contract mismatch is found, prefer changing the **backend** to match the frontend's existing TypeScript types (`client/src/types`, `client/src/api/endpoints/*.ts`) over editing the already-built frontend — only change frontend code if it's genuinely wrong against `04_API_SPEC.md`.
- Phase 13's QA matrix (`08_TESTING_QA.md`) applies unchanged regardless of UI origin.
- See `DECISIONS.md` for the specific contract-drift items already identified (e.g. the `/play` response field names).

## 2. Scope exclusions — hard ban

Do **not** build, model, or reference: **Live Classes, Notes Library, Discussion Forum, Certificates.** No tables, no routes, no UI, no admin screens for these. If any spec text mentions them, ignore it.

## 3. Autonomy rules (how to proceed without a human)

1. Work strictly through `docs/07_EXECUTION_PLAN.md` top-to-bottom. One task at a time.
2. **Never ask the user questions.** When something is unknowable:
   - Missing credential → add key to `.env.example`, implement against the provider's documented sandbox API, wire the `mock` driver as default in dev, note it in `COMPLETION_REPORT.md`, continue.
   - Ambiguous requirement → choose the simplest interpretation consistent with `01_PRD.md`, record the decision in `DECISIONS.md`, continue.
   - Blocked task → mark it `[BLOCKED: reason]` in the plan, skip, continue; revisit at the end.
3. After every task: run lint + relevant tests → tick the checkbox in `07_EXECUTION_PLAN.md` → `git commit` (conventional commits: `feat(qbank): …`, `fix(auth): …`).
4. After every phase: run the full test suite; fix regressions before moving on.
5. Delegate to subagents in `.claude/agents/` per `docs/06_AGENT_TEAM.md`; you (orchestrator) integrate and verify their output.
6. Definition of done for the project: all checkboxes ticked, `npm run verify` green, seeded demo data works end-to-end, `COMPLETION_REPORT.md` written.

## 4. Engineering conventions

- TypeScript on the client; modern ES modules JS (or TS if you prefer) on the server — pick one at Phase 0 and stay consistent.
- Layering: `routes → controllers → services → models`. No SQL/ORM calls inside controllers. Business logic lives in services.
- Consistent API envelope: `{ success, data }` or `{ success:false, error:{ code, message, details? } }`. Central error middleware. Never leak stack traces in production.
- Every list endpoint: pagination (`page`, `limit` ≤ 100), stable sort.
- All timestamps UTC in DB; format in UI (client timezone). Money stored as `DECIMAL(10,2)` + `currency` (`PKR` default).
- Uploaded images / payment proofs → `/storage/uploads` (multer, 5 MB, mime whitelist, randomized names). Videos are never uploaded to our disk.
- Secrets only from `process.env`; maintain a complete `.env.example`; never commit `.env`.
- Keep dependencies minimal — every new package must be justified in `DECISIONS.md`.
- Simplicity first; surgical changes; no speculative features.

## 5. Commands (wire these in Phase 0 and keep them working)

```bash
npm run dev        # server (nodemon) + client (vite) concurrently
npm run build      # vite build client → client/dist
npm start          # production: node server/src/index.js (serves API + dist)
npm run migrate    # sequelize-cli db:migrate
npm run seed       # demo data (admin, student, 1 course, 200 questions, mock exam)
npm run test       # jest + supertest (server) & vitest (client)
npm run lint       # eslint + prettier check
npm run verify     # lint + test + build (must pass before any phase ends)
```

## 6. Non-negotiable security behaviors

Rate-limit auth routes; lock account 15 min after 6 failed logins; enforce the 2-device limit and single-concurrent-stream heartbeat; signed, expiring video playback tokens only; audit-log every admin mutation; parameterized queries only (ORM); escape/sanitize all rendered user content. Full list: `docs/10_SECURITY_CHECKLIST.md` — it is part of the Definition of Done.
