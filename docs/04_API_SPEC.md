# 04 — REST API Specification (`/api/v1`)

Conventions: JSON only. Envelope `{success:true,data}` / `{success:false,error:{code,message,details?}}`. Auth = access-JWT cookie (or `Authorization: Bearer`) + valid device cookie. Roles: **P**=public, **S**=student, **A**=admin. Lists: `?page=1&limit=20&sort=...&q=...` → `data:{items,total,page,limit}`. All inputs zod-validated → `422 VALIDATION_ERROR`. Common errors: `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `423 DEVICE_LIMIT_REACHED`, `429 RATE_LIMITED`.

## 1. Auth & Devices
| Method Path | Role | Notes |
|---|---|---|
| POST `/auth/register` | P | {name,email,phone?,password} → creates pending user, sends verify email |
| POST `/auth/verify-email` | P | {token} → status active |
| POST `/auth/resend-verification` | P | rate-limited 3/h |
| POST `/auth/login` | P | {email,password,twofaCode?} → sets access+refresh+device cookies. Errors: `EMAIL_NOT_VERIFIED`, `TWOFA_REQUIRED`, `ACCOUNT_LOCKED`, `DEVICE_LIMIT_REACHED`, `REVERIFY_REQUIRED` (suspicious → emails code) |
| POST `/auth/reverify` | P | {email, code} → completes suspicious login |
| POST `/auth/refresh` | cookie | rotates refresh token; reuse detection revokes family |
| POST `/auth/logout` | S/A | revoke current refresh token |
| POST `/auth/logout-all` | S/A | revoke all refresh tokens |
| POST `/auth/forgot-password` | P | always 200; emails reset link |
| POST `/auth/reset-password` | P | {token,newPassword} |
| GET `/auth/me` | S/A | profile + role + enrollment summary + unreadNotifications |
| PATCH `/auth/me` | S/A | name, phone |
| POST `/auth/change-password` | S/A | {current,new} → logout-all others + email notice |
| GET `/auth/devices` | S | list registered devices (masked), current flagged |
| POST `/auth/2fa/setup` | S/A | → otpauth URL + QR (secret pending) |
| POST `/auth/2fa/enable` | S/A | {code} → backup codes returned once |
| POST `/auth/2fa/disable` | S/A | {code or backupCode} |

## 2. Public catalog & site
| Method Path | Role | Notes |
|---|---|---|
| GET `/public/home` | P | featured courses, stats, faculty preview |
| GET `/public/courses` | P | published only; filter `?category=` |
| GET `/public/courses/:slug` | P | detail + curriculum outline (lecture titles/durations; locked flags) + faculty |
| GET `/public/faculty` · GET `/public/faqs` | P | active, ordered |
| GET `/public/pages/:key` | P | privacy / terms / refund / about (from settings) |
| POST `/public/contact` | P | rate-limit 5/h/IP; stores + emails admin |
| GET `/public/sample-questions` | P | 5 fixed demo MCQs for QBank marketing page |

## 3. Student — courses & secure video
| Method Path | Role | Notes |
|---|---|---|
| GET `/student/dashboard` | S | aggregates: enrollments+progress %, continue-watching, study hours (7d/total), announcements(5), notifications count, expiring soon |
| GET `/student/courses` | S | my enrollments with progress + expiry |
| GET `/student/courses/:courseId` | S* | full curriculum + per-lecture progress. *enrolled & not expired, else 403 `NOT_ENROLLED`/`ENROLLMENT_EXPIRED` |
| GET `/student/lectures/:id/play` | S* | **core security endpoint**: checks enrollment+device+active status → creates/steals `playback_session` → returns `{playback:{type,url,expiresAt}, watermark:{name,email,now}, resumeAt, sessionKey}` (free-preview lectures: P allowed, watermark "PREVIEW") |
| PUT `/student/lectures/:id/heartbeat` | S | {sessionKey, position, delta} every 15–30 s → progress + keeps stream lock; `409 STREAM_TAKEN_OVER` stops old player |
| POST `/student/lectures/:id/complete` | S | manual mark-complete fallback |
| POST/DELETE `/student/lectures/:id/bookmark` | S | toggle |
| GET `/student/bookmarks/lectures` | S | list |

## 4. Student — QBank, mock exams, analytics
| Method Path | Role | Notes |
|---|---|---|
| GET `/qbank/meta` | S | my accessible exam categories (from enrollments with includes_qbank), subjects, systems, per-filter available counts, pool counts (unused/incorrect/bookmarked) |
| POST `/qbank/tests` | S | {examCategory, subjectIds?, systemIds?, count, mode:'practice'|'exam', timed, timeLimitSeconds?, pool:'all'|'unused'|'incorrect'|'bookmarked'} → creates session + frozen question set → `{testId}`. `409 ACTIVE_TEST_EXISTS` if in-progress (offer resume/abandon) |
| GET `/qbank/tests/:id` | S | session + questions (options WITHOUT is_correct unless practice-answered) + palette state + remaining time (server-computed) |
| PATCH `/qbank/tests/:id/answer` | S | {questionId, optionId|null, timeSpent, flagged?}; practice mode responds with correctness+explanation immediately |
| POST `/qbank/tests/:id/submit` | S | scores, updates history/pools; auto-submit also enforced server-side when time expires |
| POST `/qbank/tests/:id/abandon` | S | mark abandoned (answers still recorded to history) |
| GET `/qbank/tests/:id/review` | S | full review payload (chosen vs correct, explanation, references, time/Q) — only after completion |
| GET `/qbank/tests` | S | history list (mode, date, score, filters) |
| POST/DELETE `/qbank/questions/:id/bookmark` | S | toggle (only questions seen by user) |
| GET `/qbank/questions/bookmarked` | S | flat list of my bookmarked questions, full content (options/explanation/reference always included — bookmarking implies already-seen) |
| GET `/qbank/questions/incorrect` | S | flat list of my past-wrong questions (`user_question_history.last_result='incorrect'`, same definition `pool:'incorrect'` uses), full content |
| GET `/qbank/analytics` | S | totals & %s, avg time/Q, subject-wise + system-wise arrays, strengths/weaknesses, series `?range=daily|weekly|monthly` from user_daily_stats |
| GET `/mock-exams` | S | published, my categories, my best/last attempts |
| POST `/mock-exams/:id/start` | S | creates mock test_session from fixed paper |
| — run/submit/review | S | same `/qbank/tests/:id/...` endpoints (mode='mock'; adds passed flag) |

## 5. Checkout & orders (student)
| Method Path | Role | Notes |
|---|---|---|
| GET `/checkout/gateways` | S | `{code, name, enabled}[]` for every known gateway code (`jazzcash\|easypaisa\|raast\|payfast\|safepay\|bank_transfer\|mock`); `enabled` reuses `adapters/payments/index.js#isGatewayAvailable` — added Phase 9.7, see DECISIONS.md 2026-08-05 |
| POST `/checkout/quote` | S | {courseId, couponCode?} → price, discount, final (server-computed; coupon errors: `COUPON_INVALID/EXPIRED/EXHAUSTED/NOT_APPLICABLE`) |
| POST `/checkout/orders` | S | {courseId, couponCode?, gateway: jazzcash\|easypaisa\|raast\|payfast\|safepay\|bank_transfer} → order `pending` + `createCheckout()` result: `{redirectUrl}` (mock), `{actionUrl, method:'POST', formFields}` (jazzcash/easypaisa hosted-checkout form-POST), or `{manualDetails, orderId}` (bank_transfer: account details / raast: Raast ID + IBAN + QR image URL). `409 ALREADY_ENROLLED`; `422 GATEWAY_NOT_CONFIGURED` for disabled/placeholder gateways |
| POST `/checkout/orders/:id/bank-proof` | S | multipart image + referenceNo → status `awaiting_verification` |
| GET `/orders` · GET `/orders/:id` | S | my orders / detail+status polling |
| GET `/orders/:id/invoice.pdf` | S | streamed PDF (owner or admin only) |
| POST `/webhooks/payments/:gateway` | P | signature-verified IPN → idempotent success path (order paid → enrollment → invoice → notify). Always 200 to gateway; log `payment_events` |
| GET `/checkout/return/:gateway` | P | browser return URL → verifies → redirect to `/order/:id/status` |

