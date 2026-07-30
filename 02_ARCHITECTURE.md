# 02 — System Architecture

## 1. Shape: one Node.js monolith (Hostinger constraint)

Hostinger Business gives us **one Node.js web app** + MySQL. Therefore:

```
Browser ──► Express app (single process, PORT from env)
             ├── /api/v1/*  ........ JSON REST API
             ├── /uploads/* ........ protected static (images, proofs)
             └── /* ............... client/dist (React SPA, index.html fallback)
                       │
                       ├── MySQL 8 (Hostinger DB)  ← Sequelize (mysql2)
                       ├── Bunny Stream (video CDN) ← VideoProvider adapter
                       ├── JazzCash / EasyPaisa / Raast / PayFast·Safepay(placeholders) ← PaymentGateway adapter
                       └── SMTP (Hostinger email)   ← nodemailer
```

No Redis, no workers, no Docker in production. Cron via `node-cron` inside the process. Everything that is heavy (video storage, transcoding, streaming bandwidth) is delegated to the video provider's CDN — that is what makes this viable on shared hosting.

## 2. Repository layout (monorepo, single deployable)

```
sams-academy/
├── CLAUDE.md                    # project rules (from this kit)
├── docs/                        # this kit (specs + execution plan)
├── .claude/agents/              # subagent definitions (06_AGENT_TEAM.md)
├── package.json                 # root scripts (dev/build/start/verify)
├── .env.example
├── server/
│   ├── src/
│   │   ├── index.js             # boot: env→db→cron→express.listen
│   │   ├── app.js               # middleware chain + routes + SPA fallback
│   │   ├── config/              # env loader (zod-validated), constants
│   │   ├── db/                  # sequelize instance, migrations/, seeders/
│   │   ├── models/              # one file per table (03_DATABASE_SCHEMA.md)
│   │   ├── routes/              # v1/auth.js, v1/courses.js, ... (04_API_SPEC.md)
│   │   ├── controllers/         # thin: validate(zod) → service → respond
│   │   ├── services/            # authService, deviceService, courseService,
│   │   │                        # videoService, qbankService, testService,
│   │   │                        # mockExamService, orderService, couponService,
│   │   │                        # invoiceService, enrollmentService,
│   │   │                        # notificationService, analyticsService,
│   │   │                        # announcementService, auditService, statsService
│   │   ├── adapters/
│   │   │   ├── video/           # index.js (factory) + bunny.js + mock.js
│   │   │   └── payments/        # index.js + jazzcash.js + easypaisa.js + raast.js + payfast.js + safepay.js (placeholders) + banktransfer.js + mock.js
│   │   │                        # + card.js + bankTransfer.js + mock.js
│   │   ├── middleware/          # auth, requireRole, deviceCheck, rateLimits,
│   │   │                        # errorHandler, audit, uploadImage(multer)
│   │   ├── jobs/                # cron: expiryReminders, cleanup, backup, stats
│   │   ├── utils/               # jwt, crypto, mailer, pdfInvoice, pagination,
│   │   │                        # csvImport, apiError, logger
│   │   └── emails/              # nunjucks/handlebars templates
│   └── tests/                   # jest + supertest (sqlite/mysql test db)
├── client/
│   ├── src/
│   │   ├── main.tsx / App.tsx / router.tsx
│   │   ├── api/                 # axios instance + typed endpoint modules
│   │   ├── stores/              # zustand: auth, player, testRunner
│   │   ├── components/          # ui/ (buttons, cards, table, modal, toast),
│   │   │                        # layout/ (PublicLayout, StudentLayout, AdminLayout),
│   │   │                        # player/SecurePlayer.tsx (hls.js + watermark),
│   │   │                        # qbank/ (TestRunner, Palette, QuestionCard, Review),
│   │   │                        # charts/ (recharts wrappers)
│   │   ├── pages/               # per 05_FRONTEND_SPEC.md (public/, student/, admin/)
│   │   └── lib/                 # helpers, formatters, guards
│   └── vite.config.ts           # dev proxy /api → :5000; build → client/dist
└── storage/                     # gitignored: uploads/, invoices/, backups/, logs/
```

## 3. Request lifecycle & middleware order

`helmet → cors(APP_URL) → json(1mb) → cookieParser → rateLimit(global 300/15min) → routes → 404 → errorHandler`.
Auth routes add `rateLimit(10/15min per IP+email)`. Protected routes: `auth (verify JWT) → deviceCheck (device token still registered & active) → requireRole(...)`. Admin mutations additionally pass `audit` middleware (writes `audit_logs` after success).

## 4. Auth & device model (SRS §5 + §12)

