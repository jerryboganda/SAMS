import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

// Common Components
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { DevPanel } from "./components/common/DevPanel";

// Layouts
import { PublicLayout } from "./components/layout/PublicLayout";
import { StudentLayout } from "./components/layout/StudentLayout";
import { AdminLayout } from "./components/layout/AdminLayout";

// Guard
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

// Public Pages
import { HomePage } from "./pages/public/HomePage";
import { CoursesPage } from "./pages/public/CoursesPage";
import { CourseDetailPage } from "./pages/public/CourseDetailPage";
import { FreeTrialPage } from "./pages/public/FreeTrialPage";
import { FacultyPage } from "./pages/public/FacultyPage";
import { FacultyDetailPage } from "./pages/public/FacultyDetailPage";
import { AboutPage } from "./pages/public/AboutPage";
import { ContactPage } from "./pages/public/ContactPage";
import { FaqsPage } from "./pages/public/FaqsPage";
import { LegalPage } from "./pages/public/LegalPage";
import { QBankMarketingPage } from "./pages/public/QBankMarketingPage";
import { CheckoutPage } from "./pages/public/CheckoutPage";
import { OrderStatusPage } from "./pages/public/OrderStatusPage";
import { LoginPage } from "./pages/public/LoginPage";
import { RegisterPage } from "./pages/public/RegisterPage";
import { VerifyEmailPage } from "./pages/public/VerifyEmailPage";
import { ForgotPasswordPage } from "./pages/public/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/public/ResetPasswordPage";
import { NotFoundPage } from "./pages/public/NotFoundPage";

// Student Pages
import { StudentDashboardPage } from "./pages/student/StudentDashboardPage";
import { MyCoursesPage } from "./pages/student/MyCoursesPage";
import { CourseHomePage } from "./pages/student/CourseHomePage";
import { CoursePlayerPage } from "./pages/student/CoursePlayerPage";
import { QBankPage } from "./pages/student/QBankPage";
import { CreateTestPage } from "./pages/student/CreateTestPage";
import { TestSessionPage } from "./pages/student/TestSessionPage";
import { TestResultPage } from "./pages/student/TestResultPage";
import { TestReviewPage } from "./pages/student/TestReviewPage";
import { IncorrectQuestionsPage } from "./pages/student/IncorrectQuestionsPage";
import { MockExamsPage } from "./pages/student/MockExamsPage";
import { AnalyticsPage } from "./pages/student/AnalyticsPage";
import { BookmarksPage } from "./pages/student/BookmarksPage";
import { OrdersPage } from "./pages/student/OrdersPage";
import { NotificationsPage } from "./pages/student/NotificationsPage";
import { ProfilePage } from "./pages/student/ProfilePage";

// Admin Pages
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { StudentsManagementPage } from "./pages/admin/StudentsManagementPage";
import { CoursesManagementPage } from "./pages/admin/CoursesManagementPage";
import { QBankManagementPage } from "./pages/admin/QBankManagementPage";
import { QBankImportPage } from "./pages/admin/QBankImportPage";
import { TaxonomyManagementPage } from "./pages/admin/TaxonomyManagementPage";
import { MockExamsManagementPage } from "./pages/admin/MockExamsManagementPage";
import { OrdersManagementPage } from "./pages/admin/OrdersManagementPage";
import { ManualPaymentsPage } from "./pages/admin/ManualPaymentsPage";
import { CouponsManagementPage } from "./pages/admin/CouponsManagementPage";
import { AnnouncementsManagementPage } from "./pages/admin/AnnouncementsManagementPage";
import { FacultyManagementPage } from "./pages/admin/FacultyManagementPage";
import { AnalyticsManagementPage } from "./pages/admin/AnalyticsManagementPage";
import { SettingsManagementPage } from "./pages/admin/SettingsManagementPage";
import { FaqsManagementPage } from "./pages/admin/FaqsManagementPage";
import { MessagesManagementPage } from "./pages/admin/MessagesManagementPage";
import { AuditLogManagementPage } from "./pages/admin/AuditLogManagementPage";