## 6. Notifications & announcements (student)
| Method Path | Role | Notes |
|---|---|---|
| GET `/notifications` | S | paginated; `?unread=1` |
| POST `/notifications/read` | S | {ids[] | all:true} |
| GET `/announcements` | S | global + my-course announcements |

## 7. Admin API (all **A**; all mutations audit-logged)
**Dashboard/Reports** — GET `/admin/dashboard` (KPIs); GET `/admin/reports/revenue?from&to&groupBy=day|course` (+`&format=csv`); GET `/admin/reports/enrollments`; GET `/admin/reports/question-difficulty`.
**Students** — GET `/admin/students` (search/filter status); GET `/admin/students/:id` (profile, devices, logins, enrollments, orders, stats); PATCH `/admin/students/:id` (status, name, verify); **POST `/admin/students/:id/reset-devices`** (deactivate all devices + revoke refresh tokens); POST `/admin/students/:id/enrollments` (manual grant {courseId, days}); PATCH `/admin/enrollments/:id` (extend/revoke).
**Content** — full CRUD: `/admin/courses` (+`/publish`), `/admin/courses/:id/sections`, `/admin/sections/:id/lectures`; PATCH `.../reorder` {orderedIds[]}; POST `/admin/lectures/:id/validate-video` (adapter validateRef); POST `/admin/uploads/image` (multer → url, used for thumbnails/question images).
**QBank** — CRUD `/admin/subjects`, `/admin/systems`, `/admin/questions` (nested options; edit creates new option rows safely); POST `/admin/questions/import` (CSV/XLSX multipart → dry-run report `?commit=1` to apply; template downloadable GET `/admin/questions/import-template`); POST `/admin/questions/:id/toggle-active`.
**Mock exams** — CRUD `/admin/mock-exams`; PUT `/admin/mock-exams/:id/questions` {questionIds ordered}; `/publish`.
**Commerce** — GET `/admin/orders` (filter status/gateway/date); GET `/admin/orders/:id`; POST `/admin/orders/:id/mark-paid` (manual, reason required); POST `/admin/orders/:id/refund-flag`; GET `/admin/bank-transfers?status=pending` (manual-payment queue — bank transfer **and** Raast proofs, gateway shown per row); POST `/admin/bank-transfers/:id/approve|reject` ({reason} on reject) → triggers same activation path; CRUD `/admin/coupons`.
**Comms/Site** — CRUD `/admin/announcements` (audience all|course, optional email blast); CRUD `/admin/faculty`, `/admin/faqs`; GET/PATCH `/admin/contact-messages`; GET/PUT `/admin/settings` (site info, legal pages, bank details, gateway+video+SMTP keys — returned masked, write-only fields); GET `/admin/audit-logs` (filter actor/entity/date).

## 8. Cross-cutting behaviors
- **Rate limits:** global 300/15 min/IP; `/auth/*` 10/15 min; contact 5/h; play endpoint 30/min/user.
- **Idempotency:** payment success path keyed on (gateway, external_ref) — replayed IPNs are no-ops.
- **Timing safety:** all timers (test time-left, token expiry, enrollment expiry) computed server-side; client values are display-only.
- **Answer secrecy:** `is_correct` never serialized in exam/mock mode before submit; verified by test in 08_TESTING_QA.
