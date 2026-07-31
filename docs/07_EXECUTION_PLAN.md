# 07 — Autonomous Execution Plan

**Protocol:** execute top-to-bottom. One task = implement → verify acceptance criteria (AC) → tick `[x]` → commit. End every phase with `npm run verify` green. Never skip AC. Blocked → `[BLOCKED: reason]`, continue, revisit in Phase 13. Agents per 06_AGENT_TEAM routing.

**Frontend re-scope:** `client/` is already a finished UI exported from Google AI Studio (mock layer mirrors `04_API_SPEC.md` — see `CLAUDE.md §1a`). `CONFIG.USE_MOCK=false`, `API_BASE_URL="/api/v1"`. Every frontend-build sub-task below (Phases 3–11) is re-scoped from "build the UI" to **wire the exported UI to the real API + fix contract drift** — backend, security, and test sub-tasks are unchanged. Phase 13's QA matrix (`08_TESTING_QA.md`) applies unchanged.

## Phase 0 — Bootstrap (devops-docs)
- [x] 0.1 Init repo structure per 02_ARCHITECTURE §2; root `package.json` with workspaces or concurrently; `.gitignore` (.env, node_modules, storage/, client/dist). **AC:** tree matches spec; `git log` has init commit.
- [x] 0.2 Server skeleton: Express app, helmet/cors/cookies/json, `/api/v1/health` → `{success:true,data:{status:'ok',db:false}}`, central errorHandler + 404, winston logger, zod-validated env loader with safe defaults. **AC:** `curl /api/v1/health` returns envelope.
- [x] 0.3 Client skeleton: Vite React-TS + Tailwind + Router + Query + axios instance (proxy `/api`→5000); placeholder Home renders. **AC:** `npm run dev` boots both; browser shows Home; `npm run build` outputs client/dist.
- [x] 0.4 Express serves client/dist + SPA fallback (after API & /uploads routes) with cache headers on hashed assets. **AC:** `npm run build && npm start` serves the SPA on one port; deep-link `/courses` returns index.html; `/api/v1/health` still JSON.
- [x] 0.5 Tooling: eslint+prettier (server+client), jest+supertest scaffold, vitest scaffold, `npm run verify` chains lint+test+build; `.env.example` v1; `DECISIONS.md` created. **AC:** `npm run verify` green.
- [x] 0.6 MySQL wiring: sequelize instance, config from env, `db:ping` reflected in /health (`db:true`), sequelize-cli setup (migrations/seeders paths), test DB config. **AC:** health shows db:true against local MySQL (document `docker run mysql:8` fallback for dev in README).

## Phase 1 — Database (db-engineer)
- [x] 1.1 Migrations+models: users, user_devices, refresh_tokens, login_events, one_time_tokens. **AC:** migrate fresh DB clean; models load.
- [x] 1.2 Migrations+models: courses, course_sections, lectures, lecture_progress, lecture_bookmarks, playback_sessions. **AC:** same.
- [x] 1.3 Migrations+models: coupons, orders, payment_events, bank_transfer_proofs, enrollments. **AC:** same + invoice_no unique.
- [x] 1.4 Migrations+models: subjects, body_systems, questions, question_options, mock_exams, mock_exam_questions, test_sessions, test_attempt_questions, question_bookmarks, user_question_history, user_daily_stats. **AC:** same.
- [x] 1.5 Migrations+models: announcements, notifications, faculty, faqs, contact_messages, audit_logs, settings; associations file wiring all relations. **AC:** `migrate` then `migrate:undo:all` both clean.
- [x] 1.6 Seeders per 03 §Seed (admin, student, taxonomy, course+lectures, 200 questions, mock exam, coupon, faculty, faqs, legal pages, demo activity). **AC:** fresh `migrate && seed` succeeds; row counts logged; re-seed is idempotent or guarded.