const PageTitleHandler: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = "SAMS Academy | Medical Exam Preparation";

    if (path === "/") title = "SAMS Academy | Medical Licensing Exam Prep";
    else if (path.startsWith("/courses")) title = "Courses & Subscriptions | SAMS Academy";
    else if (path.startsWith("/qbank")) title = "Question Bank Hub | SAMS Academy";
    else if (path.startsWith("/faculty")) title = "Faculty & Instructors | SAMS Academy";
    else if (path.startsWith("/about")) title = "About SAMS Academy | Medical Education";
    else if (path.startsWith("/contact")) title = "Contact Support | SAMS Academy";
    else if (path.startsWith("/faqs")) title = "Frequently Asked Questions | SAMS Academy";
    else if (path.startsWith("/login")) title = "Sign In | SAMS Academy";
    else if (path.startsWith("/register")) title = "Register Account | SAMS Academy";
    else if (path.startsWith("/checkout")) title = "Checkout & Payment | SAMS Academy";
    else if (path.startsWith("/app/dashboard") || path === "/app") title = "Student Dashboard | SAMS Academy";
    else if (path.startsWith("/app/courses")) title = "My Courses & Progress | SAMS Academy";
    else if (path.startsWith("/app/qbank")) title = "QBank Practice | SAMS Academy";
    else if (path.startsWith("/app/mock-exams")) title = "Mock Exams | SAMS Academy";
    else if (path.startsWith("/app/analytics")) title = "Performance Analytics | SAMS Academy";
    else if (path.startsWith("/app/bookmarks")) title = "Bookmarks | SAMS Academy";
    else if (path.startsWith("/app/orders")) title = "My Orders & Invoices | SAMS Academy";
    else if (path.startsWith("/app/notifications")) title = "Notifications | SAMS Academy";
    else if (path.startsWith("/app/profile")) title = "Profile & Device Management | SAMS Academy";
    else if (path.startsWith("/admin/students")) title = "Student Management | Admin Portal";
    else if (path.startsWith("/admin/courses")) title = "Course Builder | Admin Portal";
    else if (path.startsWith("/admin/qbank") || path.startsWith("/admin/questions")) title = "QBank Management | Admin Portal";
    else if (path.startsWith("/admin/mock-exams")) title = "Mock Exams Admin | Admin Portal";
    else if (path.startsWith("/admin/orders")) title = "Order Records | Admin Portal";
    else if (path.startsWith("/admin/manual-payments")) title = "Bank & Raast Verifications | Admin Portal";
    else if (path.startsWith("/admin/coupons")) title = "Coupons & Discounts | Admin Portal";
    else if (path.startsWith("/admin/announcements")) title = "Broadcast Announcements | Admin Portal";
    else if (path.startsWith("/admin/faculty")) title = "Faculty Profiles | Admin Portal";
    else if (path.startsWith("/admin/faqs")) title = "FAQ Management | Admin Portal";
    else if (path.startsWith("/admin/messages")) title = "Contact Inbox | Admin Portal";
    else if (path.startsWith("/admin/analytics") || path.startsWith("/admin/reports")) title = "Reports & Analytics | Admin Portal";
    else if (path.startsWith("/admin/audit-log")) title = "System Audit Logs | Admin Portal";
    else if (path.startsWith("/admin/settings")) title = "System Settings | Admin Portal";
    else if (path.startsWith("/admin")) title = "Admin Portal | SAMS Academy";

    document.title = title;
  }, [location]);

  return null;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <PageTitleHandler />
        <Routes>
          {/* Public Site Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/courses/:slug" element={<CourseDetailPage />} />
          <Route path="/qbank" element={<QBankMarketingPage />} />
          <Route path="/free-trial" element={<FreeTrialPage />} />
          <Route path="/faculty" element={<FacultyPage />} />
          <Route path="/faculty/:id" element={<FacultyDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/faqs" element={<FaqsPage />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/refund" element={<LegalPage />} />
          <Route path="/refund-policy" element={<LegalPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/:slug" element={<CheckoutPage />} />
          <Route path="/order/:id/status" element={<OrderStatusPage />} />
        </Route>

        {/* Auth Pages (Standalone Split-Screen Layouts) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* Protected Student Portal Routes */}
        <Route
          path="/app"
          element={
            <ProtectedRoute allowedRoles={["student", "admin"]}>
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<StudentDashboardPage />} />
          <Route path="dashboard" element={<StudentDashboardPage />} />
          <Route path="courses" element={<MyCoursesPage />} />
          <Route path="courses/:id" element={<CourseHomePage />} />
          <Route path="courses/:id/player" element={<CoursePlayerPage />} />
          <Route path="learn/:lectureId" element={<CoursePlayerPage />} />
          <Route path="qbank" element={<QBankPage />} />
          <Route path="qbank/new" element={<CreateTestPage />} />
          <Route path="qbank/session/:testId" element={<TestSessionPage />} />
          <Route path="qbank/test/:testId" element={<TestSessionPage />} />
          <Route path="qbank/results/:testId" element={<TestResultPage />} />
          <Route path="qbank/test/:testId/result" element={<TestResultPage />} />
          <Route path="qbank/test/:testId/results" element={<TestResultPage />} />
          <Route path="qbank/review/:testId" element={<TestReviewPage />} />
          <Route path="qbank/test/:testId/review" element={<TestReviewPage />} />
          <Route path="qbank/bookmarks" element={<BookmarksPage />} />
          <Route path="qbank/incorrect" element={<IncorrectQuestionsPage />} />
          <Route path="mock-exams" element={<MockExamsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="bookmarks" element={<BookmarksPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Protected Admin Portal Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="students" element={<StudentsManagementPage />} />
          <Route path="students/:id" element={<StudentsManagementPage />} />
          <Route path="manual-payments" element={<ManualPaymentsPage />} />
          <Route path="courses" element={<CoursesManagementPage />} />
          <Route path="qbank" element={<QBankManagementPage />} />
          <Route path="qbank/import" element={<QBankImportPage />} />
          <Route path="qbank/taxonomy" element={<TaxonomyManagementPage />} />
          <Route path="questions" element={<QBankManagementPage />} />
          <Route path="questions/import" element={<QBankImportPage />} />
          <Route path="taxonomy" element={<TaxonomyManagementPage />} />
          <Route path="mock-exams" element={<MockExamsManagementPage />} />
          <Route path="orders" element={<OrdersManagementPage />} />
          <Route path="orders/:id" element={<OrdersManagementPage />} />
          <Route path="coupons" element={<CouponsManagementPage />} />
          <Route path="announcements" element={<AnnouncementsManagementPage />} />
          <Route path="faculty" element={<FacultyManagementPage />} />
          <Route path="faqs" element={<FaqsManagementPage />} />
          <Route path="messages" element={<MessagesManagementPage />} />
          <Route path="analytics" element={<AnalyticsManagementPage />} />
          <Route path="reports" element={<AnalyticsManagementPage />} />
          <Route path="audit-log" element={<AuditLogManagementPage />} />
          <Route path="settings" element={<SettingsManagementPage />} />
        </Route>

        {/* Fallback 404 Route */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <DevPanel />
    </BrowserRouter>
  </ErrorBoundary>
  );
};

export default App;
