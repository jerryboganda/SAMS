/**
 * Core domain types for SAMS Academy
 */

export type UserRole = "student" | "admin";
export type UserStatus = "pending" | "active" | "suspended";
export type ExamCategory = "NRE1" | "USMLE1" | "USMLE2CK" | "SMLE" | "DHA" | "PROMETRIC" | "MBBS" | "OTHER";

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt?: string;
  twofaEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
  activeDevicesCount?: number;
}

export interface CourseAllocationItem {
  courseId: number;
  validityMode?: "days" | "date";
  days?: number;
  expiresAt?: string;
}

export interface CreateStudentPayload {
  name: string;
  email: string;
  password?: string;
  phone?: string | null;
  status?: "active" | "pending" | "suspended";
  emailVerified?: boolean;
  enrollments?: CourseAllocationItem[];
  sendWelcomeEmail?: boolean;
}

export interface UpdateStudentPayload {
  name?: string;
  email?: string;
  phone?: string | null;
  status?: "active" | "pending" | "suspended";
  emailVerified?: boolean;
  password?: string;
}

export interface UserDevice {
  id: number;
  userId: number;
  deviceName: string;
  lastIp: string;
  lastSeenAt: string;
  isActive: boolean;
  isCurrent?: boolean;
  fingerprintHash?: string;
  location?: string;
}

export interface LoginEvent {
  id: number;
  userId: number;
  userName?: string;
  emailTried: string;
  status: "success" | "failed" | "blocked" | "suspicious";
  reason?: string;
  ip: string;
  country?: string;
  userAgent?: string;
  createdAt: string;
}

export interface PaymentEvent {
  id: number;
  orderId: number;
  gateway: string;
  eventType: string;
  externalRef?: string;
  payload: any;
  signatureValid: boolean;
  createdAt: string;
}

export interface Course {
  id: number;
  title: string;
  slug: string;
  examCategory: ExamCategory;
  shortDescription: string;
  description: string;
  thumbnailUrl: string;
  price: number;
  currency: string;
  validityDays: number;
  includesQBank: boolean;
  isPublished: boolean;
  sortOrder: number;
  sectionsCount?: number;
  lecturesCount?: number;
  totalDurationSeconds?: number;
}

export interface CourseSection {
  id: number;
  courseId: number;
  title: string;
  sortOrder: number;
  lectures?: Lecture[];
}

export interface Lecture {
  id: number;
  courseId: number;
  sectionId: number;
  title: string;
  description?: string;
  videoProvider: "bunny" | "mock";
  videoRef: string;
  durationSeconds: number;
  isFreePreview: boolean;
  isPublished: boolean;
  sortOrder: number;
  watchedSeconds?: number;
  /**
   * Last watched playback position in seconds — distinct from
   * `watchedSeconds` (cumulative watched time). Populated by
   * `GET /student/courses/:courseId`'s bulk per-lecture progress merge
   * (server/src/services/studentCourseService.js); undefined from endpoints
   * that don't compute it (e.g. the public catalog).
   */
  lastPositionSeconds?: number;
  isCompleted?: boolean;
  isBookmarked?: boolean;
}

export interface QuestionOption {
  id: number;
  questionId: number;
  optionText: string;
  isCorrect?: boolean; // Server omits this in exam mode pre-submission
  sortOrder: number;
}

export interface Question {
  id: number;
  examCategory: ExamCategory;
  subjectId: number;
  subjectName?: string;
  systemId: number;
  systemName?: string;
  stem: string;
  imageUrl?: string;
  options: QuestionOption[];
  explanation?: string;
  referenceText?: string;
  difficulty: "easy" | "medium" | "hard";
  isActive: boolean;
  timesAttempted?: number;
  timesCorrect?: number;
  isBookmarked?: boolean;
}

export interface Subject {
  id: number;
  name: string;
  sortOrder: number;
  questionsCount?: number;
}

export interface BodySystem {
  id: number;
  name: string;
  sortOrder: number;
  questionsCount?: number;
}

export interface MockExam {
  id: number;
  title: string;
  examCategory: ExamCategory;
  durationMinutes: number;
  passPercent: number;
  isPublished: boolean;
  questionsCount: number;
  bestScore?: number;
  attemptsCount?: number;
  /** Most-recent FINISHED (completed or abandoned) attempt's timestamp/score/verdict — additive fields
   * returned by the real `GET /mock-exams` (server/src/services/mockExamService.js#listMockExamsForStudent),
   * on top of `bestScore`/`attemptsCount`. Undefined when the student has never finished an attempt. */
  lastAttemptAt?: string;
  lastScorePercent?: number;
  lastPassed?: boolean;
  /** Full ordered question-id sequence — only populated by the admin single-resource GET
   * (`GET /admin/mock-exams/:id`, server/src/services/adminMockExamService.js#getMockExamById); the admin
   * list endpoint omits it (each row only needs `questionsCount`). Never present on the student-facing
   * `GET /mock-exams` response. */
  questionIds?: number[];
}

