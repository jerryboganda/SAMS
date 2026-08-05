# 03 — Database Schema (MySQL 8)

Rules: InnoDB, `utf8mb4` / `utf8mb4_unicode_ci`, all FKs indexed, `created_at`/`updated_at DATETIME` (UTC, Sequelize-managed) on every table unless noted. Implement as **Sequelize migrations** in exactly this order. IDs are `BIGINT UNSIGNED AUTO_INCREMENT`.

```sql
-- ============ 1. USERS & AUTH ============
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','admin') NOT NULL DEFAULT 'student',
  status ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME NULL,
  twofa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  twofa_secret VARCHAR(64) NULL,
  twofa_backup_codes JSON NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_users_role_status (role, status)
);

CREATE TABLE user_devices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  device_token_hash CHAR(64) NOT NULL,        -- sha256 of httpOnly device cookie
  fingerprint_hash CHAR(64) NOT NULL,         -- sha256(UA + platform hints)
  device_name VARCHAR(120) NULL,              -- "Chrome on Windows"
  last_ip VARCHAR(45) NULL, last_seen_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,    -- admin reset → 0
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_device_token (device_token_hash),
  INDEX idx_devices_user_active (user_id, is_active),
  CONSTRAINT fk_dev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL, revoked_at DATETIME NULL,
  replaced_by CHAR(64) NULL,                  -- rotation chain / reuse detection
  ip VARCHAR(45) NULL, user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_rt_user (user_id, expires_at),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rt_device FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL
);

CREATE TABLE login_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL, email_tried VARCHAR(190) NULL,
  status ENUM('success','failed','blocked','suspicious') NOT NULL,
  reason VARCHAR(120) NULL,                   -- bad_password | device_limit | new_country ...
  ip VARCHAR(45) NULL, country CHAR(2) NULL, user_agent VARCHAR(255) NULL,
  fingerprint_hash CHAR(64) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_le_user_time (user_id, created_at), INDEX idx_le_status (status, created_at)
);

CREATE TABLE one_time_tokens (                 -- email verify / password reset / login re-verify
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('verify_email','reset_password','reverify_login') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL, used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_ott_user_purpose (user_id, purpose),
  CONSTRAINT fk_ott_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============ 2. CATALOG & CONTENT ============
CREATE TABLE courses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL, slug VARCHAR(190) NOT NULL UNIQUE,
  exam_category ENUM('NRE1','USMLE1','USMLE2CK','SMLE','DHA','PROMETRIC','MBBS','OTHER') NOT NULL,
  short_description VARCHAR(300) NULL, description MEDIUMTEXT NULL,
  thumbnail_url VARCHAR(300) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'PKR',
  validity_days INT UNSIGNED NOT NULL DEFAULT 180,
  includes_qbank TINYINT(1) NOT NULL DEFAULT 1,
  is_published TINYINT(1) NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_courses_pub (is_published, exam_category, sort_order)
);

CREATE TABLE course_sections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL, sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_sections_course (course_id, sort_order),
  CONSTRAINT fk_sec_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE lectures (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL, section_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL, description TEXT NULL,
  video_provider ENUM('bunny','mock') NOT NULL DEFAULT 'bunny',
  video_ref VARCHAR(120) NULL,                -- provider GUID
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  is_free_preview TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_lectures_sec (section_id, sort_order), INDEX idx_lectures_course (course_id),
  CONSTRAINT fk_lec_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_lec_section FOREIGN KEY (section_id) REFERENCES course_sections(id) ON DELETE CASCADE
);

CREATE TABLE lecture_progress (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, lecture_id BIGINT UNSIGNED NOT NULL,
  watched_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  last_position_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  is_completed TINYINT(1) NOT NULL DEFAULT 0, completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL, created_at DATETIME NOT NULL,
  UNIQUE KEY uq_lp (user_id, lecture_id), INDEX idx_lp_user_updated (user_id, updated_at),
  CONSTRAINT fk_lp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_lp_lecture FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
);

CREATE TABLE lecture_bookmarks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, lecture_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_lb (user_id, lecture_id),
  CONSTRAINT fk_lb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_lb_lecture FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
);

CREATE TABLE playback_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, lecture_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  session_key CHAR(36) NOT NULL UNIQUE,
  last_heartbeat_at DATETIME NOT NULL, ended_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_ps_user_active (user_id, ended_at),
  CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============ 3. ENROLLMENT & COMMERCE ============
CREATE TABLE coupons (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  type ENUM('percent','fixed') NOT NULL, value DECIMAL(10,2) NOT NULL,
  course_id BIGINT UNSIGNED NULL,             -- NULL = all courses
  max_uses INT UNSIGNED NULL, used_count INT UNSIGNED NOT NULL DEFAULT 0,
  valid_from DATETIME NULL, valid_until DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  CONSTRAINT fk_coupon_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
);

CREATE TABLE orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(30) NOT NULL UNIQUE,     -- SAMS-2026-00001
  user_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL, discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  final_amount DECIMAL(10,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'PKR',
  coupon_id BIGINT UNSIGNED NULL,
  gateway ENUM('jazzcash','easypaisa','raast','payfast','safepay','bank_transfer','manual','mock') NOT NULL,
  gateway_ref VARCHAR(120) NULL,
  status ENUM('pending','awaiting_verification','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_orders_user (user_id, created_at), INDEX idx_orders_status (status, created_at),
  INDEX idx_orders_gwref (gateway, gateway_ref),
  CONSTRAINT fk_o_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_o_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_o_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
);

CREATE TABLE payment_events (                  -- raw gateway callbacks (idempotency + audit)
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NULL, gateway VARCHAR(30) NOT NULL,
  event_type VARCHAR(60) NOT NULL, external_ref VARCHAR(120) NULL,
  payload JSON NOT NULL, signature_valid TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  INDEX idx_pe_order (order_id), INDEX idx_pe_ext (gateway, external_ref),
  CONSTRAINT fk_pe_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE TABLE bank_transfer_proofs (            -- manual-payment proofs: serves BOTH 'bank_transfer' AND 'raast' orders (gateway read from orders)
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  file_path VARCHAR(300) NOT NULL, reference_no VARCHAR(120) NULL, note VARCHAR(300) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT UNSIGNED NULL, reviewed_at DATETIME NULL, reject_reason VARCHAR(300) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  CONSTRAINT fk_btp_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_btp_admin FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE enrollments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  source ENUM('purchase','manual') NOT NULL DEFAULT 'purchase',
  starts_at DATETIME NOT NULL, expires_at DATETIME NOT NULL,
  status ENUM('active','expired','revoked') NOT NULL DEFAULT 'active',
  active_slot TINYINT GENERATED ALWAYS AS (IF(status = 'active', 1, NULL)) VIRTUAL NULL, -- MySQL has no partial/filtered unique index; this generated column (non-NULL only when status='active') is the standard workaround so uq_enr_active can enforce "at most one ACTIVE row per (user,course)" while allowing unlimited historical expired/revoked rows for the same pair (NULLs are never considered equal in a unique index) -- see migration 20260101000035 + DECISIONS.md 2026-08-05
  expiry_reminder_sent_at DATETIME NULL,                  -- set once the 7-day-expiring reminder has been sent for this enrollment, so the daily cron sweep never double-sends it
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_enr_active (user_id, course_id, active_slot),   -- at most one ACTIVE row per (user, course); unlimited expired/revoked history rows allowed
  INDEX idx_enr_expiry (status, expires_at),
  CONSTRAINT fk_e_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_e_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_e_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- ============ 4. QBANK ============
CREATE TABLE subjects (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE, sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);
CREATE TABLE body_systems (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE, sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);

CREATE TABLE questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_category ENUM('NRE1','USMLE1','USMLE2CK','SMLE','DHA','PROMETRIC','MBBS','OTHER') NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL, system_id BIGINT UNSIGNED NOT NULL,
  stem MEDIUMTEXT NOT NULL, image_url VARCHAR(300) NULL,
  explanation MEDIUMTEXT NOT NULL, reference_text TEXT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'medium',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  times_attempted INT UNSIGNED NOT NULL DEFAULT 0,   -- denormalized, cron-refreshed
  times_correct INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_q_filter (exam_category, subject_id, system_id, is_active),
  CONSTRAINT fk_q_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_q_system FOREIGN KEY (system_id) REFERENCES body_systems(id)
);

CREATE TABLE question_options (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT UNSIGNED NOT NULL,
  option_text TEXT NOT NULL, is_correct TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_qo_q (question_id, sort_order),
  CONSTRAINT fk_qo_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE mock_exams (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  exam_category ENUM('NRE1','USMLE1','USMLE2CK','SMLE','DHA','PROMETRIC','MBBS','OTHER') NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL, pass_percent DECIMAL(5,2) NOT NULL DEFAULT 60,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);
CREATE TABLE mock_exam_questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mock_exam_id BIGINT UNSIGNED NOT NULL, question_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_meq (mock_exam_id, question_id),
  CONSTRAINT fk_meq_me FOREIGN KEY (mock_exam_id) REFERENCES mock_exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_meq_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE test_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  mode ENUM('practice','exam','mock') NOT NULL,
  mock_exam_id BIGINT UNSIGNED NULL,
  exam_category VARCHAR(20) NOT NULL, filters JSON NULL,
  question_count INT UNSIGNED NOT NULL,
  time_limit_seconds INT UNSIGNED NULL,        -- NULL = untimed
  status ENUM('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress',
  started_at DATETIME NOT NULL, completed_at DATETIME NULL,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  incorrect_count INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_count INT UNSIGNED NOT NULL DEFAULT 0,
  score_percent DECIMAL(5,2) NULL, passed TINYINT(1) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_ts_user (user_id, status, started_at),
  CONSTRAINT fk_ts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ts_mock FOREIGN KEY (mock_exam_id) REFERENCES mock_exams(id) ON DELETE SET NULL
);

CREATE TABLE test_attempt_questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_session_id BIGINT UNSIGNED NOT NULL, question_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL,
  selected_option_id BIGINT UNSIGNED NULL,
  is_correct TINYINT(1) NULL,                  -- NULL = skipped/unanswered
  is_flagged TINYINT(1) NOT NULL DEFAULT 0,
  time_spent_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  answered_at DATETIME NULL,
  UNIQUE KEY uq_taq (test_session_id, question_id),
  INDEX idx_taq_session (test_session_id, sort_order), INDEX idx_taq_q (question_id),
  CONSTRAINT fk_taq_ts FOREIGN KEY (test_session_id) REFERENCES test_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_taq_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE question_bookmarks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, question_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_qb (user_id, question_id),
  CONSTRAINT fk_qb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_qb_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE user_question_history (           -- pools: unused / incorrect / correct
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, question_id BIGINT UNSIGNED NOT NULL,
  times_seen INT UNSIGNED NOT NULL DEFAULT 0, times_correct INT UNSIGNED NOT NULL DEFAULT 0,
  last_result ENUM('correct','incorrect','skipped') NULL, last_seen_at DATETIME NULL,
  UNIQUE KEY uq_uqh (user_id, question_id), INDEX idx_uqh_user_result (user_id, last_result),
  CONSTRAINT fk_uqh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uqh_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE user_daily_stats (                -- cron-filled; powers graphs cheaply
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, stat_date DATE NOT NULL,
  questions_attempted INT UNSIGNED NOT NULL DEFAULT 0,
  questions_correct INT UNSIGNED NOT NULL DEFAULT 0,
  qbank_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  video_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_uds (user_id, stat_date),
  CONSTRAINT fk_uds_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============ 5. COMMS, SITE & ADMIN ============
CREATE TABLE announcements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL, body TEXT NOT NULL,
  audience ENUM('all','course') NOT NULL DEFAULT 'all', course_id BIGINT UNSIGNED NULL,
  send_email TINYINT(1) NOT NULL DEFAULT 0, created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_ann_time (created_at),
  CONSTRAINT fk_ann_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_ann_admin FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,                   -- purchase_paid | expiry_soon | new_device ...
  title VARCHAR(200) NOT NULL, body TEXT NULL, link VARCHAR(300) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL,
  INDEX idx_notif_user (user_id, is_read, created_at),
  CONSTRAINT fk_n_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE faculty (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL, title VARCHAR(200) NULL, bio TEXT NULL,
  photo_url VARCHAR(300) NULL, sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);

CREATE TABLE faqs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(300) NOT NULL, answer TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);

CREATE TABLE contact_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL, email VARCHAR(190) NOT NULL,
  subject VARCHAR(200) NULL, message TEXT NOT NULL,
  status ENUM('new','read','replied') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,                 -- course.update | user.reset_devices ...
  entity_type VARCHAR(60) NOT NULL, entity_id BIGINT UNSIGNED NULL,
  summary VARCHAR(400) NULL, meta JSON NULL, ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_audit_actor (actor_user_id, created_at), INDEX idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_al_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE settings (
  `key` VARCHAR(80) PRIMARY KEY, value JSON NOT NULL, updated_at DATETIME NOT NULL
);
```

