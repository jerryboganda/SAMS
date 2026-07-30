# 11 — Google AI Studio Frontend Prompt Pack (SAMS Academy)

Build the entire SAMS Academy frontend in **Google AI Studio → Build mode** by pasting these prompts in order. The app is generated with a **mock API layer that mirrors the real backend contracts** (docs/04_API_SPEC.md), so connecting it to the Node.js backend later is a one-flag switch.

**How to use**
1. Open AI Studio → **Build** → new app. Paste the **SYSTEM PROMPT** as the first message (or into System Instructions if shown).
2. Then paste **Prompt 1**, wait for the build, click through it, fix issues with short follow-ups ("X is broken, fix it"), then continue with Prompt 2 … 15 in order.
3. If the session ever loses context or you start a fresh chat, paste the **CONTEXT REFRESHER** (end of this doc) before continuing.
4. When finished: download/export the code → hand to Claude Code / Dr Faisal for backend wiring (§Integration at the end).

---

## SYSTEM PROMPT (paste first)

```
You are a senior frontend engineer building the complete production frontend for "SAMS Academy" — a premium medical exam-preparation platform (flagship: NRE Step 1; also USMLE Step 1/2CK, SMLE, DHA, Prometric, MBBS support) selling secure video courses, a QBank, and mock exams. Audience: medical students/doctors in Pakistan and the Gulf. Currency: PKR, shown as "Rs 15,000". Language: English only.

STACK & STRUCTURE
- React 18 + TypeScript + Tailwind CSS. Routing: react-router-dom. State: lightweight stores (zustand if available, else React Context). Charts: recharts (else minimal SVG). Video: hls.js. If any package is unavailable, implement a minimal substitute — never block.
- Single-page app with three areas: Public site, Student portal (/app/...), Admin panel (/admin/...).
- Folder layout: src/components/ui (shared kit), src/components/layout, src/pages/{public,student,admin}, src/api (see API LAYER), src/stores, src/utils, src/mock-data.

DESIGN SYSTEM (apply everywhere, never improvise new colors)
- Primary deep navy #0E2A47, accent teal #0FA3A3, page bg #F5F7FA, surfaces white, text #1E293B / secondary #64748B, success #16A34A, warning #D97706, danger #DC2626. Font: Inter (Google Fonts), headings semibold.
- Feel: premium, clinical, trustworthy — generous whitespace, 12px radius cards, soft shadows, subtle borders (#E2E8F0), teal used sparingly for CTAs/highlights. Fully responsive (mobile-first; admin tables may scroll horizontally on mobile). Every list/table has loading skeletons + a designed empty state; every mutation shows a toast.

API LAYER (critical — build exactly like this in Prompt 1 and reuse forever)
- src/config.ts: export const CONFIG = { USE_MOCK: true, API_BASE_URL: "/api/v1" }.
- src/api/client.ts: apiFetch(path, options) → fetch(API_BASE_URL+path, {credentials:"include"}), unwraps envelope {success, data, error:{code,message}} and throws typed ApiError on failure.
- src/api/endpoints/*.ts: one typed function per backend endpoint, with EXACT real paths (e.g., POST /auth/login, GET /student/dashboard, POST /qbank/tests, POST /checkout/orders, GET /admin/students...). Each function: if (CONFIG.USE_MOCK) return mockX(); else return apiFetch(...).
- src/api/mock/: mock implementations with realistic latency (300–600ms), persisted in localStorage where it helps (auth session, test progress), and rich seed data in src/mock-data (see below). Error paths must also be simulated (wrong password, DEVICE_LIMIT_REACHED, COUPON_INVALID, GATEWAY_NOT_CONFIGURED, etc.).

MOCK SEED DATA (make screens look real)
- Demo accounts: student@samsacademy.com / Student@123 and admin@samsacademy.com / Admin@12345.
- 3 courses (NRE Step 1 Complete — Rs 15,000/180 days, featured; SMLE Crash; MBBS Foundation), each with 4–6 sections and 5–8 lectures (titles, durations, one free-preview lecture). 9 subjects (Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Medicine, Surgery, Gynae/Obs), 10 body systems.
- 60+ QBank questions (realistic clinical vignettes, 4–5 options, correct answer, 2–3 sentence explanation, subject+system tags). 1 mock exam (50 Q, 60 min, pass 60%). Orders, invoices, notifications, announcements, analytics history for the demo student. Faculty (4 profiles), FAQs, testimonials.

AUTH & GUARDS
- Auth store holds {user, role} after login; route guards: student pages require role=student|admin, admin pages require role=admin; unauthenticated → /login with return-to. Mock login enforces the demo credentials, simulates 423 DEVICE_LIMIT_REACHED when email contains "+limit", and a 2FA step when email contains "+2fa".

HARD RULES
- EXCLUDED FEATURES — never build or mention: Live Classes, Notes Library, Discussion Forum, Certificates.
- Never show a question's correct answer or explanation in EXAM mode before submission (practice mode shows feedback after each answer).
- All money server-quoted in mocks (client never computes discounts itself).
- Keep code clean, typed, componentized; reuse the ui kit; no inline hex colors outside the token file.
- After each build step, self-check the acceptance list in my prompt and fix anything failing before responding.

Acknowledge briefly and wait for build prompts.
```

