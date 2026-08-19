# Admin Manual Student Management (CRUD & Allocation Modal) — Design Specification

**Date:** 2026-08-19  
**Status:** Approved  
**Author:** Antigravity / SAMS Academy Engineering  

---

## 1. Overview & Objectives

Currently, candidates register via the public portal during checkout. SAMS Academy administrators require the capability to manually register students directly from the Admin Panel, set/generate their credentials, adjust their verification status, and allocate one or multiple course packages with customized or preset validity periods. Furthermore, administrators need full editing capabilities for existing student accounts.

---

## 2. Architecture & Data Contracts

### 2.1 Backend Endpoints

#### `POST /api/v1/admin/students` — Create Student Manually
- **Authentication / Authorization:** Requires admin role (`auth -> deviceCheck -> requireRole('admin')`).
- **Audit Logging:** Logs `student.create` with summary of student name, email, and allocated courses.
- **Request Body:**
  ```json
  {
    "name": "string (min 2, max 120)",
    "email": "string (email format, lowercase, unique)",
    "password": "string (min 8)",
    "phone": "string | null",
    "status": "active | pending | suspended",
    "emailVerified": "boolean (default true)",
    "enrollments": [
      {
        "courseId": "number",
        "validityMode": "days | date",
        "days": "number (positive integer)",
        "expiresAt": "ISO date string (optional if days provided)"
      }
    ],
    "sendWelcomeEmail": "boolean (optional, default false)"
  }
  ```
- **Transaction Flow:**
  1. Validate request body against Zod schema.
  2. Check email uniqueness against `User` table; return `409 CONFLICT` if email exists.
  3. Hash password using bcrypt (12 rounds).
  4. Begin Sequelize transaction:
     - Insert `User` with `role: 'student'`, `name`, `email`, `phone`, `status`, `emailVerifiedAt` (set to `new Date()` if `emailVerified: true`, else `null`), `passwordHash`.
     - For each course in `enrollments`:
       - Calculate `expiresAt` based on `validityMode` (`days` offset from now or parsed `expiresAt` date).
       - Mark existing active enrollments for `(userId, courseId)` as `expired` to maintain unique active slot constraint.
       - Insert `Enrollment` with `source: 'manual'`, `startsAt: now`, `expiresAt`, `status: 'active'`.
     - Record `AuditLog` row.
  5. If `sendWelcomeEmail` is true, trigger background email notification with credentials.
  6. Return `201 CREATED` with serialized student data (`User` fields + `activeDevicesCount: 0` + `enrollments`).

#### `PUT /api/v1/admin/students/:id` — Update Student Profile
- **Authentication / Authorization:** Admin role required.
- **Audit Logging:** Logs `student.update`.
- **Request Body:**
  ```json
  {
    "name": "string (optional)",
    "email": "string (optional, checked for unique collision)",
    "phone": "string | null (optional)",
    "status": "active | pending | suspended (optional)",
    "emailVerified": "boolean (optional)",
    "password": "string (min 8, optional - if supplied, re-hashes password)"
  }
  ```
- **Behavior:**
  - Validates student existence and non-admin role.
  - Updates fields in `User` table.
  - Returns `200 OK` with updated serialized student.

#### `DELETE /api/v1/admin/students/:id` — Delete / Anonymize Student
- **Authentication / Authorization:** Admin role required.
- **Audit Logging:** Logs `student.delete` or `student.anonymize`.
- **Behavior:**
  - If the student has associated orders, enrollments, test sessions, or audit logs, executes the GDPR-compliant anonymization routine (`anonymizeStudentAccount`) to preserve financial trails.
  - If no historical relational rows exist, deletes the user record safely.
  - Returns `200 OK`.

---

## 3. Frontend UI/UX Specifications

### 3.1 Student Management Page Header
- Position: Top-right of `StudentsManagementPage.tsx` header area (as shown in UI layout).
- Element: Primary Action Button `+ Add Student` with `<Plus className="w-4 h-4" />` icon, styled in `#0FA3A3` / Teal theme.
- Behavior: Opens `AddStudentModal`.

### 3.2 Student Table Roster Actions
- Action column in table:
  - `Manage`: Navigates to `/admin/students/:id`.
  - `Edit`: Opens `EditStudentModal` preloaded with the student's current information.

### 3.3 Add Student Modal (`AddStudentModal`)
- **Container**: SAMS UI `Modal` component (size: `lg` or `xl`, scrollable, responsive).
- **Sections**:
  1. **Candidate Profile**:
     - Name (`Input`, required)
     - Email (`Input`, type email, required)
     - WhatsApp Phone (`Input`, type tel, optional)
  2. **Security & Credentials**:
     - Password (`PasswordInput` with toggle)
     - "Generate Strong Password" button (creates random 12-char secure string and populates field)
     - Email Verified checkbox (defaults to `true`)
     - Account Status (`Select`: Active, Pending, Suspended; defaults to Active)
  3. **Course & Package Allocation**:
     - Course Selector: Dropdown showing all available courses.
     - Validity Controls:
       - Presets: Course Default, 30 Days, 60 Days, 90 Days, 180 Days, 365 Days, or Custom Date.
       - Date Picker: Enabled when "Custom Date" is selected.
       - Live Expiry Preview badge (e.g. "Expires: 19 Nov 2026").
     - Multi-course capability: Allows adding multiple course cards and removing any.
  4. **Notifications & Options**:
     - Checkbox: "Send account credentials email to candidate"
- **Actions**:
  - `Cancel` button
  - `Create Student & Allocate Access` button (with loading spinner)

### 3.4 Post-Creation Credentials Modal
- Opens automatically upon successful creation of a new student.
- Displays:
  - Success banner with student name and email.
  - Clear-text password with 1-click copy button.
  - Summary of allocated course packages and expiry dates.
  - "Copy Details for WhatsApp" button with formatted message template.
  - Close button.

### 3.5 Edit Student Modal (`EditStudentModal`)
- Opens when clicking `Edit` on any student row or on the Student Detail page.
- Pre-populates Name, Email, Phone, Status, Email Verified state.
- Includes optional "Reset Password" input (leave blank to keep existing).
- Submits `PUT /api/v1/admin/students/:id` and updates local state / toast notification.

---

## 4. Mock API & Real API Parity
- All mock data handlers in `client/src/api/endpoints/admin.ts` (`createStudent`, `updateStudent`, `deleteStudent`) will be fully implemented so both `CONFIG.USE_MOCK = true` and `CONFIG.USE_MOCK = false` function identically.

---

## 5. Verification & Testing Plan
1. **Backend Unit & Integration Tests**:
   - `POST /admin/students`: Happy path (user created, password hashed, enrollments created, audit logged).
   - Validation failures (duplicate email -> 409, weak password -> 422, invalid course -> 404).
   - `PUT /admin/students/:id`: Update fields, update password, audit logged.
   - `DELETE /admin/students/:id`: Deletion / Anonymization check.
2. **Frontend Vitest Suite**:
   - Verify modal open/close, password generation logic, expiry date calculation helpers, and form submissions.
3. **End-to-End Build & Visual Verification**:
   - Run `npm run build` to verify clean TypeScript compilation.
   - Test UI flow in browser.
