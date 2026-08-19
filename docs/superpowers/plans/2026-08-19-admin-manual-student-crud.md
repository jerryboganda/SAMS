# Admin Manual Student Management (CRUD & Allocation Modal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable administrators to manually create and edit student accounts in SAMS Academy via a dedicated pop-up modal with customizable credentials, email verification toggle, and multi-course subscription/package allocation with preset or custom expiry dates.

**Architecture:** Extend backend student management with atomic `POST /api/v1/admin/students`, `PUT /api/v1/admin/students/:id`, and `DELETE /api/v1/admin/students/:id` routes in Sequelize. Create modular frontend React components (`AddStudentModal`, `EditStudentModal`, `PostCreateCredentialsModal`) and wire them into `StudentsManagementPage.tsx` with mock and live API parity.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite, Node.js 20, Express, Sequelize ORM, Zod, bcrypt, Vitest, Jest.

## Global Constraints
- Node.js 20 LTS, Express 4.x + Sequelize ORM (`mysql2` driver).
- Passwords hashed with bcrypt (12 rounds).
- Rate limiting & security compliance: audit log every admin mutation (`audit('student.create')`, `audit('student.update')`, `audit('student.delete')`).
- Consistent API envelope `{ success: true, data: ... }` / `{ success: false, error: ... }`.
- Parity between `CONFIG.USE_MOCK = true` and `CONFIG.USE_MOCK = false`.

---

### Task 1: Backend Admin Student Service & Controller Extensions

**Files:**
- Modify: `server/src/services/adminStudentService.js`
- Modify: `server/src/controllers/adminStudentController.js`
- Modify: `server/src/routes/v1/admin/students.js`

**Interfaces:**
- Produces:
  - `adminStudentService.createStudentManually({ name, email, password, phone, status, emailVerified, enrollments, sendWelcomeEmail, adminUserId })`
  - `adminStudentService.updateStudentProfile(id, { name, email, phone, status, emailVerified, password, adminUserId })`
  - `adminStudentService.deleteOrAnonymizeStudent(id)`
- Consumes:
  - `db.User`, `db.Enrollment`, `db.Course`, `db.AuditLog`, `bcrypt`, `serializeUser`

- [ ] **Step 1: Implement `createStudentManually`, `updateStudentProfile`, and `deleteOrAnonymizeStudent` in `adminStudentService.js`**
- [ ] **Step 2: Add Zod schemas and controller handlers in `adminStudentController.js`**
- [ ] **Step 3: Route `POST /students`, `PUT /students/:id`, `DELETE /students/:id` with audit middleware in `server/src/routes/v1/admin/students.js`**

---

### Task 2: Backend Admin Student Unit & Route Tests

**Files:**
- Modify: `server/tests/admin/students.test.js`

**Interfaces:**
- Tests `POST /api/v1/admin/students`, `PUT /api/v1/admin/students/:id`, `DELETE /api/v1/admin/students/:id`

- [ ] **Step 1: Add unit tests for successful manual student creation with multiple course allocations**
- [ ] **Step 2: Add tests for email collision (409) and validation errors (422)**
- [ ] **Step 3: Add tests for student profile and password updates**
- [ ] **Step 4: Add tests for safe anonymization/deletion**

---

### Task 3: Client API Endpoints & Types

**Files:**
- Modify: `client/src/types/index.ts`
- Modify: `client/src/api/endpoints/admin.ts`

**Interfaces:**
- Produces:
  - `adminApi.createStudent(payload: CreateStudentPayload): Promise<User & { enrollments?: Enrollment[] }>`
  - `adminApi.updateStudent(id: number | string, payload: UpdateStudentPayload): Promise<User>`
  - `adminApi.deleteStudent(id: number | string): Promise<{ success: boolean; message?: string }>`

- [ ] **Step 1: Add `CreateStudentPayload`, `UpdateStudentPayload`, and `CourseAllocationItem` to `client/src/types/index.ts`**
- [ ] **Step 2: Implement `createStudent`, `updateStudent`, `deleteStudent` in `client/src/api/endpoints/admin.ts` with mock-data simulation for offline/mock mode and live `apiFetch`**

---

### Task 4: Admin Student Modal Components

**Files:**
- Create: `client/src/components/admin/AddStudentModal.tsx`
- Create: `client/src/components/admin/EditStudentModal.tsx`
- Create: `client/src/components/admin/PostCreateCredentialsModal.tsx`
- Modify: `client/src/components/admin/index.ts` (if existing, or export from components)

**Interfaces:**
- `AddStudentModalProps`: `{ isOpen: boolean; onClose: () => void; onCreated: (student: User, credentials?: { email: string; password: string }) => void; courses: Course[] }`
- `EditStudentModalProps`: `{ isOpen: boolean; onClose: () => void; onUpdated: (student: User) => void; student: User | null }`
- `PostCreateCredentialsModalProps`: `{ isOpen: boolean; onClose: () => void; data: { name: string; email: string; password: string; enrollments: { courseTitle: string; expiresAt: string }[] } | null }`

- [ ] **Step 1: Build `AddStudentModal.tsx` with password generator, multi-course allocation, preset/custom expiry, email verification toggle**
- [ ] **Step 2: Build `EditStudentModal.tsx` with student info editing, status toggle, email verification flag, and password reset**
- [ ] **Step 3: Build `PostCreateCredentialsModal.tsx` with formatted WhatsApp/Email copy button and visual preview**

---

### Task 5: Student Management UI Integration & Roster Controls

**Files:**
- Modify: `client/src/pages/admin/StudentsManagementPage.tsx`

**Interfaces:**
- Top right header button: `+ Add Student`
- Table action column: `Manage` + `Edit` buttons
- Student detail page: `Edit Profile` button
- Integrated modals and toast notifications

- [ ] **Step 1: Add top-right `+ Add Student` button in the roster header matching the screenshot design**
- [ ] **Step 2: Add `Edit` action button to table rows and detail header**
- [ ] **Step 3: Wire modal states (`isAddModalOpen`, `isEditModalOpen`, `credentialsModalData`) and reload handlers**

---

### Task 6: Testing, Build & End-to-End Verification

**Files:**
- Test: `client/src/pages/admin/StudentsManagementPage.test.ts` (or relevant vitest suite)

- [ ] **Step 1: Run client vitest test suite (`npm run test --prefix client`)**
- [ ] **Step 2: Run production client build (`npm run build`)**
- [ ] **Step 3: Verify all modal interactions, copy-to-clipboard, and form validation**