---

## Prompt 1 — Foundation, design system, API layer, layouts

```
Build the foundation. 1) Tailwind theme with the design tokens as CSS variables + tailwind config colors (navy, teal, bg, text, success/warning/danger). Inter font loaded. 2) UI kit in src/components/ui: Button (primary/secondary/ghost/danger, loading state), Input+PasswordInput+Select+Textarea+Checkbox (label+error), Card, Badge, Modal, Drawer, Tabs, Table (sortable header slot), Pagination, Toast system, Skeleton, EmptyState (icon+title+action), Stat card, ProgressBar, Tooltip, ConfirmDialog. 3) Layouts: PublicLayout (sticky navbar: logo "SAMS Academy" with a caduceus-style mark, links Home/Courses/QBank/Faculty/Contact, Login + "Get Started" teal CTA; rich footer with columns + legal links) · StudentLayout (left sidebar: Dashboard, My Courses, QBank, Mock Exams, Analytics, Bookmarks, Orders, Notifications, Profile; topbar with search placeholder, notification bell w/ unread badge dropdown, avatar menu) · AdminLayout (dark navy sidebar: Dashboard, Students, Courses, Question Bank, Mock Exams, Orders, Manual Payments, Coupons, Announcements, Faculty, FAQs, Messages, Reports, Settings, Audit Log). 4) Full router with placeholder pages for every route in all three areas + 404. 5) The complete API layer + mock seed data exactly as the system prompt defines (all endpoint modules: auth, public, student, video, qbank, mock-exams, checkout, notifications, admin). 6) Auth store + guards + PKR formatter + date utils.
ACCEPT: app runs; can navigate all placeholder routes; login as both demo users routes to the right portal; toast + modal demo works; no color outside tokens.
```

## Prompt 2 — Public site: Home, Catalog, Course detail

```
Build the public marketing pages using PublicLayout and mock data.
1) HOME: hero (headline "Master Your Medical Licensing Exams", subline, CTA "Browse Courses" + "Try Free QBank Demo", subtle medical illustration/gradient in navy with teal accents), trust stats strip (students, questions, pass rate, hours of video), Featured Courses grid (CourseCard: thumbnail placeholder w/ gradient + initials, title, exam badge, rating stars, price Rs, "View Course"), "Why SAMS" 4-feature grid (secure HD video, exam-style QBank, performance analytics, expert faculty), faculty preview row, testimonials carousel, final CTA band.
2) /courses CATALOG: filter bar (exam category chips, search, sort by price/newest), responsive grid of CourseCards, skeletons + empty state.
3) /courses/:slug DETAIL: two-column — left: overview, "What you'll learn" checklist, curriculum accordion (sections → lectures with duration; FREE PREVIEW badge on preview lectures opens a modal player placeholder; locked icon otherwise), faculty card, FAQ accordion; right sticky pricing card (price, validity "180 days access", features list, "Enroll Now" → /checkout/:slug if logged in else /login, "Already enrolled → Go to course" state).
ACCEPT: filters work on mock data; preview modal opens; enrolled state renders for the demo student's enrolled course.
```

