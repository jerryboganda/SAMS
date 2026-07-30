# 01 — Product Requirements Document (PRD)

Source: *SAMS Academy Full SRS — Dr. Zabih Ullah*, adapted for the fixed Node.js + MySQL + Hostinger stack.
**Excluded permanently:** Live Classes, Notes Library, Discussion Forum, Certificates.

## 1. Product summary

SAMS Academy is a premium online medical-education platform for **NRE Step 1, USMLE Step 1, USMLE Step 2 CK (future), SMLE, DHA, Prometric, and MBBS** students. It sells **courses** (secure video lectures) and **QBank/mock-exam access**, with strong content protection, analytics, and a full admin panel. Payments are Pakistan-first (JazzCash, EasyPaisa, Raast, bank transfer — plus PayFast & Safepay card slots wired as placeholders for later) with automatic course activation.

## 2. User roles

| Role | Capabilities |
|---|---|
| **Visitor** | Public site, course catalog, free-preview lectures, sample questions, register |
| **Student** | Buy/enroll, watch secure video, use QBank & mock exams, dashboard, analytics, notifications, profile & device management (view only) |
| **Admin** | Everything: users, devices, courses, lectures, questions, mock exams, orders, coupons, bank-transfer approvals, announcements, faculty, FAQs, reports, audit logs, settings |

(Faculty are displayed publicly as profiles managed by Admin; they do not log in for v1.)

## 3. Functional requirements by module

### 3.1 Registration & Login
- Email + password registration; email verification link (24 h expiry).
- Login with email/password; optional TOTP 2FA (enable/disable with QR + backup codes).
- Forgot/reset password via emailed token (1 h expiry).
- **Device limit:** max **2 registered devices** per account. A device = stable fingerprint (server-issued device token stored client-side + UA hash). 3rd device → login blocked with clear message; **only Admin can reset devices**.
- **Suspicious login detection:** new device, or new IP country, or >5 fails → flag `login_events`, email alert to student, require re-verification if flagged; account lock 15 min after 6 consecutive failures.
- Session timeout: access token 15 min silent-refresh; refresh token 30 d rotating; logout everywhere (revoke all refresh tokens) available to student and admin.

### 3.2 Student Dashboard
- Cards: purchased courses with **progress %**, remaining lectures, access **expiry date** countdown.
- **Continue watching** (last lecture + resume position).
- **Study hours** (total + last 7 days, from watch heartbeats and QBank time).
- Announcements feed (global + per enrolled course), notifications bell (unread count).
- **Bookmarked lectures** list. QBank quick stats + "resume test" shortcut.

### 3.3 Course Management (Admin) & Catalog (Public)
- Course: title, slug, exam category, description (rich text), thumbnail, price (PKR), validity days, published flag, "includes QBank" flag, sort order.
- Structure: Course → Sections → Lectures (title, description, duration, free-preview flag, video reference, published, sort). Drag-order via sort fields.
- Public catalog with category filter; course detail page: curriculum outline (locked/unlocked), faculty, price, FAQs, buy button; free-preview lectures playable by visitors.

### 3.4 Secure Video Streaming (SRS §5 — high priority)
- Streaming only, **no downloads**. Video files never touch our server.
- Provider adapter (default **Bunny Stream**): admin uploads via provider; playback via **short-lived signed URLs / embed tokens** (≤ 6 h, bound to user+lecture) issued by our API only to enrolled, verified students.
- **HLS** delivery; provider-level encryption/token auth; DRM tier optional via provider upgrade (documented, not required for v1).
- **Dynamic moving watermark** overlaid by our player: student name • email • date-time, semi-transparent, position shifts every 20–30 s; also injected server-side into the player page so it cannot be removed by simple CSS.
- **Single concurrent stream:** player heartbeat every 30 s → server keeps one active playback session per user; starting a second stream kills the first.
- Right-click/inspect deterrents on player page (deterrent-level, documented as such).
- Watch progress heartbeat (every 15 s) updates `lecture_progress` (resume point, watched seconds, completed at ≥ 90 %).

### 3.5 QBank
- Question model: single-best-answer MCQ; stem (rich text + optional image), 4–5 options, correct answer, **detailed explanation + references**, exam category, **subject**, **system**, difficulty.
- **Modes:** Practice (instant feedback per question) and Exam (feedback at the end). **Timed or untimed.**
- Test builder: choose exam category → subjects and/or systems → count (5–200) → mode → timed → **random** selection honoring filters; options to include only *unused*, *incorrect*, or *bookmarked* questions.
- In-test: palette (answered/skipped/flagged), flag question, timer, auto-submit at 0:00, resume unfinished test.
- Post-test review: every question with chosen vs correct, explanation, references, time per question.
- **Bookmarks** and **Incorrect-questions review** pools, retestable in one click.