- Login OK → issue: access JWT (15 min, in memory/cookie) + refresh token (random 64B, hashed in `refresh_tokens`, rotating, 30 d, httpOnly cookie) + **device token** (random 64B, httpOnly cookie, 1 y) ↔ row in `user_devices`.
- On login: if device token matches an active device → reuse. Else count active devices: `<2` → register new; `=2` → **reject** `DEVICE_LIMIT_REACHED` (admin reset required). All logins recorded in `login_events` with IP, UA, fingerprint hash, and status.
- Suspicious = new device OR IP-country change OR ≥3 recent fails → mark event, email alert, and require email re-verification code before session issued.
- Concurrent stream lock: `playback_sessions` (one active per user); heartbeat PUT every 30 s; stale > 90 s = dead; new stream closes the old (player receives 409 on its next heartbeat and stops).

## 5. QBank engine design

- Random test build: `SELECT id FROM questions WHERE <filters> ORDER BY RAND() LIMIT n` is fine ≤ 50k questions (measured; revisit if bank grows). Pools: *unused/incorrect/bookmarked* resolved via `user_question_history` / `question_bookmarks`.
- A test = `test_sessions` row + `test_attempt_questions` rows (frozen snapshot of question ids + order). Answers PATCHed per question (supports resume); server computes correctness, timing, and score at submit; `user_question_history` upserted for pools + analytics.
- Analytics come from indexed aggregates over `test_attempt_questions` joined to questions (subject/system), cached daily into `user_daily_stats` by cron for the graphs.

## 6. VideoProvider adapter (default: Bunny Stream)

```js
interface VideoProvider {
  name;                                   // 'bunny' | 'mock'
  getUploadInstructions(lecture);         // admin help: where/how to upload
  getPlaybackConfig(lecture, user);       // → { type:'hls'|'iframe', url, expiresAt }
  validateRef(videoRef);                  // check GUID exists (API ping)
}
```
- **Bunny Stream:** library + API key in env; playback uses **token-authenticated signed URLs** (SHA-256 of security key + video GUID + expiry) for HLS/iframe; expiry ≤ 6 h; referer allowlist set to our domain in Bunny panel. Cheap, HLS everywhere, optional MediaCage/DRM tier later — satisfies SRS "encrypted HLS + signed URLs, DRM where supported".
- **Watermark:** our `SecurePlayer` renders name • email • timestamp as a moving overlay; data injected from the authenticated session server-side. Download/right-click deterrents applied. (True forensic watermarking = provider DRM upgrade; documented.)
- **mock driver:** returns a local sample HLS/mp4 so the whole app builds and tests with zero credentials.

## 7. PaymentGateway adapter

```js
interface PaymentGateway {
  code;                                   // 'jazzcash'|'easypaisa'|'raast'|'payfast'|'safepay'|'bank_transfer'|'mock'
  createCheckout(order);                  // → { redirectUrl | formFields | instructions }
  handleCallback(req);                    // verify signature/hash → {orderRef, status, raw}
}
```
- **JazzCash & EasyPaisa (live drivers):** hosted-checkout pattern — build signed payload (HMAC per gateway spec, secrets in env), redirect, verify secure-hash on return/IPN, idempotent by `gateway_ref`.
- **Raast (manual pseudo-gateway):** `createCheckout` returns instructions payload from admin Settings (Raast ID / IBAN / QR image) → student pays in their bank app → uploads proof/txn ref → **same admin approval queue as bank transfer** → shared success path. A commented driver slot is left for a future direct Raast/bank API.
- **PayFast & Safepay (PLACEHOLDER drivers):** interface-conformant stubs registered in the factory but hidden from checkout unless present in `PAYMENTS_ENABLED_GATEWAYS` *and* configured; if invoked unconfigured they return `GATEWAY_NOT_CONFIGURED` cleanly. Integrating later = fill the stub + env keys, zero changes elsewhere.
- **Bank transfer:** pseudo-gateway → instructions + proof upload → admin approval queue.
- On verified success (single code path for all gateways): mark order `paid` → create enrollment → generate invoice PDF → notification + email. Failure → `failed` + retry link. Every callback stored raw in `payment_events`.
- **mock driver:** auto-approves in dev/test so autonomous E2E runs green without real merchant accounts.

## 8. Key decisions log (why)

| Decision | Why |
|---|---|
| Express + Sequelize/mysql2, not Nest/Prisma | Pure-JS, no native engines/binaries → zero surprises on Hostinger shared Node runtime; smaller RAM |
| React SPA served by Express, not Next.js SSR | One process, tiny memory, no SSR build on host; SEO handled via meta tags + prerender-ready structure (public pages are few) |
| Videos on Bunny Stream | Shared hosting cannot store/transcode/stream video; Bunny gives HLS + signed tokens + CDN at low cost; adapter keeps VdoCipher/Cloudflare Stream swappable |
| JWT + rotating refresh in cookies | Stateless API, revocable sessions, works on one domain, no Redis |
| In-process cron | No worker quota on shared hosting; jobs are light (emails, cleanup, aggregates) |
| Snapshot test questions | Editing/deleting questions later never corrupts past attempts/analytics |