## Prompt 3 — Public site: Faculty, About, Contact, FAQs, Legal

```
Build remaining public pages. /faculty: grid of profile cards (photo placeholder, name, credentials, bio excerpt) → /faculty/:id profile page. /about: mission, story, values, stats. /contact: form (name, email, subject, message) → POST /contact mock with success toast + inline validation + rate-limit error state. /faqs: searchable accordion grouped by topic (Courses, Payments incl. "How do I pay with Raast/JazzCash?", Devices & access, QBank). Legal pages /terms, /privacy, /refund-policy rendered from mock markdown-ish content with a side table of contents. Polish navbar active states + mobile drawer menu.
ACCEPT: contact validates and toasts; FAQ search filters; mobile menu works.
```

## Prompt 4 — Auth flows

```
Build all auth screens as centered cards on a navy gradient split-screen (left brand panel with logo + tagline, right form).
/register: name, email, phone (+92 format hint), password with live strength meter + confirm, terms checkbox → success screen "Verify your email" (mock resend w/ 60s cooldown). /verify-email/:token mock page (success + invalid states). /login: email+password; error states: invalid credentials, ACCOUNT_LOCKED (shows retry-after), 423 DEVICE_LIMIT_REACHED → dedicated screen explaining the 2-device policy with "contact support" panel; suspicious-login path → "Confirm it's you" 6-digit email-code step; 2FA path → TOTP 6-digit input with backup-code link. /forgot-password → email sent state; /reset-password/:token with strength meter. After login route by role; support return-to redirect. Add logout everywhere in avatar menus.
ACCEPT: use student+limit@… to see device screen, student+2fa@… for TOTP step; all error states reachable in mock.
```

## Prompt 5 — Student dashboard, My Courses, Course home

```
Build the student learning hub.
/app/dashboard: welcome header ("Good evening, Dr. …"), Continue Learning card (last lecture, resume button, progress bar), stats row (study hours this week, QBank accuracy, day streak, tests taken), My Courses grid (progress %, remaining lectures, expiry countdown badge — amber when <14 days, red expired state with renew CTA), latest announcements list, recent activity feed.
/app/courses: enrolled courses with the same cards + expired section.
/app/courses/:id (course home): header (title, overall progress, expiry), curriculum panel — sections accordion, each lecture row: play icon, title, duration, completed tick, bookmark toggle, "resume" marker on the current lecture; clicking a lecture → /app/learn/:lectureId. Include a small "Course stats" side card (completed/total, watch time).
ACCEPT: dashboard populated from mock; expiry badges show all three states; lecture rows navigate.
```

## Prompt 6 — SecurePlayer (lecture watch page)

```
Build /app/learn/:lectureId — the secure video experience.
Layout: player left (16:9), collapsible curriculum sidebar right (current lecture highlighted, auto-advance toggle). Player: hls.js playing the mock stream URL from GET /student/lectures/:id/play (mock returns a public test HLS URL, watermark payload {name,email}, resumeAt seconds); custom controls (play/pause, seek bar with buffered indicator, volume, playback speed 0.75–2x, fullscreen, "±10s" buttons). SECURITY UX: moving watermark overlay showing "name • email • live timestamp", semi-transparent, repositions to a random corner/edge every 20–30s, stays visible in fullscreen; disable right-click/download on the video element; heartbeat POST every 15s (mock) updating resume position — if mock returns 409 STREAM_TAKEN_OVER (simulate via a "Simulate second device" dev button), pause and show a blocking modal "Your account started playback on another device" with Reload option. Mark lecture complete at ≥90% (tick appears in sidebar + toast). Below player: lecture title, description, bookmark button, prev/next lecture buttons.
ACCEPT: watermark moves & survives fullscreen; takeover modal via the dev button; resume position persists (localStorage mock); completion tick updates.
```

## Prompt 7 — QBank home + Create Test wizard