### 3.6 QBank Analytics (Student)
- Overall: correct % / incorrect % / skipped %, average time per question, totals.
- **Subject-wise and system-wise** performance bars → strengths (top 3) & weaknesses (bottom 3).
- Daily / weekly / monthly progress line + questions-per-day graph. Test history table.

### 3.7 Mock Exams
- Admin-authored **fixed papers** (title, exam category, question list & order, duration, pass mark, published).
- Full-screen timed run identical to exam mode; one attempt record per run; multiple attempts allowed (each stored).
- Result: score, percentage, pass/fail vs pass mark, subject/system breakdown, full review; appears in analytics history.

### 3.8 Payments (SRS §10)
- Order flow: course page → checkout (login required) → apply **coupon** → choose method → pay → **automatic activation** (enrollment starts_at now, expires_at +validity_days) → invoice.
- Methods via `PaymentGateway` adapter: **JazzCash** (hosted checkout + hash-verified callback/IPN), **EasyPaisa** (same), **Raast** (manual flow: checkout shows the academy's Raast ID / IBAN / QR from Settings → student pays via their banking app → uploads proof/transaction ref → admin approves → auto-activation; a driver slot is reserved for future direct-API integration), **PayFast** and **Safepay** (PLACEHOLDER drivers — registered and interface-complete but hidden from checkout until enabled + configured; return `GATEWAY_NOT_CONFIGURED` otherwise), **Bank Transfer** (proof image + reference → admin approves → auto-activation).
- **Coupons:** code, % or fixed PKR, per-course or global, validity window, max uses, active flag; validated server-side at checkout.
- **Invoices:** sequential number `SAMS-YYYY-#####`, downloadable PDF (server-generated), emailed on payment.
- Order states: `pending → paid | failed | cancelled`, `awaiting_verification → paid | rejected` (bank transfer), `paid → refunded` (admin manual flag). Webhooks idempotent; every gateway payload stored in `payment_events`.

### 3.9 Notifications
- In-app notifications (bell + list, mark read) + email for: purchase confirmed, bank transfer approved/rejected, enrollment expiring in 7 days / expired, new device login alert, password changed, admin broadcast announcements.
- Announcements: admin composes to *all students* or *one course's students*; shows on dashboard; optional email blast.
- Cron jobs: expiry reminders (daily), session/temp-token cleanup, denormalized analytics refresh.

### 3.10 Admin Panel
- KPI dashboard: revenue (today/7d/30d/total), orders by status, new students, active enrollments, top courses, QBank usage.
- Management CRUD: students (search, suspend, verify, **reset devices**, view enrollments/orders/logins), courses/sections/lectures, questions (single + **CSV/XLSX bulk import** with validation report), mock exams, orders (+ bank-transfer approval queue), coupons, announcements, faculty, FAQs, contact messages, settings (site, payment keys, video keys, SMTP — stored masked).
- Reports: revenue by period/course (CSV export), enrollment counts, QBank difficulty report (hardest questions by success rate).
- **Audit log** of every admin mutation (who, what, when, before/after summary).

### 3.11 Public Website Pages
Home, About SAMS Academy, Courses (catalog + detail), QBank (marketing + sample questions), Faculty, Contact (form → DB + email), FAQs, Privacy Policy, Terms & Conditions, Refund Policy. (No Notes page, no Live Classes page.)

## 4. Non-functional requirements
- Fits Hostinger Business single Node app: RAM-lean (target < 400 MB RSS), no ffmpeg, no heavy queues; cron in-process.
- P95 API < 500 ms on seeded data (10k questions, 1k users). Mobile-first responsive UI; Lighthouse ≥ 85 on public pages.
- Security per `10_SECURITY_CHECKLIST.md`. Daily DB backup via Hostinger + weekly `mysqldump` cron to `/storage/backups` (rotate 4).
- English UI, LTR, professional medical-education look (deep blue/teal + white; clean, dense-but-calm dashboards).

## 5. Out of scope (v1)
Excluded four modules (§ top); plus AI assistant, flashcards/spaced repetition, native mobile apps, OSCE/virtual patients, multi-currency checkout, faculty logins. Schema/adapters must not block adding these later.
