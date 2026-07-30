# 08 — Testing & QA Plan

## 1. Stack & layout
- **Server:** Jest + Supertest against a dedicated test MySQL DB (`DB_NAME_test`), migrated fresh per run; factories/fixtures in `server/tests/factories`. External services always the `mock` adapters in tests.
- **Client:** Vitest + Testing Library for logic-bearing components (forms, TestRunner reducer, watermark scheduler, auth interceptor); build+lint as static gates.
- **E2E:** Phase-13 scripted happy path (supertest-chained; Playwright optional if available in the environment).
- Gate: `npm run verify` = lint + all tests + build. Runs at every phase end; must be green to proceed.

## 2. Mandatory test matrix (each ✓ = at least one automated test)

**Auth & devices**
- [ ] Register→verify→login happy path; duplicate email 409; weak password 422
- [ ] Wrong password ×6 → ACCOUNT_LOCKED; unlock after window
- [ ] Refresh rotation works; refresh-token reuse → whole family revoked
- [ ] Device #1, #2 OK; device #3 → 423; after admin reset-devices, new device OK and old refresh tokens dead
- [ ] Suspicious login (new device fixture) → REVERIFY_REQUIRED → code path succeeds
- [ ] 2FA: enable (valid TOTP), login requires code, backup code single-use, disable
- [ ] Role guard: student → /admin/* 403; unauthenticated → 401

**Catalog & enrollment**
- [ ] Unpublished course hidden from public list & detail
- [ ] /student/courses/:id → 403 NOT_ENROLLED; after mock purchase → 200
- [ ] Enrollment expiry (fake timers) → ENROLLMENT_EXPIRED on content, dashboard shows expired

**Secure video**
- [ ] /play: not enrolled 403; enrolled OK with expiring URL + watermark payload = session user (not client-supplied)
- [ ] Free preview lecture playable unauthenticated, watermark "PREVIEW"
- [ ] Second /play steals stream: first heartbeat → 409 STREAM_TAKEN_OVER
- [ ] Heartbeat updates watched/resume; ≥90% marks completed; study seconds accumulate
- [ ] Lecture from a course the user doesn't own (IDOR) → 403

**QBank**
- [ ] Test creation honors category/subject/system filters and count clamp (5–200)
- [ ] Pools: 'unused' excludes seen; 'incorrect' only past-wrong; 'bookmarked' only bookmarked
- [ ] Exam mode payload NEVER contains is_correct/explanation pre-submit (deep scan assert); practice mode returns feedback per answer
- [ ] Timer: server rejects answers after expiry; auto-submit scores skipped correctly
- [ ] Resume in-progress test returns saved answers/flags/palette
- [ ] Scoring math: correct/incorrect/skipped/percent exact on fixture; history & user_question_history updated
- [ ] Review endpoint 403 before completion; correct after
- [ ] ACTIVE_TEST_EXISTS conflict on second create

**Mock exams & analytics**
- [ ] Mock uses frozen paper order; pass/fail vs pass_percent boundary (=pass mark passes)
- [ ] Analytics aggregates match hand-computed fixture (subject/system %, strengths bottom/top 3, daily series)

**Payments**
- [ ] Quote math: percent & fixed coupons, floor at 0, each COUPON_* error code
- [ ] Mock gateway e2e: order→paid→enrollment(validity days exact)→invoice PDF exists→email mock called→notification row
- [ ] Webhook: invalid signature rejected & logged; valid processes; duplicate IPN idempotent (single enrollment)
- [ ] Amount tampering: client-sent price ignored (server recomputes)
- [ ] Bank transfer: proof upload (rejects non-image/oversize) → approve activates; reject notifies with reason
- [ ] Raast: order returns manualDetails (Raast ID/IBAN/QR from settings) → proof/ref upload → shared queue approve → enrollment active (mirror of bank-transfer e2e)
- [ ] Placeholder gateways: payfast/safepay absent from checkout list when disabled; forced order attempt → 422 GATEWAY_NOT_CONFIGURED; interface conformance test passes
- [ ] ALREADY_ENROLLED 409; coupon max_uses race (two parallel checkouts, one wins)
- [ ] Invoice/order IDOR: other user's order/invoice → 403/404

**Admin & misc**
- [ ] Every admin mutation writes audit_logs (spot-check 5 endpoints incl. reset-devices)
- [ ] CSV import dry-run flags exactly the 3 bad fixture rows; commit imports rest; template columns stable
- [ ] Question edit after attempts: old test review unchanged (snapshot)
- [ ] Announcement course-audience reaches only enrolled fixture users
- [ ] Stored-XSS fixture in stem/announcement sanitized end-to-end
- [ ] Rate limits: 11th login attempt in window → 429; contact 6th/h → 429
- [ ] Uploads: exe/mime-spoof rejected; 6 MB rejected
- [ ] Cron: expiry job marks expired + creates 7-day reminders (fake timers)

## 3. Performance checks (Phase 12.4)
Synthetic load: 10k questions, 1k users, 5k test_sessions. Assert p95 < 500 ms for: qbank/meta, test create (100Q), analytics, admin dashboard, public catalog. Commit `perf-report.txt` with EXPLAIN summaries for the top 5 queries.

## 4. Manual checklist (Phase 13.4 — run in Chrome desktop + mobile viewport)
Player watermark moves & survives fullscreen · takeover modal on second tab · checkout with each gateway option UI path (mock) · bank proof drag-drop · admin curriculum drag-reorder · question editor preview · responsive: dashboard, runner, admin tables · empty states: new student everywhere · invoice PDF opens correctly.

## 5. Defect workflow
qa-tester files: `file:line`, repro steps, expected vs actual, severity (Blocker/Major/Minor). Orchestrator routes fixes to owning agent; regression test added for every Blocker/Major before close.