```
Build the QBank hub.
/app/qbank: header stats (total answered, overall accuracy %, unused questions remaining, bookmarks count), primary "Create New Test" CTA, resume banner if an in-progress test exists (mock one), Previous Tests table (date, mode, #questions, score %, review link, status), quick links (Incorrect questions, Bookmarked).
/app/qbank/new — 3-step wizard in a card: Step 1 Mode (Practice = instant feedback / Exam = feedback after submit; timed toggle + minutes auto-suggested at 1.2 min/question). Step 2 Question pool (All / Unused / Incorrect only / Bookmarked) + Subjects and Body Systems as checkbox chip grids EACH showing live available-question counts from mock meta, select-all per group. Step 3 Count slider (5–200, clamped to available) + summary panel → "Start Test" creates via POST /qbank/tests and navigates to the runner. Handle ACTIVE_TEST_EXISTS with a modal (Resume / Abandon & start new).
ACCEPT: counts update live as filters change; clamp works; conflict modal reachable via mock.
```

## Prompt 8 — TestRunner

```
Build /app/qbank/test/:id — the exam engine UI (used by QBank and later mock exams).
Top bar: test title, mode badge, question x/y, countdown timer (mono font, amber <5 min, red <1 min), pause note ("timer runs on the server" tooltip), Submit button. Left: question card — clinical vignette text, options A–E as large selectable rows (radio) with letter chips; FLAG toggle (flagged = amber corner ribbon); in PRACTICE mode selecting an answer locks it and immediately shows correct/incorrect coloring + explanation card + subject tag; in EXAM mode answers are changeable until submit, no feedback. Right: palette drawer (grid of numbered squares: answered=navy, flagged=amber ring, current=teal border, unanswered=outline), filter chips (all/unanswered/flagged), Prev/Next. Keyboard: 1–5 select, ←/→ navigate, F flag. Autosave every answer via mock POST with a tiny "Saved" indicator; queue + retry if the mock randomly fails (simulate 5% failure). Timer expiry → auto-submit with a toast. Submit → confirm dialog listing unanswered/flagged counts → navigate to results.
ACCEPT: both modes behave correctly (no leaked answers in exam mode — verify network-layer mock too); palette states accurate; keyboard works; expiry auto-submits.
```

## Prompt 9 — Results, Review, Bookmarks, Incorrect

```
Build post-test screens.
/app/qbank/test/:id/results: hero score card (big % with donut, pass/fail chip when applicable, correct/incorrect/skipped counts, time taken), breakdown by subject and system (horizontal bars with accuracy %), actions: Review Answers, Retake similar (opens wizard prefilled), Back to QBank.
/app/qbank/test/:id/review: reuses the question card in review mode — every question shows chosen vs correct (green/red highlights), explanation, subject/system tags, bookmark toggle; filter tabs All / Incorrect / Flagged / Correct; palette reflects review coloring. Guard: review route blocked (redirect + toast) if the test isn't completed.
/app/qbank/bookmarks: table of bookmarked questions (stem preview, subject, added date) → side-peek drawer showing full question+explanation, remove bookmark.
/app/qbank/incorrect: same pattern for past-incorrect questions + CTA "Practice these now" (prefills wizard with incorrect pool).
ACCEPT: breakdown math matches mock data; review guard works; prefill CTAs open the wizard with correct selections.
```

## Prompt 10 — Analytics + Mock Exams

```
1) /app/analytics: date-range picker (7/30/90 days), cards (accuracy trend %, total questions, study hours, tests taken), charts (recharts): accuracy-over-time line, questions-per-day bar, subject-wise accuracy horizontal bars, system-wise accuracy; Strengths (top 3, green) & Weaknesses (bottom 3, red) panels with "practice this subject" quick actions; cumulative progress ring toward a settable weekly goal (localStorage).
2) /app/mock-exams: list of available mock papers (name, question count, duration, pass mark, attempts used, best score) with Start button → instructions modal (rules: timed, no feedback until end, pass mark) → runs the SAME TestRunner in mode=mock (fixed question order from mock API) → results screen adds PASS/FAIL banner vs pass mark + attempt history table on the mock detail. Attempt history also on /app/mock-exams per exam (expandable rows).
ACCEPT: charts render from mock history; mock exam full flow start→run→pass/fail→history updates.
```

## Prompt 11 — Checkout, Orders, Notifications, Profile

