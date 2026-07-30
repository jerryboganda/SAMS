# 05 — Frontend Specification (React 18 + Vite + TS + Tailwind)

## 1. Design system
- **Brand:** professional medical-education. Primary deep blue `#0E2A47`, accent teal `#0FA3A3`, success green, warning amber, danger red; light gray surfaces; dark-navy admin sidebar. Font: Inter (self-hosted). Rounded-lg cards, soft shadows, generous whitespace.
- Base UI kit in `components/ui/`: Button, Input, Select, Textarea, Checkbox, Modal, Drawer, Tabs, Table (sortable+paginated), Badge, Toast, Skeleton, EmptyState, ConfirmDialog, Stat card, ProgressBar, CountdownPill.
- Every data screen implements 4 states: **loading (skeleton) / error (retry) / empty (guidance) / data**. Mobile-first; sidebar collapses to bottom-nav (student) and hamburger (admin).

## 2. Route map
### Public — `PublicLayout` (header: logo, Courses, QBank, Faculty, FAQs, Contact, Login/Register; footer: about, legal links)
| Route | Page | Key content |
|---|---|---|
| `/` | Home | hero + exam-category chips (NRE1/USMLE1/SMLE/DHA/Prometric/MBBS), featured courses, "why SAMS" security/analytics props, faculty strip, FAQ teaser, CTA |
| `/courses` `/courses?cat=` | Catalog | filter chips, course cards (thumb, category, price PKR, validity) |
| `/courses/:slug` | Course detail | overview, curriculum accordion (🔒/▶ preview), faculty, price box + validity + Buy, FAQs |
| `/qbank` | QBank marketing | features grid + **interactive 5-question demo** (sample endpoint) |
| `/faculty` `/faqs` `/contact` | — | contact = validated form → toast |
| `/about` `/privacy` `/terms` `/refund` | Static | rendered from settings |
| `/login` `/register` `/verify-email` `/forgot-password` `/reset-password` | Auth | see §4 |
| `/preview/:lectureId` | Free preview player | SecurePlayer, watermark "PREVIEW" |

### Student — `StudentLayout` (guard: role=student; sidebar: Dashboard, My Courses, QBank, Mock Exams, Analytics, Orders, Notifications, Profile)
| Route | Page |
|---|---|
| `/app` | **Dashboard**: continue-watching card (resume btn), course progress cards (%, remaining lectures, expiry countdown pill — amber <14 d, red <7 d), study-hours mini chart, announcements, QBank quick stats |
| `/app/courses` → `/app/courses/:id` | My courses → Course player page: left = SecurePlayer + lecture title/desc; right = curriculum drawer with ✓/▶/🔖 per lecture; autoplay-next toggle; bookmark button |
| `/app/qbank` | Hub: pool stat cards (all/unused/incorrect/bookmarked) + **Create Test wizard** (category → subjects/systems multi-select with live counts → count slider → mode → timed switch+minutes → pool) + Resume banner if active test |
| `/app/qbank/test/:id` | **TestRunner** (focused layout, no sidebar): top bar timer + progress + finish; question card (stem, image lightbox, options, flag); practice mode reveals ✓/✗ + explanation inline; palette drawer (green/red/gray/🚩); keyboard 1-5/A-E, ←/→; guards: refresh-safe (state on server), tab-hidden pauses local UI only |
| `/app/qbank/test/:id/result` | Score ring, correct/incorrect/skipped bars, time stats, subject/system mini-bars, Review / Retest-incorrect buttons |
| `/app/qbank/test/:id/review` | Question-by-question with explanations & references; filter all/incorrect/flagged |
| `/app/qbank/history` `/app/qbank/bookmarks` | Tables → review / create-test-from-bookmarks |
| `/app/mock-exams` → runner/result via same TestRunner (adds PASS/FAIL banner vs pass mark) |
| `/app/analytics` | Overall donut, avg time/Q, strengths/weaknesses lists, subject & system horizontal bars, daily/weekly/monthly line + Q/day bar (range toggle) |
| `/app/orders` `/app/orders/:id` | history + status; bank-transfer flow: bank details card → proof upload (drag-drop image, ref no) → "awaiting verification" tracker; invoice PDF download |
| `/checkout/:courseSlug` | Summary, coupon field (apply → server quote), gateway radio rendered from server-enabled list (JazzCash / EasyPaisa / Raast / Bank transfer; PayFast & Safepay appear only once enabled), Pay → redirect, or manual-instructions panel (bank details, or Raast ID + IBAN + QR image + copy buttons) with proof/ref upload |
| `/order/:id/status` | Return-from-gateway poller: paid 🎉 → Start learning / failed → retry |
| `/app/notifications` `/app/profile` | mark-read; profile edit, change password, 2FA setup (QR + backup codes modal), **My Devices** list (view-only + "contact admin to reset" note) |

