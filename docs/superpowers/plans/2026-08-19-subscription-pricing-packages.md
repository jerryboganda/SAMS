# Subscription & Pricing Packages Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a comprehensive, professional **Subscription & Pricing Packages** module in SAMS Academy with dedicated database modeling, admin CRUD dashboard, left navigation integration, multi-course bundling, dynamic feature checklists, promotional pricing, and seamless integration with student creation and checkout.

**Architecture:** Implement `SubscriptionPackage` Sequelize model and migration. Build RESTful endpoints under `/api/v1/admin/packages` and `/api/v1/packages`. Add `SubscriptionsManagementPage.tsx` with dual visual-card and table views, `PackageModal.tsx`, integrate into `AdminLayout.tsx` navigation and `AddStudentModal.tsx`, and maintain full mock/live API parity.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, Vite, Express, Sequelize ORM, MySQL, Zod, Vitest, Jest.

## Global Constraints
- Node.js 20 LTS, Express 4.x + Sequelize ORM (`mysql2` driver).
- Clean validation on all route inputs using Zod.
- Audit log every admin package mutation (`audit('package.create')`, `audit('package.update')`, `audit('package.toggle')`, `audit('package.delete')`).
- Consistent API envelope `{ success: true, data: ... }` / `{ success: false, error: ... }`.
- Parity between `CONFIG.USE_MOCK = true` and `CONFIG.USE_MOCK = false`.

---

### Task 1: Database Migration & Sequelize Model for Subscription Packages

**Files:**
- Create: `server/src/db/migrations/20260101000038-create-subscription-packages.cjs`
- Create: `server/src/models/SubscriptionPackage.js`
- Modify: `server/src/models/index.js`
- Create / Modify: `server/src/db/seeders/20260101010010-seed-11-subscription-packages.cjs`

**Interfaces:**
- Produces: `db.SubscriptionPackage` with fields: `id`, `title`, `slug`, `description`, `examCategory`, `price`, `originalPrice`, `currency`, `validityDays`, `includedCourseIds`, `includesQbank`, `includesMockExams`, `maxDevices`, `features`, `badge`, `sortOrder`, `isActive`, `isPopular`, `createdAt`, `updatedAt`.

- [ ] **Step 1: Create migration `20260101000038-create-subscription-packages.cjs`**
- [ ] **Step 2: Create Sequelize model `server/src/models/SubscriptionPackage.js`**
- [ ] **Step 3: Register model in `server/src/models/index.js`**
- [ ] **Step 4: Add seed data for standard subscription packages (NRE 1 Masterclass, USMLE Step 1 Immersion, Full All-Access Pass)**

---

### Task 2: Backend Admin Package Service, Controller, and Routes

**Files:**
- Create: `server/src/services/adminPackageService.js`
- Create: `server/src/controllers/adminPackageController.js`
- Create: `server/src/routes/v1/admin/packages.js`
- Modify: `server/src/routes/v1/admin/index.js`
- Create: `server/src/routes/v1/packages.js`
- Modify: `server/src/routes/v1/index.js`

**Interfaces:**
- Produces:
  - `adminPackageService.listAllPackages()`
  - `adminPackageService.getPackageById(id)`
  - `adminPackageService.createPackage(data, adminUserId)`
  - `adminPackageService.updatePackage(id, data, adminUserId)`
  - `adminPackageService.togglePackageActive(id, adminUserId)`
  - `adminPackageService.deletePackage(id, adminUserId)`
  - `publicPackageService.listPublishedPackages()`

- [ ] **Step 1: Implement `adminPackageService.js` with course titles population and validation**
- [ ] **Step 2: Implement `adminPackageController.js` with Zod validation schemas**
- [ ] **Step 3: Mount admin routes in `server/src/routes/v1/admin/packages.js` and `server/src/routes/v1/admin/index.js`**
- [ ] **Step 4: Mount public routes in `server/src/routes/v1/packages.js` and `server/src/routes/v1/index.js`**

