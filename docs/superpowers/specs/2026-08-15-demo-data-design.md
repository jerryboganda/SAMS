# Design Spec: 1-Time Demo Data Population in Abundance

**Date:** 2026-08-15  
**Topic:** One-time production-ready demo data population in abundance with permanent admin deletion support  
**Status:** Approved

---

## 1. Context & Objectives

### Problem
On a fresh production setup or after running baseline migrations, the SAMS Academy database is empty. The previous seeders only created minimal demo data (1 course, 200 generic NRE1 questions, 1 exam, 1 student) and were skipped entirely under `SEED_MODE=prod`. This makes it impossible to comprehensively test the platform in production across all modules (Courses, QBank, Mock Exams, Student Dashboards, Analytics, Checkout, Faculty, FAQs, and Admin Management).

### Objectives
1. **Abundant Demo Data**: Populate comprehensive, realistic medical exam-prep data spanning multiple exam categories (`NRE1`, `NRE2`, `FCPS1`, `FCPS2`), subjects, body systems, full courses with video lectures, 500+ questions, 5 mock exams, demo students with historical test attempts and analytics, faculty, coupons, FAQs, and announcements.
2. **Guaranteed 1-Time Execution**: The demo data must be populated exactly **once** during database migration (`npm run migrate`) and **never** re-run or overwrite changes on subsequent application builds (`npm run build`), redeploys, or server restarts (`npm start`).
3. **Permanent Admin Panel Deletion**: Seeded records must be standard, valid database rows that the administrator can edit or permanently delete through the Admin Panel. Once deleted by an admin, records must remain permanently deleted and never be regenerated.

---

## 2. Architecture & 1-Time Execution Mechanism

### 2.1 Migration-Based 1-Time Execution
- **File**: `server/src/db/migrations/20260101000037-seed-abundance-demo-data.cjs`
- **Execution Lifecycle**:
  1. During deployment on Hostinger or local environment, `npx sequelize-cli db:migrate` runs all pending migrations.
  2. Sequelize executes `20260101000037-seed-abundance-demo-data.cjs` and writes an entry into the `SequelizeMeta` table in MySQL/MariaDB.
  3. On future deploys, restarts, or builds, Sequelize inspects `SequelizeMeta`, finds that `20260101000037` has already executed, and skips it completely.
  4. The migration is idempotent and defensive: before inserting taxonomy or base records, it checks whether entries already exist.

### 2.2 Synchronized Development Seeders
- In addition to the migration, `server/src/db/seeders/` is updated with the same abundant dataset. The `if (process.env.SEED_MODE === 'prod') return;` barrier is removed so that local dev seed commands (`npm run seed`) produce the exact same rich dataset.

---

## 3. Data Entities & Content Specification

### 3.1 Courses & Curriculum (4 Comprehensive Courses)
1. **NRE Step 1 Comprehensive Mastery Course** (`NRE1`):
   - Price: 15,000 PKR | Validity: 180 days | Includes QBank: Yes | Published: Yes
   - 3 Sections: *Basic Sciences Foundations*, *Systemic Pathology & Pathophysiology*, *High-Yield Pharmacology & Clinical Integration*
   - 9 Lectures with realistic durations (8-35 mins), descriptions, video provider references, and free previews on introductory lectures.
2. **NRE Step 2 Clinical Skills & OSCE Masterclass** (`NRE2`):
   - Price: 18,000 PKR | Validity: 180 days | Includes QBank: Yes | Published: Yes
   - 3 Sections: *Internal Medicine & Differential Diagnosis*, *Surgical Principles & Trauma Management*, *Pediatrics, OB/GYN & OSCE Case Stations*
   - 8 Lectures with clinical vignette scenarios and OSCE checklists.
3. **FCPS Part 1 Basic Medical Sciences Immersion** (`FCPS1`):
   - Price: 20,000 PKR | Validity: 365 days | Includes QBank: Yes | Published: Yes
   - 3 Sections: *General & Systemic Pathology*, *High-Yield Pharmacology & Toxicology*, *Clinical Anatomy, Embryology & Neuroanatomy*
   - 9 In-depth basic sciences lectures.
4. **FCPS Part 2 Clinical Medicine & Case Scenarios** (`FCPS2`):
   - Price: 22,000 PKR | Validity: 365 days | Includes QBank: Yes | Published: Yes
   - 2 Sections: *Inpatient Medicine & Critical Care Protocols*, *Diagnostic Workup & Therapeutic Algorithms*
   - 6 Advanced clinical lectures.

### 3.2 Question Bank (500+ Realistic Medical MCQs)
- Spans all 4 categories: `NRE1`, `NRE2`, `FCPS1`, `FCPS2`.
- Covers all 9 subjects: *Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Immunology, Behavioral Science, Biostatistics*.
- Covers all 10 body systems: *Cardiovascular, Respiratory, GIT, Renal, Endocrine, Reproductive, MSK, Neuro, Heme/Onc, General Principles*.
- Covers all 3 difficulty tiers: `easy`, `medium`, `hard`.
- High-yield clinical stems, 4 plausible options with 1 verified correct answer, detailed pedagogical explanations, and academic references.