## Seed data (`npm run seed`)

1. Admin `admin@samsacademy.com / Admin@12345` (force change note), demo student `student@samsacademy.com / Student@123` (verified).
2. Subjects (Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Immunology, Behavioral Science, Biostatistics) and systems (Cardiovascular, Respiratory, GIT, Renal, Endocrine, Reproductive, MSK, Neuro, Heme/Onc, General Principles).
3. 1 published course "NRE Step 1 Complete Course" (2 sections × 3 lectures, mock video refs, 1 free preview), price 15,000 PKR, 180 d.
4. 200 sample questions (generated, valid structure, spread across subjects/systems/difficulties) + 1 mock exam (50 Q / 60 min / pass 60 %).
5. 1 coupon `WELCOME10` (10 %), 3 faculty, 6 FAQs, legal pages seeded into settings, demo enrollment + a few completed test sessions for the demo student (so analytics screens render non-empty).

## Integrity & operational rules

- All money math server-side, `DECIMAL` only. Coupon `used_count` incremented inside the payment-success transaction with row lock.
- `orders.invoice_no` generated inside a transaction from `settings['invoice_seq']` (locked read-modify-write).
- Enrollment expiry cron: daily, mark `expired`; expiring-in-7-days notifier.
- Deleting a question is soft (`is_active=0`) if it has attempts; `test_attempt_questions` keeps history intact either way.
- Nightly `mysqldump` to `/storage/backups`, keep 4 (cron).
