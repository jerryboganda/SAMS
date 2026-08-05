# 09 — Deployment: Hostinger Business Plan (single Node.js web app)

Hostinger Business supports managed **Node.js web apps** deployed from a **GitHub repo** (auto-build on push) or a **ZIP upload**, plus MySQL databases — all from hPanel. This app is designed to fit that: one process, `npm start`, MySQL, no ffmpeg/Redis/Docker. (Exact quotas evolve — confirm current limits in hPanel → your plan details.)

## 1. One-time setup in hPanel

**A. MySQL**
1. hPanel → **Databases → MySQL** → create database + user (all privileges). Note host (often `localhost` from the app; hPanel shows the exact host), db name (`uXXXX_sams`), user, password.
2. Optional: enable remote MySQL temporarily for your IP to run checks from your machine.

**B. Node.js web app**
1. hPanel → **Websites → Add website → Node.js app** (or Web Apps section) on your domain/subdomain (e.g., `samsacademy.com` or `app.samsacademy.com`).
2. Choose deployment method:
   - **GitHub (recommended):** connect the repo, branch `main`. Auto-deploys on push.
   - **ZIP:** upload `deploy.zip` produced by `npm run package` (Phase 14 script).
3. Settings: Node version **20**; Build command: `npm run build`; Start command: `npm start`; root = repo root. (Hostinger injects `PORT` — the app already reads `process.env.PORT`.)
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
6. Cron safety net (hPanel → Advanced → Cron Jobs): although the app runs node-cron internally, add a daily `curl -s https://<domain>/api/v1/health` (keep-alive/monitor) and weekly hit to the backup-trigger route if configured.
7. Point DNS, force HTTPS, submit sitemap to Search Console.
8. Enable Hostinger's WAF/CDN (hPanel → Website → your domain → Security/Performance, exact menu name varies by plan) — `docs/10_SECURITY_CHECKLIST.md §H` requires this be noted here as a panel-level step; it's not application code, just a checkbox in hPanel, but easy to forget it's a required delivery step.

## 4. Updating the app
GitHub method: merge to `main` → auto build+deploy (zero-touch). ZIP method: `npm run package` → upload. Migrations: run `npm run migrate` via SSH after deploys that include new migrations (README lists which releases do).

## 5. Hostinger-specific guardrails already built into the app
- Reads `PORT` from env; binds `0.0.0.0`.
- `trust proxy` enabled (Hostinger sits behind a proxy/CDN) so rate-limit & IP logging see real IPs.
- RAM-lean: no video processing, no headless browsers; PDF invoices via pdfkit (light).
- All writable paths under `./storage` (persisted); logs rotate (10 MB × 5) so inode/disk limits are safe.
- Weekly `mysqldump` to `storage/backups` (keep 4) **plus** rely on Hostinger daily backups — restore drill documented in README.
- If the panel shows the app "sleeping"/restarting: check RAM graph first; the app targets <400 MB RSS.

## 6. Troubleshooting quick table
| Symptom | Check |
|---|---|
| 503 after deploy | Build log in hPanel; Node version = 20; start cmd `npm start` |
| DB connect error | DB_HOST exact value from hPanel (not always localhost), user privileges |
| Emails not sending | SMTP 465 secure=true, correct mailbox password, SPF/DKIM enabled in hPanel |
| Payments callback never fires | IPN URL uses https + correct path; check `payment_events` for raw hits; gateway portal logs |
| Video plays locally not in prod | Bunny referer allowlist includes production domain; server clock (token expiry) |
