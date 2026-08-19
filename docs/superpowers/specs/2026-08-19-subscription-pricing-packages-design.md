# Subscription & Pricing Packages Management — Design Specification

**Date:** 2026-08-19  
**Status:** Approved  
**Author:** Antigravity / SAMS Academy Engineering  

---

## 1. Overview & Objectives

SAMS Academy requires a dedicated, full-featured **Subscription & Pricing Packages** module. Administrators must have complete CRUD capabilities to configure single-course pricing plans and multi-course subscription tiers with customizable validity periods, promotional strikethrough pricing, marketing badges, feature checklists, and course bundle inclusions. The module must be accessible directly from the admin panel's left navigation menu and integrated seamlessly across student management and checkout flows.

---

## 2. Architecture & Data Contracts

### 2.1 Database Schema (`subscription_packages`)

A new migration `20260101000038-create-subscription-packages.cjs` and Sequelize model `SubscriptionPackage`:

```sql
CREATE TABLE `subscription_packages` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(190) NOT NULL,
  `slug` VARCHAR(190) NOT NULL UNIQUE,
  `description` TEXT NULL,
  `exam_category` VARCHAR(50) NOT NULL DEFAULT 'NRE1',
  `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `original_price` DECIMAL(10, 2) NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'PKR',
  `validity_days` INT NOT NULL DEFAULT 180,
  `included_course_ids` JSON NOT NULL,
  `includes_qbank` BOOLEAN NOT NULL DEFAULT true,
  `includes_mock_exams` BOOLEAN NOT NULL DEFAULT true,
  `max_devices` INT NOT NULL DEFAULT 2,
  `features` JSON NOT NULL,
  `badge` VARCHAR(50) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `is_popular` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 Backend Endpoints & Route Handlers

* **`GET /api/v1/admin/packages`**
  - Returns list of all subscription packages (active and inactive) sorted by `sort_order` and `id DESC`.
  - Includes populated course titles and active subscriber statistics.
* **`POST /api/v1/admin/packages`**
  - Request body validated with Zod: `title`, `slug`, `description`, `examCategory`, `price`, `originalPrice`, `validityDays`, `includedCourseIds`, `includesQbank`, `includesMockExams`, `maxDevices`, `features`, `badge`, `isActive`, `isPopular`.
  - Generates audit log `package.create`.
  - Returns `201 CREATED` with serialized package.
* **`GET /api/v1/admin/packages/:id`**
  - Returns single package by ID.
* **`PUT /api/v1/admin/packages/:id`**
  - Validates and updates package fields.
  - Generates audit log `package.update`.
  - Returns `200 OK` with updated package.
* **`POST /api/v1/admin/packages/:id/toggle`**
  - Flips `is_active` boolean and logs `package.toggle`.
* **`DELETE /api/v1/admin/packages/:id`**
  - Deletes package if no active enrollments exist, or archives if historical references exist.
  - Generates audit log `package.delete`.
* **`GET /api/v1/packages`** (Public)
  - Returns all active and published packages for student-facing pricing pages.

---

## 3. Frontend UI/UX Specifications

### 3.1 Left Navigation Menu
- Added in `client/src/components/layout/AdminLayout.tsx` under `adminNavItems`:
  ```ts
  { label: "Subscriptions & Pricing", path: "/admin/subscriptions", icon: Zap }
  ```
- Route registered in `client/src/App.tsx`:
  ```tsx
  <Route path="subscriptions" element={<SubscriptionsManagementPage />} />
  ```

### 3.2 Subscriptions Management Page (`SubscriptionsManagementPage.tsx`)
- **Header**: Title, Subtitle, and **`+ Create New Package`** action button.
- **KPI Metrics Summary**:
  - Total Active Packages
  - Top Selling Tier
  - Average Package Value (PKR)
  - Total Subscribed Students
- **Toolbar & Filtering**:
  - Real-time search by package title or category.
  - Category filter pills (All, NRE1, NRE2, USMLE, SMLE, All-Access Bundles).
  - Status filter (All, Active, Draft).
  - View toggle: **Visual Tier Cards** vs **Data Table**.
- **Visual Tier Cards**:
  - Highlights badges (*"Most Popular"*, *"Best Value"*).
  - Price, strikethrough retail price, and savings badge (*"Save 25%"*).
  - Validity duration pill (*"180 Days Access"*).
  - Included courses list.
  - Features checkmark list.
  - In-place Active/Draft toggle switch, Edit button, Delete button.

### 3.3 Package Modal Dialog (`PackageModal.tsx`)
- **Dialog Size**: `xl`
- **Tabs/Sections**:
  1. **Plan Details**: Title, Slug, Exam Category, Description.
  2. **Pricing & Duration**: Price, Original Price, Validity Presets (30, 60, 90, 180, 365, 730 days) + Custom input.
  3. **Course & Feature Inclusions**: Multi-select course checklist, QBank/Mock exam toggles, device limit.
  4. **Features & Badges**: Interactive feature bullet points manager (Add/Edit/Remove items), highlight badge selector.
  5. **Status**: Active vs Draft toggle.

### 3.4 Integration with Manual Student Creation
- In `client/src/components/admin/AddStudentModal.tsx`, admins can pick an existing Subscription Package from a dropdown to automatically populate all bundled courses, default validity duration, and settings in one click.

---

## 4. Parity & Verification Plan

1. **Database & Backend Tests**:
   - New test suite in `server/tests/admin/packages.test.js` validating package creation, slug collision, updates, toggles, and deletion.
2. **Client Automated Tests**:
   - New test suite in `client/src/pages/admin/subscriptionsManagement.test.ts`.
3. **Build & Lint Verification**:
   - `npm run lint` with 0 errors.
   - `npm run build` with 0 TypeScript/bundling errors.
   - `npm run package` creating valid `deploy.zip`.