---

### Task 3: Backend Package Unit & Route Tests

**Files:**
- Create: `server/tests/admin/packages.test.js`

**Interfaces:**
- Tests `GET`, `POST`, `PUT`, `POST .../toggle`, `DELETE` for `/api/v1/admin/packages`

- [ ] **Step 1: Write tests for package creation with multi-course bundles and features**
- [ ] **Step 2: Write tests for slug validation and collision (409)**
- [ ] **Step 3: Write tests for package updates, toggle active, and deletion**
- [ ] **Step 4: Write tests for auth and role protection (401/403)**

---

### Task 4: Client Types, Mock Data & Admin API Endpoints

**Files:**
- Modify: `client/src/types/index.ts`
- Modify: `client/src/mock-data/index.ts`
- Modify: `client/src/api/endpoints/admin.ts`
- Modify: `client/src/api/endpoints/public.ts`

**Interfaces:**
- `SubscriptionPackage` interface in `client/src/types/index.ts`
- `adminApi.getPackages()`, `adminApi.getPackageById(id)`, `adminApi.createPackage(data)`, `adminApi.updatePackage(id, data)`, `adminApi.togglePackageActive(id)`, `adminApi.deletePackage(id)`

- [ ] **Step 1: Define `SubscriptionPackage` interface in `client/src/types/index.ts`**
- [ ] **Step 2: Add mock packages in `client/src/mock-data/index.ts`**
- [ ] **Step 3: Implement `adminApi` methods for package CRUD with mock/live parity**

---

### Task 5: Frontend Package Modal & Card Components

**Files:**
- Create: `client/src/components/admin/PackageModal.tsx`
- Create: `client/src/components/admin/PackageCard.tsx`
- Modify: `client/src/components/admin/index.ts`

**Interfaces:**
- `PackageModalProps`: `{ isOpen: boolean; onClose: () => void; onSaved: (pkg: SubscriptionPackage) => void; packageToEdit?: SubscriptionPackage | null; courses: Course[] }`
- `PackageCardProps`: `{ pkg: SubscriptionPackage; courses: Course[]; onEdit: (pkg: SubscriptionPackage) => void; onToggleActive: (id: number) => void; onDelete: (pkg: SubscriptionPackage) => void }`

- [ ] **Step 1: Build `PackageModal.tsx` with multi-course picker, price/discount calculator, validity presets, and interactive feature bullet points manager**
- [ ] **Step 2: Build `PackageCard.tsx` with highlight badges, price savings preview, course badges, and quick toggle/edit actions**
- [ ] **Step 3: Export components from `client/src/components/admin/index.ts`**

---

### Task 6: Subscriptions Management Dashboard & Navigation Integration

**Files:**
- Create: `client/src/pages/admin/SubscriptionsManagementPage.tsx`
- Modify: `client/src/components/layout/AdminLayout.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/admin/AddStudentModal.tsx`

**Interfaces:**
- Route: `/admin/subscriptions`
- Left nav: Subscriptions & Pricing link with `<Zap />` icon
- AddStudentModal: Quick package allocator

- [ ] **Step 1: Create `SubscriptionsManagementPage.tsx` with KPI stats, category filters, search, dual visual card / table views, and delete confirmation**
- [ ] **Step 2: Add "Subscriptions & Pricing" to `AdminLayout.tsx` and register route in `App.tsx`**
- [ ] **Step 3: Integrate subscription package selection into `AddStudentModal.tsx` for 1-click allocation**

---

### Task 7: Automated Tests, Production Build, Lint & Deploy Packaging

**Files:**
- Create: `client/src/pages/admin/subscriptionsManagement.test.ts`

- [ ] **Step 1: Create and run client unit tests (`npm run test --prefix client`)**
- [ ] **Step 2: Run full project linter (`npm run lint`)**
- [ ] **Step 3: Build production bundle (`npm run build`)**
- [ ] **Step 4: Run production packaging script (`npm run package`)**