export type TestMode = "practice" | "exam" | "mock";
export type TestPool = "all" | "unused" | "incorrect" | "bookmarked";

export interface TestAttemptQuestion {
  id: number;
  testSessionId: number;
  questionId: number;
  sortOrder: number;
  question: Question;
  selectedOptionId?: number;
  isCorrect?: boolean;
  isFlagged: boolean;
  timeSpentSeconds: number;
}

export interface TestSession {
  id: number;
  userId: number;
  mode: TestMode;
  mockExamId?: number;
  mockExamTitle?: string;
  examCategory: ExamCategory;
  questionCount: number;
  timeLimitSeconds?: number;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt?: string;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  scorePercent?: number;
  passed?: boolean;
  questions?: TestAttemptQuestion[];
  timeRemainingSeconds?: number;
}

export type PaymentGateway = "jazzcash" | "easypaisa" | "raast" | "payfast" | "safepay" | "bank_transfer" | "manual" | "mock";

export interface Coupon {
  id: number;
  code: string;
  type: "percent" | "fixed";
  value: number;
  courseId?: number;
  courseTitle?: string;
  maxUses?: number;
  usedCount: number;
  validFrom?: string;
  validUntil?: string;
  isActive: boolean;
}

export type OrderStatus = "pending" | "awaiting_verification" | "paid" | "failed" | "cancelled" | "refunded";

export interface BankTransferProof {
  id: number;
  orderId: number;
  filePath: string;
  referenceNo?: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  rejectReason?: string;
  createdAt: string;
}

export interface Order {
  id: number;
  invoiceNo: string;
  userId: number;
  userName?: string;
  userEmail?: string;
  courseId: number;
  courseTitle?: string;
  amount: number;
  discountAmount: number;
  finalAmount: number;
  currency: string;
  couponId?: number;
  couponCode?: string;
  gateway: PaymentGateway;
  gatewayRef?: string;
  status: OrderStatus;
  paidAt?: string;
  createdAt: string;
  proof?: BankTransferProof;
}

export interface Enrollment {
  id: number;
  userId: number;
  userName?: string;
  userEmail?: string;
  courseId: number;
  courseTitle?: string;
  courseThumbnail?: string;
  /** Real `courses.slug` for this enrollment's course (server/src/services/studentCourseService.js#serializeEnrollment)
   * — used to build a real `/checkout/:slug` renewal link; never a hardcoded per-course guess. */
  courseSlug?: string;
  orderId?: number;
  source: "purchase" | "manual";
  startsAt: string;
  expiresAt: string;
  status: "active" | "expired" | "revoked";
  progressPercent?: number;
  remainingDays?: number;
}

export interface NotificationItem {
  id: number;
  userId: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  audience: "all" | "course";
  courseId?: number;
  courseTitle?: string;
  sendEmail: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface FacultyMember {
  id: number;
  name: string;
  title: string;
  bio: string;
  photoUrl: string;
  sortOrder: number;
  isActive: boolean;
}

export interface FAQ {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  subject?: string;
  message: string;
  status: "new" | "read" | "replied";
  createdAt: string;
}

export interface AuditLog {
  id: number;
  actorUserId?: number;
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: number;
  summary: string;
  ip: string;
  createdAt: string;
}

export interface StudentDashboardStats {
  activeEnrollments: Enrollment[];
  continueWatching?: {
    lecture: Lecture;
    courseId: number;
    courseTitle: string;
    watchedSeconds: number;
    durationSeconds: number;
  };
  studyHours7d: number;
  studyHoursTotal: number;
  qbankStats: {
    totalAttempted: number;
    correctPercent: number;
    activeStreakDays: number;
    testsTakenCount?: number;
  };
  announcements: Announcement[];
  unreadNotificationsCount: number;
  recentActivity?: {
    id: number;
    title: string;
    courseTitle: string;
    timestamp: string;
    type: "lecture" | "test" | "bookmark" | "streak";
  }[];
}

export interface AdminDashboardKPIs {
  revenueToday: number;
  revenue7d: number;
  revenue30d: number;
  revenueTotal: number;
  pendingTransfersCount: number;
  newStudents30d: number;
  activeEnrollmentsCount: number;
  topCourses: { courseId: number; title: string; enrollmentsCount: number; revenue: number }[];
  recentOrders: Order[];
  // Phase 11.1 — a deliberate, documented extension beyond the original
  // shape (see server/src/services/adminDashboardService.js's own header):
  // 30-day, zero-filled, chronological daily revenue series backing
  // AdminDashboardPage.tsx's revenue trend chart, replacing what used to be
  // a fully-hardcoded local mock array.
  revenueTrend: { day: string; amount: number }[];
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