### 3.3 Mock Exams (5 Full-Length Exams)
1. **NRE Step 1 Grand Mock Examination**: 100 questions, 120 minutes, 60% passing score.
2. **NRE Step 2 Clinical Knowledge Simulation**: 75 questions, 90 minutes, 65% passing score.
3. **FCPS Part 1 Basic Sciences Paper 1 Mock**: 50 questions, 60 minutes, 70% passing score.
4. **FCPS Part 1 Basic Sciences Paper 2 Mock**: 50 questions, 60 minutes, 70% passing score.
5. **High-Yield Pharmacology & Pathology Challenge**: 50 questions, 60 minutes, 60% passing score.

### 3.4 Demo Students & User Activity
- **Accounts**:
  - `student@samsacademy.com` (`Student@123`)
  - `dr.sarah@samsacademy.com` (`Doctor@123`)
  - `dr.ali@samsacademy.com` (`Doctor@123`)
  - `dr.fatima@samsacademy.com` (`Doctor@123`)
- **Activity & Dashboard Telemetry**:
  - Active course enrollments.
  - 5+ historical test sessions across practice and mock modes with variable performance (60% to 85% scores).
  - Recorded question attempts (`correct`, `incorrect`, `skipped`, `flagged`, `time_spent_seconds`).
  - Pre-aggregated `user_daily_stats` and `user_question_history` so analytics charts, mastery heatmaps, and progress gauges render rich data immediately.

### 3.5 Faculty Profiles (6 Doctors)
- Dr. Ayesha Raza (MBBS, FCPS - Internal Medicine)
- Dr. Bilal Ahmed (MBBS, MRCP UK - Cardiology & Pulmonology)
- Dr. Sana Khalid (MBBS, MPhil - Pharmacology & Therapeutics)
- Dr. Hamza Tariq (MBBS, FCPS - General Surgery & Trauma)
- Dr. Maryam Noor (MBBS, MCPS, FCPS - Obstetrics & Gynecology)
- Dr. Usman Farooq (MBBS, MD - Pathology & Microbiology)

### 3.6 Coupons & Promotional Discounts (6 Codes)
- `WELCOME10`: 10% off sitewide (Unlimited)
- `EID50`: 50% off sitewide (Max 100 uses)
- `DOCTOR25`: 25% off sitewide
- `FCPS2026`: 3,000 PKR flat discount
- `RAMADAN20`: 20% off sitewide
- `STUDENT15`: 15% off sitewide

### 3.7 FAQs (15 Comprehensive Entries)
- Categorized across: Courses & Curriculum, QBank Practice, Mock Exams, Payments (JazzCash, EasyPaisa, Raast, Bank Transfer), Multi-Device Policies, and Validity Extensions.

### 3.8 Announcements (3 Notifications)
- Sitewide alerts: 2026 Medical Licensing Exam Schedule, New High-Yield Pharmacology Video Modules, Platform Maintenance Notice.

---

## 4. Admin Panel Permanent Deletion Verification

1. **Courses**: Courses without student orders/enrollments can be deleted directly with 1-click in the Admin Panel. Courses with enrollments can have enrollments revoked/managed first.
2. **Questions**: Questions with 0 recorded test attempts are hard-deleted along with their options (via `ON DELETE CASCADE`). Questions with attempts are soft-deleted (`isActive = false`) to preserve student historical scores.
3. **Mock Exams**: Mock exams with 0 attempts are hard-deleted along with their question links (`ON DELETE CASCADE`).
4. **Faculty, FAQs, Coupons, Announcements**: Can be edited and permanently deleted immediately with 1-click in the Admin Panel.

---

## 5. Verification Plan

1. **Migration Execution**: Run `npm run migrate` on a fresh/test database and assert all tables populate with abundant data.
2. **Idempotence Check**: Run `npm run migrate` a second time and assert zero duplicate errors and zero changes.
3. **Data Integrity Audit**: Query database counts to verify:
   - >= 4 courses with sections and lectures
   - >= 500 questions with 4 options and 1 correct answer each
   - >= 5 mock exams with mapped questions
   - >= 4 student accounts with active enrollments, test sessions, and analytics
   - 6 faculty members, 6 coupons, 15 FAQs, 3 announcements
4. **Admin Deletion Test**: Delete a demo question, a demo course, a demo mock exam, and a demo coupon via admin service/API calls, then re-run migrations / server restarts to confirm the deleted items remain permanently deleted.
5. **Project Verification**: Run `npm run verify` (`lint` + `test` + `build`) to guarantee no regressions.