## Phase 2 — Auth, devices, sessions (backend-dev → security-auditor)
- [x] 2.1 Register + email verification (one_time_tokens, mailer with console transport in dev, templates). **AC:** supertest: register→token→verify→active; duplicate email 409.
- [x] 2.2 Login core: bcrypt check, JWT access + rotating refresh (hash stored), cookies set, login_events logged, account lock after 6 fails/15 min, rate limit. **AC:** tests: success, wrong pw, lockout, refresh rotation, reuse-detection revokes family.
- [x] 2.3 Device layer: device cookie issue/verify, registration ≤2 active, 3rd device → 423 DEVICE_LIMIT_REACHED, deviceCheck middleware on protected routes. **AC:** test simulates 3 devices; 3rd blocked; existing 2 keep working.
- [x] 2.4 Suspicious-login detection (new device / country change via IP lookup lib or header stub / recent fails) → REVERIFY_REQUIRED + emailed code + `/auth/reverify`. **AC:** flagged path requires code; event rows written.
- [x] 2.5 Session mgmt: /me, PATCH /me, change-password (revoke others+email), logout, logout-all, forgot/reset password. **AC:** endpoint tests incl. token expiry.
- [x] 2.6 TOTP 2FA setup/enable/disable + backup codes; login honors TWOFA_REQUIRED. **AC:** otplib-generated codes pass; backup code single-use.
- [x] 2.7 requireRole middleware + audit middleware skeleton (writes audit_logs). **AC:** admin-only route 403 for student; audit row on sample mutation.
- [x] 2.8 🔒 security-auditor pass on Phase 2 scope. **AC:** zero Critical/High. (1 HIGH + 2 Medium + 2 Low found and fixed; re-verified — see DECISIONS.md.)