```
1) /checkout/:slug (student-guarded): order summary card (course, validity, price), coupon input → server-quoted totals via mock POST /checkout/quote (show discount line; error states COUPON_INVALID/EXPIRED/USED_UP inline), payment method radio list RENDERED FROM the mock enabled-gateways config: JazzCash, EasyPaisa, Raast, Bank Transfer (PayFast & Safepay exist in config as disabled:true — render nothing for them). Selecting JazzCash/EasyPaisa → Pay button simulates redirect → /order/:id/status which polls mock status pending→paid (2s) → success confetti card "You're enrolled!" + Start Learning; simulate a failed path too (retry button). Selecting Raast → instructions panel: academy Raast ID, IBAN, bank name, QR image placeholder, copy buttons, amount; upload proof/transaction-ref form → status page shows "Awaiting verification" state. Bank Transfer → same pattern with bank details. 409 ALREADY_ENROLLED handled with a friendly screen.
2) /app/orders: table (invoice no SAMS-2026-00001, course, amount, gateway, status chips incl. awaiting_verification/rejected-with-reason) + "Download Invoice" (mock generates a styled printable invoice view → window.print()).
3) /app/notifications: list with unread dots, mark-all-read; bell dropdown shows latest 5.
4) /app/profile: tabs — Profile (name/phone edit), Security (change password; 2FA setup flow: QR placeholder + code confirm + backup codes list + disable), Devices (2 slots visualized, current device highlighted, note "resets are done by support").
ACCEPT: every gateway path reaches a coherent end state; disabled gateways truly absent; invoice prints cleanly; 2FA mock flow completes.
```

## Prompt 12 — Admin: Dashboard, Students, Orders, Manual payments, Coupons

```
Build the first admin block in AdminLayout (admin demo login).
/admin: KPI cards (revenue this month Rs, new students, active enrollments, pending manual payments), revenue area chart (30d), recent orders table, recent signups list, quick links.
/admin/students: searchable/paginated table (name, email, joined, enrollments, status) → /admin/students/:id detail with tabs: Overview (info + suspend/activate toggle w/ confirm), Enrollments (extend-validity action), Devices (2 slots with fingerprints + last seen + "Reset devices" confirm — writes an audit toast), Activity (login events list incl. flagged suspicious rows), Orders.
/admin/orders: filter bar (status, gateway incl. raast/payfast/safepay values, date range) table → /admin/orders/:id: summary, payment events timeline (raw mock IPN entries), actions Mark as Paid (reason required) / Flag Refund (reason) with confirm dialogs.
/admin/manual-payments: pending queue table (gateway chip Bank/Raast, student, amount, proof thumbnail → lightbox, reference) with Approve / Reject (reason modal) → row moves to history tab; approving toasts "Enrollment activated".
/admin/coupons: CRUD table + create/edit modal (code, % or fixed Rs, max uses, per-user limit, window, active toggle), usage counts.
ACCEPT: device reset, mark-paid, approve/reject all mutate mock state visibly; filters work; every action confirms + toasts.
```

## Prompt 13 — Admin: Content (Courses, Curriculum builder, Question bank, CSV import, Mock builder, Taxonomy)

```
/admin/courses: table (title, price, published toggle, students) + create/edit form (title, slug auto, exam category, description rich-textarea, price Rs, validity days, thumbnail upload placeholder, publish switch) → Curriculum tab: sections list with drag-handle reorder, add/rename/delete; inside each section lectures with drag reorder, edit modal (title, duration, video attach modal — mock Bunny library picker list + "mark as free preview" toggle).
/admin/questions: filter bar (subject, system, difficulty, search) paginated table → editor page: vignette textarea with live preview card, 4–6 option rows (mark correct radio), explanation textarea, subject/system/difficulty selects, tags, save-and-new. Soft-delete with confirm.
/admin/questions/import: 3-step CSV wizard — download template button, upload → DRY-RUN results table (valid count green, per-row errors red with reason), Commit button imports valid rows (summary toast). Include a sample bad CSV in mocks to demo errors.
/admin/mock-exams: list + builder: settings (name, duration, pass %, published) + question picker (filterable list, add/remove, drag order, running count) with fixed-order preview.
/admin/taxonomy: manage Subjects and Body Systems (inline add/rename/archive, question counts).
ACCEPT: drag reorder persists in mock; import dry-run shows the seeded errors then commits the rest; builder count/order behave.
```