### Admin — `AdminLayout` (guard admin; dark sidebar: Dashboard, Students, Courses, QBank, Mock Exams, Orders, Bank Transfers, Coupons, Announcements, Faculty, FAQs, Messages, Reports, Audit Log, Settings)
| Route | Page essentials |
|---|---|
| `/admin` | KPI stat row (revenue today/7d/30d, pending bank transfers badge, new students, active enrollments), revenue area chart, latest orders table, top courses |
| `/admin/students` → `/:id` | Search/filter table → detail tabs: Overview (status toggle, verify), Enrollments (grant/extend/revoke), Orders, **Devices (list + RESET DEVICES confirm)**, Login history (suspicious highlighted), QBank stats |
| `/admin/courses` → builder | Course form (all fields, thumbnail upload, publish switch) + **Curriculum builder**: sections & lectures drag-to-reorder, inline add/edit, lecture modal (video provider+ref with "Validate" btn showing green check, duration, free-preview) |
| `/admin/qbank/questions` | Filterable table (category/subject/system/difficulty/active, success-rate col) → **Question editor** (rich stem, image upload, options list with single-correct radio, explanation, references) → preview-as-student modal; **Import** page: template download, upload → dry-run error report table → commit |
| `/admin/qbank/taxonomy` | Subjects & systems CRUD (inline, reorder) |
| `/admin/mock-exams` → builder | Meta form + question picker (filter + search, add/remove, drag order, running count/duration) |
| `/admin/orders` | Table (status chips, gateway) → detail (events timeline from payment_events, mark-paid/refund-flag with reason) |
| `/admin/bank-transfers` | Pending queue: proof image viewer, ref no, order info → Approve / Reject(reason) |
| `/admin/coupons` `/admin/announcements` (composer w/ audience + optional email) `/admin/faculty` `/admin/faqs` `/admin/messages` | standard CRUD tables/forms |
| `/admin/reports` | Tabs: Revenue (range, group by day/course, CSV), Enrollments, Question difficulty |
| `/admin/audit` | Filterable log table |
| `/admin/settings` | Tabs: Site & legal pages (rich text), Bank details, Payments keys, Video keys, SMTP — secret inputs write-only masked |

## 3. SecurePlayer (`components/player/SecurePlayer.tsx`)
- Requests `/play` → hls.js attach (or native HLS/iframe per config); resume at `resumeAt`.
- **Watermark layer:** absolutely-positioned div, `pointer-events:none`, opacity .28, renders `name • email • dd-mm-yyyy hh:mm`, jumps to a new random position every 20–30 s; duplicated tiny corner tag; values come from server payload (not client state).
- Heartbeat every 15 s (position+delta) and keep-alive; on `409 STREAM_TAKEN_OVER` → pause + modal "Playing on another device/tab."
- Token refresh before `expiresAt`; on 403 (expired enrollment mid-play) → paywall modal.
- Deterrents: `contextmenu` blocked in player, no download attr, controlsList `nodownload noremoteplayback`, PiP disabled, blur watermark stays during fullscreen.

## 4. Auth flows (client)
- Zustand `authStore` hydrated from `/auth/me`; axios interceptor: on 401 → single-flight `/auth/refresh` → retry once → else logout.
- Login handles branded error screens: not-verified (resend), 2FA code step, **device-limit screen** (explains 2-device policy, admin contact), suspicious-login re-verify code step, locked (countdown).
- Route guards redirect with `?next=`; admin area completely separate chunk (lazy).

## 5. State & data conventions
- TanStack Query for all server state (keys per resource, invalidate on mutation); Zustand only for auth, player, and in-test runner state; test answers optimistically PATCHed with retry queue (offline-tolerant for spotty connections).
- Forms: react-hook-form + zod resolvers (shared schema shapes with server where practical).
- Charts: Recharts wrappers (`<TrendLine/>`, `<CategoryBars/>`, `<Donut/>`) — consistent colors with design system.
- Code-split by layout; build target: initial JS < 250 kB gz; images lazy; Lighthouse ≥ 85 public pages.
- SEO: react-helmet-async titles/descriptions/OG per public page; server injects meta for `/courses/:slug` (simple template swap in index.html render) so shares look right.