## Phase 3 — Public site (backend-dev + frontend-dev in parallel after 3.1)
- [x] 3.1 Public API: home aggregate, courses list/detail, faculty, faqs, pages/:key, contact (rate-limited, email), sample-questions. **AC:** supertest all; unpublished course invisible.
- [x] 3.2 Wire exported PublicLayout + design tokens + ui kit components to real API + fix contract drift. **AC:** storybook-less demo route renders kit; lint clean. (PublicLayout has no data dependency — verified, nothing to wire.)
- [x] 3.3 Wire exported pages (Home, Catalog +filter, Course detail curriculum accordion/price box, Faculty, FAQs, Contact, About/legal from settings) to real API + fix contract drift. **AC:** build clean; empty/loading/error states present; mobile snapshots OK.
- [x] 3.4 Wire exported auth pages (register +verify sent screen, verify-email, login incl. device-limit & 2FA & reverify branches, forgot/reset) to real API + fix contract drift. **AC:** vitest on form validation; manual-flow script in README.
- [x] 3.5 SEO meta (helmet) + server meta-inject for course detail; sitemap.xml + robots.txt routes. **AC:** curl course URL shows correct og:title. (Verified live; a client-side post-hydration title override for /courses/* is logged as a follow-up in DECISIONS.md, doesn't affect this AC.)

## Phase 4 — Content admin (backend-dev + frontend-dev)
- [x] 4.1 Admin CRUD API: courses(+publish), sections, lectures, reorder endpoints, image upload (multer, mime+5MB, random names). **AC:** tests incl. reorder integrity + upload rejects exe. (Also built the admin Faculty/FAQs/contact-messages/Settings CRUD that 4.4 needs — see DECISIONS.md.)
- [x] 4.2 Wire exported AdminLayout + guards + Table/Form patterns to real API + fix contract drift. **AC:** student hitting /admin → 403 page. (Guard already generic against real `user.role`; also fixed a cross-cutting session-bootstrap gap — see DECISIONS.md.)
- [x] 4.3 Wire exported courses table + course form + Curriculum builder UI (sections/lectures, drag reorder, lecture modal) to real API + fix contract drift. **AC:** e2e-ish vitest of builder state; manual script updated. (Rewired from a nonexistent bulk-save endpoint to diff-based granular CRUD+reorder calls; live-verified in browser.)
- [x] 4.4 Wire exported Faculty, FAQs, contact-messages, settings pages (site+legal+bank tabs; masked secret fields) to real API + fix contract drift. **AC:** settings roundtrip; secrets never echoed.

## Phase 5 — Secure video (integrations-dev → security-auditor)
- [x] 5.1 VideoProvider adapter: factory + `mock` driver (local sample HLS/mp4 in storage/dev-assets) + `bunny` driver (signed token URL builder, validateRef via API). **AC:** unit tests: token math matches Bunny docs example; mock returns playable URL. (Bunny's own doc example is internally inconsistent — self-computed deterministic vectors used instead; see DECISIONS.md.)
- [x] 5.2 `/student/lectures/:id/play`: enrollment+expiry+device checks, playback_session create/steal, watermark payload, resumeAt; free-preview public path. **AC:** tests: not-enrolled 403, expired 403, preview OK, second stream steals first.
- [x] 5.3 Heartbeat endpoint: progress upsert, stream lock renew, 409 on stolen; complete endpoint; study-seconds accumulation. **AC:** tests incl. stale-session takeover.
- [x] 5.4 Wire exported SecurePlayer component (hls.js, moving watermark, heartbeat loop, takeover modal, resume, token refresh, deterrents) to real API + fix contract drift (align `/play` response fields to `PlaybackConfig`, see DECISIONS.md). **AC:** vitest logic (watermark scheduler, heartbeat backoff); manual script with mock video. (Live-verified: real video playback, real heartbeats persisting to the DB, real completion.)
- [x] 5.5 Wire exported course player page (curriculum drawer, ✓/🔖, autoplay next) + preview route to real API + fix contract drift. **AC:** progress % updates after simulated watch.
- [x] 5.6 🔒 security-auditor: video abuse cases (direct URL reuse after expiry, other-user lecture IDOR, watermark payload source). **AC:** zero Critical/High. (Found + fixed 1 HIGH: the concurrent-stream lock had a live-reproduced race condition allowing multiple simultaneous sessions; +1 Medium: heartbeat had no rate limit/elapsed-time cross-check. Both fixed and re-verified — see DECISIONS.md.)

## Phase 6 — Student dashboard (backend-dev + frontend-dev)
- [ ] 6.1 Dashboard aggregate endpoint (progress %, remaining, continue-watching, study hours 7d/total, expiring, announcements, unread count). **AC:** single query-count budget (≤8 queries), test on seed data.
- [ ] 6.2 Wire exported dashboard UI (cards, countdown pills, mini chart) to real API + fix contract drift. **AC:** renders seeded demo data correctly.
- [ ] 6.3 Wire exported My-courses page + lecture bookmarks page to real API + fix contract drift. **AC:** bookmark toggle reflected.

## Phase 7 — QBank engine (backend-dev heavy)
- [ ] 7.1 `/qbank/meta` (categories from enrollments, taxonomy, live counts incl. pools). **AC:** counts match seed math.
- [ ] 7.2 Test creation service: filters+pool resolution, random frozen snapshot, ACTIVE_TEST_EXISTS. **AC:** tests: filter honoring, pool 'incorrect' only returns past-wrong, count clamps 5–200.
- [ ] 7.3 Runner APIs: get session (no is_correct leak in exam mode), answer PATCH (practice returns feedback), server time-left, submit scoring + history upsert + daily stats, abandon, auto-submit on expiry. **AC:** tests: leak check, timing enforcement (late answer rejected), resume mid-test, scoring math incl. skipped.
- [ ] 7.4 Bookmarks + review payload + history list APIs. **AC:** review only post-completion (403 before).
- [ ] 7.5 Wire exported TestRunner UI (palette, flags, keyboard, timer, practice inline feedback, offline retry queue) + create-test wizard + resume banner to real API + fix contract drift. **AC:** vitest runner reducer; manual script: full 10-Q practice + exam runs.
- [ ] 7.6 Wire exported Result + Review + History + Bookmarks pages (incl. retest-incorrect one-click) to real API + fix contract drift. **AC:** numbers match server response exactly.

## Phase 8 — Analytics + Mock exams
- [ ] 8.1 Analytics endpoint (overall, subject/system arrays, strengths/weaknesses, series by range) + nightly user_daily_stats cron + question difficulty denormal cron. **AC:** aggregates match hand-computed seed fixture.
- [ ] 8.2 Wire exported analytics UI (donut, bars, trend, range toggle) to real API + fix contract drift. **AC:** renders fixture correctly, empty-state for new user.
- [ ] 8.3 Mock exams: admin CRUD+question picker API (backend, unchanged); wire exported admin picker UI + student list/start UI (reuses runner, mode=mock, pass/fail) to real API + fix contract drift. **AC:** pass mark logic test; attempt history stored.

## Phase 9 — Payments & enrollment (integrations-dev → security-auditor)
- [ ] 9.1 Coupon service + quote endpoint (all error codes). **AC:** tests per code; percent vs fixed math; expiry windows.
- [ ] 9.2 Order creation + gateway factory + `mock` gateway (auto-success redirect) + shared success path: paid→enrollment(validity)→invoice_no txn→PDF→email+notification. **AC:** e2e test: quote→order→mock pay→enrollment active→invoice PDF exists→notification row.
- [ ] 9.3 JazzCash driver (hosted checkout payload+secure-hash, return+IPN verify) per current official docs; sandbox-config. **AC:** unit tests of hash builder/verifier vs documented sample; forged hash rejected; idempotent replay no-op.
- [ ] 9.4 EasyPaisa driver (same standard). **AC:** same style tests.
- [ ] 9.5 Raast manual gateway: `manualDetails` payload from Settings (Raast ID, IBAN, QR image), proof/txn-ref upload reusing bank_transfer_proofs, routed into the shared admin approval queue; leave commented driver slot for future direct API. **AC:** e2e mirrors bank-transfer test (order→raast details→proof→approve→active).
- [ ] 9.5b PayFast + Safepay PLACEHOLDER drivers: interface-conformant stubs in factory, hidden from checkout unless in `PAYMENTS_ENABLED_GATEWAYS` + configured; unconfigured invocation → `422 GATEWAY_NOT_CONFIGURED`. **AC:** interface conformance test; disabled-by-default test; forced-call error test.
- [ ] 9.6 Bank transfer: instructions payload (settings bank details), proof upload, admin queue approve/reject (queue shared with Raast, gateway column shown) → same success path / rejection notice. **AC:** e2e: order→proof→approve→active; reject→notified.
- [ ] 9.7 Wire exported checkout UI (gateway list served by API per enabled config, redirect handling, manual-instructions panel for bank/Raast QR + copy buttons, order status poller page, orders history, invoice download, proof upload UI) to real API + fix contract drift. **AC:** full mock-gateway purchase in browser (manual script); Raast panel renders QR + details.
- [ ] 9.8 Wire exported admin orders table/detail (+events timeline, mark-paid/refund-flag) + bank-transfer queue UI + coupons CRUD UI to real API + fix contract drift. **AC:** approve flow moves order to paid and activates.
- [ ] 9.9 Enrollment lifecycle cron (expire + 7-day reminders) + ALREADY_ENROLLED guard + coupon race lock. **AC:** time-travel test (fake timers) expires enrollment; concurrent coupon use test.
- [ ] 9.10 🔒 security-auditor: webhook forgery, IDOR on orders/invoices, amount tamper (client price ignored), coupon abuse. **AC:** zero Critical/High.

## Phase 10 — Notifications & announcements
- [ ] 10.1 notificationService (create+email templates: purchase, bank approve/reject, expiry, new-device, password-changed) wired into existing flows. **AC:** each trigger test asserts row+mail-mock.
- [ ] 10.2 Announcements: admin composer API (audience, optional blast batched 20/min) backend unchanged; wire exported composer UI + student feed + dashboard surface to real API + fix contract drift. **AC:** course-audience only reaches enrolled fixture users.
- [ ] 10.3 Wire exported bell + notifications page + mark-read to real API + fix contract drift. **AC:** unread badge updates.

## Phase 11 — Admin dashboard, reports, audit
- [ ] 11.1 KPI dashboard endpoint (backend, unchanged); wire exported KPI dashboard UI (revenue buckets, pending transfers badge, charts) to real API + fix contract drift. **AC:** matches seeded orders math.
- [ ] 11.2 Wire exported Students module UI (search/detail tabs incl. Devices with RESET action, login history w/ suspicious highlight, manual enrollment grant/extend/revoke) to real API + fix contract drift. **AC:** reset-devices logs audit + revokes tokens (test).
- [ ] 11.3 Wire exported Question bank admin (table+editor+preview; taxonomy CRUD) to real API + fix contract drift. **AC:** editing question with attempts keeps history intact (snapshot test).
- [ ] 11.4 CSV/XLSX import: template, parser, dry-run report, commit; export of difficulty report (backend, unchanged); wire exported QBankImportPage UI to real API + fix contract drift. **AC:** fixture file with 3 bad rows → report flags exactly those; commit imports the rest.
- [ ] 11.5 Reports endpoints (backend, unchanged); wire exported reports UI (revenue by day/course + CSV, enrollments, difficulty) + audit-log viewer to real API + fix contract drift. **AC:** CSV opens with correct totals.

## Phase 12 — Hardening (backend-dev → security-auditor)
- [ ] 12.1 Full rate-limit map, hpp, request-size limits, compression, prod cookie flags (secure, sameSite), trust proxy, CSP for player page. **AC:** limits verified by tests; helmet headers snapshot.
- [ ] 12.2 Sanitization: rich-text fields (stems/explanations/announcements/descriptions) whitelisted (sanitize-html) at write; escape at render. **AC:** stored-XSS payload fixture neutralized end-to-end.
- [ ] 12.3 Backup cron (mysqldump rotate 4) + log rotation + graceful shutdown + uncaught handlers. **AC:** backup file appears in dev run with test schedule.
- [ ] 12.4 Perf pass: EXPLAIN top queries on 10k-question/1k-user synthetic load; add missing indexes; p95 <500 ms script. **AC:** perf script output committed.
- [ ] 12.5 🔒 security-auditor full 10_SECURITY_CHECKLIST sweep. **AC:** every item PASS with evidence, or documented accepted-risk in DECISIONS.md.

## Phase 13 — QA & stabilization (qa-tester)
- [ ] 13.1 Implement any missing mandatory tests from 08_TESTING_QA matrix; coverage report. **AC:** matrix 100% present; suite green.
- [ ] 13.2 E2E happy-path script (supertest-driven or Playwright if available): visitor→register→verify→login→buy(mock)→watch(mock video)→QBank test→mock exam→analytics→admin approves a bank order→admin resets devices. **AC:** single command runs it green.
- [ ] 13.3 Resolve every `[BLOCKED]` item or convert to documented limitation. **AC:** zero unexplained blocks.
- [ ] 13.4 Cross-browser/manual checklist doc executed on Chrome+mobile viewport. **AC:** checklist committed with results.

## Phase 14 — Delivery (devops-docs)
- [ ] 14.1 Production build check: `NODE_ENV=production npm start` from clean clone + `.env` → app fully works with mock drivers. **AC:** scripted smoke passes.
- [ ] 14.2 Finalize `.env.example` (every key, comment, which are go-live-only) + README (setup, scripts, admin creds note, architecture map). **AC:** new-machine dry run using only README succeeds.
- [ ] 14.3 Verify 09_DEPLOYMENT_HOSTINGER.md against repo (script names, paths, build artifact list); produce `deploy.zip` builder script. **AC:** zip contains server/, client/dist, package.json, migrations — no dev junk.
- [ ] 14.4 Write COMPLETION_REPORT.md (features ✓, test summary, mocked services + real-key switch guide, known limitations, next-steps list). **AC:** exists, accurate, final commit tagged `v1.0.0`.