## Prompt 14 — Admin: Announcements, Faculty, FAQs, Messages, Reports, Settings, Audit log

```
/admin/announcements: list + composer (title, body, audience: All students / specific course select, "also send email" toggle) — publishing pushes into student mock notifications. /admin/faculty and /admin/faqs: simple CRUD with reorder. /admin/messages: contact-inbox table (unread bold) → detail drawer, mark-resolved. /admin/reports: cards + tables for Revenue by month, Enrollments by course, QBank usage, Top students — each with an "Export CSV" button (client-side CSV from mock data). /admin/settings: tabs — Site (name, support email/phone, social links), Payments (bank details + Raast ID/IBAN/QR upload placeholder; gateway keys shown as password inputs with masked existing values ••••; enabled-gateways checkboxes where PayFast/Safepay rows carry a "Placeholder — integration pending" badge), Video (Bunny fields masked), SMTP (masked + "Send test email" button), Legal (three markdown textareas). /admin/audit-log: filterable table (actor, action, entity, date) fed by every admin mutation performed this session.
ACCEPT: settings masking behaves; announcement reaches the student bell; audit log grows as you act; CSV downloads.
```

## Prompt 15 — Polish & QA sweep

```
Final pass across the whole app: 1) Responsive audit — verify navbar drawer, student sidebar collapse to bottom-tab/hamburger, runner palette becomes a slide-up sheet, admin tables scroll horizontally; fix anything cramped at 375px. 2) Ensure EVERY async view has skeletons, empty states, and error states (add a global ErrorBoundary page + apiFetch error toasts). 3) Consistency: buttons, spacing, headings, chip colors from tokens only; page <title> per route; favicon + logo mark. 4) Add a floating "DEV" panel (only when USE_MOCK) with switches: simulate slow network, simulate stream takeover, reset mock data, switch role. 5) Accessibility: labels on inputs, focus rings, modal focus trap, alt text. 6) Give me a final summary listing every route built and any known limitation.
ACCEPT: no route is missing states; dev panel works; summary delivered.
```

---

## CONTEXT REFRESHER (paste if a new session forgets the project)

```
Reminder of the project you are building: SAMS Academy medical exam-prep frontend. React+TS+Tailwind. Tokens: navy #0E2A47, teal #0FA3A3, bg #F5F7FA, Inter. Three areas: public site, student portal /app, admin /admin. Mock API layer in src/api mirrors real backend paths under /api/v1 with CONFIG.USE_MOCK=true. Demo logins: student@samsacademy.com/Student@123, admin@samsacademy.com/Admin@12345. Payments: JazzCash, EasyPaisa, Raast (manual: Raast ID/IBAN/QR + proof upload), Bank Transfer; PayFast & Safepay exist only as disabled placeholders. Video: hls.js SecurePlayer with moving name•email•time watermark, 15s heartbeat, takeover modal, 2-device policy messaging. QBank: practice/exam modes, wizard (pools: all/unused/incorrect/bookmarked; subjects/systems with live counts), TestRunner with palette/flags/timer, results+review, analytics, mock exams reuse the runner. EXCLUDED forever: Live Classes, Notes Library, Discussion Forum, Certificates. Exam mode must never expose answers before submit. Currency "Rs 15,000". Continue from where we left off.
```

---

## Integration back into the kit (for Claude Code / Dr Faisal)

1. Export the AI Studio project → place it as `client/` in the repo (replace the scaffold).
2. Set `CONFIG.USE_MOCK=false`, `API_BASE_URL="/api/v1"` (same-origin; cookies already `credentials:"include"`).
3. In `07_EXECUTION_PLAN.md`, the frontend-build sub-tasks of Phases 3–11 become **"wire exported UI to real API + fix contract drift"** — backend, security, and test tasks unchanged. Tell Claude Code at kickoff: *"The client/ folder is a finished UI from AI Studio with a mock layer mirroring 04_API_SPEC — integrate it, do not rebuild it."*
4. Replace the mock HLS URL path with the real `/play` response; the watermark/heartbeat hooks already match the backend contract.
5. Run the Phase 13 QA matrix as-is — it applies unchanged.
