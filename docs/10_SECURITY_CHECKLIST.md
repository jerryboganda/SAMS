# 10 — Security Checklist (Definition of Done — audited in Phases 2/5/9/12)

Each item must be marked PASS with evidence (file:line or test name) by the security-auditor agent.

## A. Transport & headers
- [ ] HTTPS enforced (Hostinger Force-HTTPS) + HSTS via helmet
- [ ] helmet defaults + CSP on app/player pages (self + video CDN + inline-hash only)
- [ ] CORS locked to APP_URL; credentials true; no wildcard
- [ ] Cookies: httpOnly, Secure (prod), SameSite=Lax; no tokens in localStorage

## B. Authentication & sessions (SRS: encrypted passwords, 2FA, session timeout)
- [ ] bcrypt cost 12; no plaintext anywhere incl. logs
- [ ] Access JWT 15 min; refresh 30 d rotating, hashed at rest, reuse-detection revokes family
- [ ] Account lock 6 fails/15 min; auth rate limits; generic error messages (no user enumeration — register/forgot return uniform responses)
- [ ] Email verification required before login; password reset tokens single-use, 1 h, hashed
- [ ] TOTP 2FA optional; secrets encrypted at rest (AES-256-GCM with APP key); backup codes hashed
- [ ] Change-password revokes other sessions + email notice

## C. Device & anti-sharing controls (SRS §5)
- [ ] Max 2 active devices enforced server-side; 3rd rejected (423) — cannot be bypassed by clearing cookies (fingerprint match reuses slot; mismatch counts as new)
- [ ] Admin-only device reset; action audit-logged; reset revokes all refresh tokens
- [ ] Suspicious login (new device / country change / fail burst) → alert email + re-verification gate; all attempts in login_events
- [ ] Single concurrent stream via heartbeat lock; takeover kills old session (tested)

## D. Video content protection (SRS §5)
- [ ] Video never stored/proxied on our server; provider tokenized URLs only
- [ ] Playback URLs signed, ≤6 h expiry, issued only after enrollment+expiry+device checks; per-user/lecture
- [ ] Referer/domain allowlist configured at provider; documented
- [ ] Dynamic moving watermark (name/email/timestamp) sourced from server session, not client input
- [ ] Free-preview path cannot unlock non-preview lectures (flag checked server-side)
- [ ] Download deterrents in player; limitations honestly documented (DRM = provider upgrade path)

## E. Authorization & data access
- [ ] Every student resource scoped by user_id from token (orders, invoices, tests, progress, bookmarks, notifications) — IDOR tests pass
- [ ] Role middleware on all /admin; admin pages lazy-loaded but security is server-side only
- [ ] Answer secrecy: is_correct/explanation absent pre-submit in exam/mock (deep-scan test)
- [ ] Enrollment expiry enforced on play, qbank meta/create, and course detail

## F. Payments integrity (SRS §10)
- [ ] Server recomputes all amounts; client price ignored (tamper test)
- [ ] Gateway callbacks signature/hash-verified; invalid → rejected + logged
- [ ] Idempotent success path keyed (gateway, external_ref); replay creates nothing twice
- [ ] Coupon validation server-side with row-lock on redemption (race test)
- [ ] Secrets only in env; settings API returns masked; never logged
- [ ] Manual overrides (mark-paid, approve/reject, refund-flag) require reason + audit log

## G. Input, output & files
- [ ] zod validation on every route (params/query/body); unknown keys stripped
- [ ] ORM parameterization everywhere; zero string-built SQL (grep-audited)
- [ ] Rich text sanitized on write (whitelist) + escaped on render; stored-XSS test passes
- [ ] Uploads: mime + magic-byte check, 5 MB cap, randomized names, served with correct content-type + `X-Content-Type-Options: nosniff`; proofs/invoices behind auth
- [ ] Request body limit 1 MB (uploads via dedicated multipart routes only)

## H. Abuse, monitoring, ops (SRS: audit logs, backups, firewall)
- [ ] Rate-limit map: global 300/15m; auth 10/15m; contact 5/h; play 30/min; import 10/h
- [ ] audit_logs on every admin mutation (actor, action, entity, summary, ip)
- [ ] winston logs: errors with request id, no PII/secrets/tokens; rotation configured
- [x] Weekly mysqldump rotation + Hostinger backups; restore procedure documented & rehearsed once (Phase 14, 2026-08-06: real `runDatabaseBackup()` invoked against the live dev DB, producing a genuine 1213-line `mysqldump` file; restored into a cleared `sams_academy_test` via the real `mysql` client per the documented restore command in `docs/09_DEPLOYMENT_HOSTINGER.md §5`; verified byte-for-byte-matching row counts across `users`/`courses`/`questions`/`orders`/`audit_logs` (7/5/202/3/35 on both sides) before resetting the test DB back to a normal migrated state.)
- [ ] Graceful shutdown (finish requests, close DB); global unhandled-rejection handler
- [ ] Hostinger WAF/CDN enabled (panel) — noted in deployment doc
- [ ] Dependency audit clean (`npm audit --omit=dev` no critical) at delivery; lockfile committed

## I. Privacy (SRS: privacy compliance)
- [ ] Privacy Policy / Terms / Refund pages live and linked in footer + checkout consent checkbox
- [ ] Only necessary PII collected (name, email, phone); deletion path: admin can anonymize a user (email→hash, name→"Deleted user") preserving financial records
- [ ] Emails include unsubscribe note for announcement blasts (transactional exempt)
