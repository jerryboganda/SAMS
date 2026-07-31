import { CONFIG } from "../../config";
import { apiFetch, apiUpload, mockLatency } from "../client";
import {
  AdminDashboardKPIs,
  Announcement,
  AuditLog,
  BodySystem,
  ContactMessage,
  Coupon,
  Course,
  CourseSection,
  FacultyMember,
  FAQ,
  Lecture,
  LoginEvent,
  MockExam,
  Order,
  PaymentEvent,
  Question,
  Subject,
  User,
  UserDevice,
} from "../../types";
import {
  MOCK_ANNOUNCEMENTS,
  MOCK_AUDIT_LOGS,
  MOCK_CONTACT_MESSAGES,
  MOCK_COUPONS,
  MOCK_COURSES,
  MOCK_EXAM_PAPER,
  MOCK_FACULTY,
  MOCK_FAQS,
  MOCK_LOGIN_EVENTS,
  MOCK_NOTIFICATIONS,
  MOCK_ORDERS,
  MOCK_PAYMENT_EVENTS,
  MOCK_QUESTIONS,
  MOCK_SECTIONS,
  MOCK_SETTINGS,
  MOCK_STUDENT_DEVICES,
  MOCK_SUBJECTS,
  MOCK_SYSTEMS,
  MOCK_USERS,
} from "../../mock-data";

export const adminApi = {
  async getDashboardKPIs(): Promise<AdminDashboardKPIs> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return {
        revenueToday: 13500,
        revenue7d: 85500,
        revenue30d: 420000,
        revenueTotal: 1850000,
        pendingTransfersCount: MOCK_ORDERS.filter((o) => o.status === "awaiting_verification").length,
        newStudents30d: 148,
        activeEnrollmentsCount: 382,
        topCourses: [
          { courseId: 1, title: "NRE Step 1 Complete Preparation Masterclass", enrollmentsCount: 240, revenue: 3240000 },
          { courseId: 2, title: "SMLE High-Yield Crash Course", enrollmentsCount: 85, revenue: 1530000 },
          { courseId: 3, title: "MBBS Clinical Foundations", enrollmentsCount: 57, revenue: 684000 },
        ],
        recentOrders: MOCK_ORDERS,
      };
    }
    return apiFetch<AdminDashboardKPIs>("/admin/dashboard");
  },

  async getStudents(): Promise<User[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_USERS;
    }
    return apiFetch<User[]>("/admin/students");
  },

  async getStudentById(studentId: number | string): Promise<User | null> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      const user = MOCK_USERS.find((u) => u.id === Number(studentId));
      return user || MOCK_USERS[0];
    }
    return apiFetch<User>(`/admin/students/${studentId}`);
  },

  async updateStudentStatus(studentId: number | string, status: "active" | "suspended"): Promise<User> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const user = MOCK_USERS.find((u) => u.id === Number(studentId));
      if (user) {
        user.status = status;
        MOCK_AUDIT_LOGS.unshift({
          id: Date.now(),
          actorUserId: 2,
          actorName: "Dr. Zabih Ullah (Admin)",
          action: `user.${status}`,
          entityType: "User",
          entityId: Number(studentId),
          summary: `Updated student #${studentId} (${user.name}) status to ${status.toUpperCase()}`,
          ip: "182.180.122.45",
          createdAt: new Date().toISOString(),
        });
      }
      return user || MOCK_USERS[0];
    }
    return apiFetch<User>(`/admin/students/${studentId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  async getStudentDevices(studentId: number | string): Promise<UserDevice[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_STUDENT_DEVICES[Number(studentId)] || [
        {
          id: 991,
          userId: Number(studentId),
          deviceName: "Windows PC - Chrome 122",
          lastIp: "182.180.122.45",
          location: "Lahore, Pakistan",
          lastSeenAt: "2026-07-28T10:00:00Z",
          isActive: true,
          isCurrent: true,
          fingerprintHash: "fp_generic_win_001",
        },
      ];
    }
    return apiFetch<UserDevice[]>(`/admin/students/${studentId}/devices`);
  },

  async resetStudentDevices(studentId: number | string): Promise<{ success: boolean; message: string }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      const student = MOCK_USERS.find((u) => u.id === Number(studentId));
      if (student) student.activeDevicesCount = 0;
      if (MOCK_STUDENT_DEVICES[Number(studentId)]) {
        MOCK_STUDENT_DEVICES[Number(studentId)] = [];
      }
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "user.reset_devices",
        entityType: "User",
        entityId: Number(studentId),
        summary: `Reset DRM device lock slots for candidate #${studentId} (${student?.name || "Student"})`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return {
        success: true,
        message: `Device binding reset successfully for student #${studentId}. Candidate can now pair new devices.`,
      };
    }
    return apiFetch<{ success: boolean; message: string }>(`/admin/students/${studentId}/reset-devices`, {
      method: "POST",
    });
  },

  async resetDevice(studentId: number | string) {
    return this.resetStudentDevices(studentId);
  },

  async getStudentLoginEvents(studentId: number | string): Promise<LoginEvent[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_LOGIN_EVENTS[Number(studentId)] || [
        {
          id: 501,
          userId: Number(studentId),
          userName: "Dr. Candidate",
          emailTried: "candidate@samsacademy.com",
          status: "success",
          ip: "182.180.122.45",
          country: "PK",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0",
          createdAt: "2026-07-28T10:00:00Z",
        },
      ];
    }
    return apiFetch<LoginEvent[]>(`/admin/students/${studentId}/login-events`);
  },

  async getStudentOrders(studentId: number | string): Promise<Order[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_ORDERS.filter((o) => o.userId === Number(studentId));
    }
    return apiFetch<Order[]>(`/admin/students/${studentId}/orders`);
  },

  async extendStudentEnrollment(studentId: number | string, courseId: number, days: number = 30): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "enrollment.extend",
        entityType: "Enrollment",
        entityId: courseId,
        summary: `Extended validity by +${days} days for student #${studentId} in course #${courseId}`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/students/${studentId}/enrollments/extend`, {
      method: "POST",
      body: JSON.stringify({ courseId, days }),
    });
  },

  async getOrders(): Promise<Order[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_ORDERS;
    }
    return apiFetch<Order[]>("/admin/orders");
  },

  async getOrderById(orderId: number | string): Promise<Order | null> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      const order = MOCK_ORDERS.find((o) => o.id === Number(orderId) || o.invoiceNo === String(orderId));
      return order || MOCK_ORDERS[0];
    }
    return apiFetch<Order>(`/admin/orders/${orderId}`);
  },

  async getPaymentEvents(orderId: number | string): Promise<PaymentEvent[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_PAYMENT_EVENTS[Number(orderId)] || [
        {
          id: 901,
          orderId: Number(orderId),
          gateway: "mock_gateway",
          eventType: "payment_initiated",
          externalRef: `EXT-MOCK-${orderId}`,
          payload: { orderId, amount: 15000, currency: "PKR", timestamp: new Date().toISOString() },
          signatureValid: true,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    return apiFetch<PaymentEvent[]>(`/admin/orders/${orderId}/payment-events`);
  },

  async markOrderAsPaid(orderId: number | string, reason: string): Promise<Order> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      const order = MOCK_ORDERS.find((o) => o.id === Number(orderId)) || MOCK_ORDERS[0];
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      if (order.proof) order.proof.status = "approved";
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "order.mark_paid",
        entityType: "Order",
        entityId: order.id,
        summary: `Manually marked order ${order.invoiceNo} as PAID. Reason: "${reason}"`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return order;
    }
    return apiFetch<Order>(`/admin/orders/${orderId}/mark-paid`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  async flagOrderRefund(orderId: number | string, reason: string): Promise<Order> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      const order = MOCK_ORDERS.find((o) => o.id === Number(orderId)) || MOCK_ORDERS[0];
      order.status = "refunded";
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "order.refund_flag",
        entityType: "Order",
        entityId: order.id,
        summary: `Flagged order ${order.invoiceNo} as REFUNDED. Reason: "${reason}"`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return order;
    }
    return apiFetch<Order>(`/admin/orders/${orderId}/refund-flag`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  async getBankTransfersQueue(): Promise<Order[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_ORDERS.filter((o) => o.status === "awaiting_verification" || (o.proof && o.proof.status === "pending"));
    }
    return apiFetch<Order[]>("/admin/bank-transfers");
  },

  async approveBankTransfer(orderId: number | string): Promise<Order> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      const order = MOCK_ORDERS.find((o) => o.id === Number(orderId)) || MOCK_ORDERS[1];
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      if (order.proof) {
        order.proof.status = "approved";
        order.proof.reviewedBy = "Dr. Zabih Ullah (Admin)";
        order.proof.reviewedAt = new Date().toISOString();
      }
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "order.approve_transfer",
        entityType: "Order",
        entityId: order.id,
        summary: `Approved manual transfer for ${order.invoiceNo}. Course enrollment activated.`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return order;
    }
    return apiFetch<Order>(`/admin/bank-transfers/${orderId}/approve`, { method: "POST" });
  },

  async approveOrder(orderId: number | string) {
    return this.approveBankTransfer(orderId);
  },

  async rejectBankTransfer(orderId: number | string, reason: string = "Payment verification failed"): Promise<Order> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      const order = MOCK_ORDERS.find((o) => o.id === Number(orderId)) || MOCK_ORDERS[1];
      order.status = "failed";
      if (order.proof) {
        order.proof.status = "rejected";
        order.proof.rejectReason = reason;
        order.proof.reviewedBy = "Dr. Zabih Ullah (Admin)";
        order.proof.reviewedAt = new Date().toISOString();
      }
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "order.reject_transfer",
        entityType: "Order",
        entityId: order.id,
        summary: `Rejected manual transfer for ${order.invoiceNo}. Reason: "${reason}"`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return order;
    }
    return apiFetch<Order>(`/admin/bank-transfers/${orderId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  async rejectOrder(orderId: number | string, reason: string = "Rejected by admin") {
    return this.rejectBankTransfer(orderId, reason);
  },

  async getCourses(): Promise<Course[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_COURSES;
    }
    return apiFetch<Course[]>("/admin/courses");
  },

  async getQuestions(): Promise<Question[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_QUESTIONS;
    }
    return apiFetch<Question[]>("/admin/questions");
  },

  async getCoupons(): Promise<Coupon[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_COUPONS;
    }
    return apiFetch<Coupon[]>("/admin/coupons");
  },

  async createCoupon(data: Omit<Coupon, "id" | "usedCount">): Promise<Coupon> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const newCoupon: Coupon = {
        id: Date.now(),
        usedCount: 0,
        ...data,
      };
      MOCK_COUPONS.unshift(newCoupon);
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "coupon.create",
        entityType: "Coupon",
        entityId: newCoupon.id,
        summary: `Created promo coupon "${newCoupon.code}" (${newCoupon.type === "percent" ? `${newCoupon.value}%` : `Rs ${newCoupon.value}`} off)`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return newCoupon;
    }
    return apiFetch<Coupon>("/admin/coupons", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCoupon(id: number, data: Partial<Coupon>): Promise<Coupon> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const idx = MOCK_COUPONS.findIndex((c) => c.id === id);
      if (idx !== -1) {
        MOCK_COUPONS[idx] = { ...MOCK_COUPONS[idx], ...data };
        return MOCK_COUPONS[idx];
      }
      return MOCK_COUPONS[0];
    }
    return apiFetch<Coupon>(`/admin/coupons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteCoupon(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const idx = MOCK_COUPONS.findIndex((c) => c.id === id);
      if (idx !== -1) {
        MOCK_COUPONS.splice(idx, 1);
      }
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/coupons/${id}`, { method: "DELETE" });
  },

  async toggleCouponActive(id: number): Promise<Coupon> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const coupon = MOCK_COUPONS.find((c) => c.id === id);
      if (coupon) {
        coupon.isActive = !coupon.isActive;
        return coupon;
      }
      return MOCK_COUPONS[0];
    }
    return apiFetch<Coupon>(`/admin/coupons/${id}/toggle`, { method: "POST" });
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_AUDIT_LOGS;
    }
    return apiFetch<AuditLog[]>("/admin/audit-logs");
  },

  // Courses endpoints
  async createCourse(data: Partial<Course>): Promise<Course> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const newCourse: Course = {
        id: Date.now(),
        title: data.title || "Untitled Course",
        slug: data.slug || `course-${Date.now()}`,
        examCategory: data.examCategory || "NRE1",
        shortDescription: data.shortDescription || data.description?.slice(0, 100) || "",
        description: data.description || "",
        thumbnailUrl: data.thumbnailUrl || "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
        price: data.price || 15000,
        currency: "PKR",
        validityDays: data.validityDays || 180,
        includesQBank: true,
        isPublished: data.isPublished !== undefined ? data.isPublished : true,
        sortOrder: MOCK_COURSES.length + 1,
        sectionsCount: 0,
        lecturesCount: 0,
      };
      MOCK_COURSES.unshift(newCourse);
      return newCourse;
    }
    return apiFetch<Course>("/admin/courses", { method: "POST", body: JSON.stringify(data) });
  },

  async updateCourse(id: number, data: Partial<Course>): Promise<Course> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const idx = MOCK_COURSES.findIndex((c) => c.id === id);
      if (idx !== -1) {
        MOCK_COURSES[idx] = { ...MOCK_COURSES[idx], ...data };
        return MOCK_COURSES[idx];
      }
      return MOCK_COURSES[0];
    }
    return apiFetch<Course>(`/admin/courses/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteCourse(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const idx = MOCK_COURSES.findIndex((c) => c.id === id);
      if (idx !== -1) MOCK_COURSES.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/courses/${id}`, { method: "DELETE" });
  },

  async publishCourse(id: number): Promise<Course> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const course = MOCK_COURSES.find((c) => c.id === id);
      if (course) course.isPublished = true;
      return course || MOCK_COURSES[0];
    }
    return apiFetch<Course>(`/admin/courses/${id}/publish`, { method: "POST" });
  },

  async unpublishCourse(id: number): Promise<Course> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const course = MOCK_COURSES.find((c) => c.id === id);
      if (course) course.isPublished = false;
      return course || MOCK_COURSES[0];
    }
    return apiFetch<Course>(`/admin/courses/${id}/unpublish`, { method: "POST" });
  },

  async getCourseSections(courseId: number): Promise<CourseSection[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_SECTIONS.filter((s) => s.courseId === Number(courseId));
    }
    return apiFetch<CourseSection[]>(`/admin/courses/${courseId}/sections`);
  },

  // --- Granular curriculum builder endpoints -------------------------------
  // The real backend (server/src/routes/v1/admin/courses.js) has no bulk
  // "save the whole curriculum" endpoint — only per-item CRUD plus two
  // separate reorder endpoints. client/src/pages/admin/curriculumDiff.ts
  // diffs the Curriculum Builder's local editor state against what it
  // loaded and calls these one at a time. See DECISIONS.md (Phase 4.3).
  async createSection(courseId: number, data: { title: string; sortOrder?: number }): Promise<CourseSection> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const newSec: CourseSection = {
        id: Date.now(),
        courseId: Number(courseId),
        title: data.title,
        sortOrder: data.sortOrder ?? MOCK_SECTIONS.filter((s) => s.courseId === Number(courseId)).length,
        lectures: [],
      };
      MOCK_SECTIONS.push(newSec);
      return newSec;
    }
    return apiFetch<CourseSection>(`/admin/courses/${courseId}/sections`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateSection(id: number, data: Partial<Pick<CourseSection, "title" | "sortOrder">>): Promise<CourseSection> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const sec = MOCK_SECTIONS.find((s) => s.id === id);
      if (sec) Object.assign(sec, data);
      return sec || MOCK_SECTIONS[0];
    }
    return apiFetch<CourseSection>(`/admin/sections/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteSection(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const idx = MOCK_SECTIONS.findIndex((s) => s.id === id);
      if (idx !== -1) MOCK_SECTIONS.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/sections/${id}`, { method: "DELETE" });
  },

  async reorderSections(courseId: number, orderedIds: number[]): Promise<CourseSection[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      orderedIds.forEach((id, idx) => {
        const s = MOCK_SECTIONS.find((sec) => sec.id === id);
        if (s) s.sortOrder = idx;
      });
      return MOCK_SECTIONS.filter((s) => s.courseId === Number(courseId)).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return apiFetch<CourseSection[]>(`/admin/courses/${courseId}/sections/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ orderedIds }),
    });
  },

  async createLecture(
    sectionId: number,
    data: {
      title: string;
      videoProvider?: Lecture["videoProvider"];
      videoRef?: string | null;
      durationSeconds?: number;
      isFreePreview?: boolean;
      isPublished?: boolean;
      sortOrder?: number;
    }
  ): Promise<Lecture> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const sec = MOCK_SECTIONS.find((s) => s.id === sectionId);
      const newLec: Lecture = {
        id: Date.now(),
        courseId: sec?.courseId || 0,
        sectionId,
        title: data.title,
        videoProvider: data.videoProvider || "bunny",
        videoRef: data.videoRef || "",
        durationSeconds: data.durationSeconds || 0,
        isFreePreview: data.isFreePreview || false,
        isPublished: data.isPublished !== undefined ? data.isPublished : true,
        sortOrder: data.sortOrder ?? sec?.lectures?.length ?? 0,
      };
      if (sec) {
        sec.lectures = [...(sec.lectures || []), newLec];
      }
      return newLec;
    }
    return apiFetch<Lecture>(`/admin/sections/${sectionId}/lectures`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateLecture(
    id: number,
    data: Partial<
      Pick<Lecture, "title" | "videoRef" | "videoProvider" | "durationSeconds" | "isFreePreview" | "isPublished" | "sortOrder">
    >
  ): Promise<Lecture> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      for (const sec of MOCK_SECTIONS) {
        const lec = sec.lectures?.find((l) => l.id === id);
        if (lec) {
          Object.assign(lec, data);
          return lec;
        }
      }
      throw new Error("Lecture not found");
    }
    return apiFetch<Lecture>(`/admin/lectures/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteLecture(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      for (const sec of MOCK_SECTIONS) {
        if (sec.lectures) {
          const idx = sec.lectures.findIndex((l) => l.id === id);
          if (idx !== -1) {
            sec.lectures.splice(idx, 1);
            break;
          }
        }
      }
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/lectures/${id}`, { method: "DELETE" });
  },

  async reorderLectures(sectionId: number, orderedIds: number[]): Promise<Lecture[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const sec = MOCK_SECTIONS.find((s) => s.id === sectionId);
      if (sec?.lectures) {
        orderedIds.forEach((id, idx) => {
          const l = sec.lectures!.find((lec) => lec.id === id);
          if (l) l.sortOrder = idx;
        });
        sec.lectures.sort((a, b) => a.sortOrder - b.sortOrder);
        return sec.lectures;
      }
      return [];
    }
    return apiFetch<Lecture[]>(`/admin/sections/${sectionId}/lectures/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ orderedIds }),
    });
  },

  // --- Uploads ---------------------------------------------------------------
  async uploadImage(file: File): Promise<{ url: string; mime: string; size: number }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 500);
      return { url: URL.createObjectURL(file), mime: file.type, size: file.size };
    }
    const form = new FormData();
    form.append("file", file);
    return apiUpload<{ url: string; mime: string; size: number }>("/admin/uploads/image", form);
  },

  // Question Bank Endpoints
  async createQuestion(data: Omit<Question, "id">): Promise<Question> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const newQ: Question = {
        id: Date.now(),
        ...data,
      };
      MOCK_QUESTIONS.unshift(newQ);
      return newQ;
    }
    return apiFetch<Question>("/admin/questions", { method: "POST", body: JSON.stringify(data) });
  },

  async updateQuestion(id: number, data: Partial<Question>): Promise<Question> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const idx = MOCK_QUESTIONS.findIndex((q) => q.id === id);
      if (idx !== -1) {
        MOCK_QUESTIONS[idx] = { ...MOCK_QUESTIONS[idx], ...data };
        return MOCK_QUESTIONS[idx];
      }
      return MOCK_QUESTIONS[0];
    }
    return apiFetch<Question>(`/admin/questions/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteQuestion(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const idx = MOCK_QUESTIONS.findIndex((q) => q.id === id);
      if (idx !== -1) MOCK_QUESTIONS.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/questions/${id}`, { method: "DELETE" });
  },

  async dryRunCsvImport(parsedRows: any[]): Promise<{
    validCount: number;
    errorCount: number;
    validRows: any[];
    errorRows: { rowNumber: number; snippet: string; reason: string }[];
  }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      const validRows: any[] = [];
      const errorRows: { rowNumber: number; snippet: string; reason: string }[] = [];

      parsedRows.forEach((row, idx) => {
        const rowNum = idx + 1;
        const stem = row.stem || row.vignette || row.question || "";
        const options = [row.optionA, row.optionB, row.optionC, row.optionD].filter(Boolean);
        const correctOpt = row.correctOption || row.correct;

        if (!stem || stem.trim().length < 10) {
          errorRows.push({
            rowNumber: rowNum,
            snippet: stem ? stem.slice(0, 40) + "..." : "[Empty stem]",
            reason: "Vignette stem is missing or too short (< 10 characters).",
          });
        } else if (options.length < 2) {
          errorRows.push({
            rowNumber: rowNum,
            snippet: stem.slice(0, 40) + "...",
            reason: "At least 2 options (A & B) are required.",
          });
        } else if (!correctOpt || !["A", "B", "C", "D", "1", "2", "3", "4"].includes(String(correctOpt).trim().toUpperCase())) {
          errorRows.push({
            rowNumber: rowNum,
            snippet: stem.slice(0, 40) + "...",
            reason: "Missing or invalid correct answer selection (must be A, B, C, or D).",
          });
        } else if (row.subjectName && !["Anatomy", "Physiology", "Biochemistry", "Pathology", "Pharmacology", "Microbiology", "Medicine", "Surgery", "Gynae & Obs"].includes(row.subjectName.trim())) {
          errorRows.push({
            rowNumber: rowNum,
            snippet: stem.slice(0, 40) + "...",
            reason: `Unknown Subject "${row.subjectName}". Must match active taxonomy.`,
          });
        } else {
          validRows.push({
            id: Date.now() + idx,
            examCategory: row.examCategory || "NRE1",
            subjectId: 1,
            subjectName: row.subjectName || "Anatomy",
            systemId: 1,
            systemName: row.systemName || "Cardiovascular System",
            stem: stem,
            difficulty: (row.difficulty || "medium").toLowerCase(),
            explanation: row.explanation || "Correct answer explanation rationale.",
            isActive: true,
            options: [
              { id: 1, questionId: 0, optionText: row.optionA || "Option A", isCorrect: String(correctOpt).trim().toUpperCase() === "A", sortOrder: 1 },
              { id: 2, questionId: 0, optionText: row.optionB || "Option B", isCorrect: String(correctOpt).trim().toUpperCase() === "B", sortOrder: 2 },
              { id: 3, questionId: 0, optionText: row.optionC || "Option C", isCorrect: String(correctOpt).trim().toUpperCase() === "C", sortOrder: 3 },
              { id: 4, questionId: 0, optionText: row.optionD || "Option D", isCorrect: String(correctOpt).trim().toUpperCase() === "D", sortOrder: 4 },
            ],
          });
        }
      });

      return {
        validCount: validRows.length,
        errorCount: errorRows.length,
        validRows,
        errorRows,
      };
    }
    return apiFetch("/admin/questions/import/dry-run", { method: "POST", body: JSON.stringify({ parsedRows }) });
  },

  async commitCsvImport(validRows: Question[]): Promise<{ importedCount: number }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 500);
      MOCK_QUESTIONS.unshift(...validRows);
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "qbank.bulk_import",
        entityType: "QBank",
        summary: `Imported ${validRows.length} clinical questions via CSV batch upload`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return { importedCount: validRows.length };
    }
    return apiFetch("/admin/questions/import/commit", { method: "POST", body: JSON.stringify({ validRows }) });
  },

  // Mock Exams Endpoints
  async getMockExams(): Promise<MockExam[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return [
        MOCK_EXAM_PAPER,
        {
          id: 202,
          title: "SMLE National Benchmark Grand Test 2026",
          examCategory: "SMLE",
          durationMinutes: 90,
          passPercent: 65,
          isPublished: true,
          questionsCount: 40,
        },
      ];
    }
    return apiFetch<MockExam[]>("/admin/mock-exams");
  },

  async createMockExam(data: Partial<MockExam>): Promise<MockExam> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const newExam: MockExam = {
        id: Date.now(),
        title: data.title || "Untitled Grand Mock Exam",
        examCategory: data.examCategory || "NRE1",
        durationMinutes: data.durationMinutes || 60,
        passPercent: data.passPercent || 60,
        isPublished: data.isPublished !== undefined ? data.isPublished : true,
        questionsCount: data.questionsCount || 50,
      };
      return newExam;
    }
    return apiFetch<MockExam>("/admin/mock-exams", { method: "POST", body: JSON.stringify(data) });
  },

  /** `GET /admin/mock-exams/:id` — the only response that includes the full ordered `questionIds`
   * sequence (server/src/services/adminMockExamService.js#getMockExamById); the list endpoint above omits
   * it. The Mock Exam Builder's question-picker tab loads its initial selection from this call, never from
   * a client-side guess (e.g. "first N questions"). */
  async getMockExamById(id: number): Promise<MockExam> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      const found = [MOCK_EXAM_PAPER].find((e) => e.id === id) || MOCK_EXAM_PAPER;
      return { ...found, questionIds: MOCK_QUESTIONS.slice(0, found.questionsCount).map((q) => q.id) };
    }
    return apiFetch<MockExam>(`/admin/mock-exams/${id}`);
  },

  async updateMockExam(id: number, data: Partial<MockExam>): Promise<MockExam> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return { id, questionsCount: 0, title: "", examCategory: "NRE1", durationMinutes: 60, passPercent: 60, isPublished: true, ...data } as MockExam;
    }
    return apiFetch<MockExam>(`/admin/mock-exams/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteMockExam(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/mock-exams/${id}`, { method: "DELETE" });
  },

  async publishMockExam(id: number): Promise<MockExam> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return this.getMockExamById(id).then((e) => ({ ...e, isPublished: true }));
    }
    return apiFetch<MockExam>(`/admin/mock-exams/${id}/publish`, { method: "POST" });
  },

  async unpublishMockExam(id: number): Promise<MockExam> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return this.getMockExamById(id).then((e) => ({ ...e, isPublished: false }));
    }
    return apiFetch<MockExam>(`/admin/mock-exams/${id}/unpublish`, { method: "POST" });
  },

  /** `PUT /admin/mock-exams/:id/questions` — a full, transactional REPLACE of the paper's whole ordered
   * question set (server/src/services/adminMockExamService.js#replaceMockExamQuestions), not granular
   * per-item CRUD like Phase 4's curriculum sections/lectures — so the caller always sends the complete
   * current ordered id list, never a diff. Rejects (422, `{missingIds, inactiveIds}`) if ANY id is unknown
   * or inactive — the whole request fails together, nothing is silently dropped. */
  async replaceMockExamQuestions(id: number, questionIds: number[]): Promise<MockExam> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      return this.getMockExamById(id).then((e) => ({ ...e, questionIds, questionsCount: questionIds.length }));
    }
    return apiFetch<MockExam>(`/admin/mock-exams/${id}/questions`, {
      method: "PUT",
      body: JSON.stringify({ questionIds }),
    });
  },

  // Taxonomy Endpoints
  async getTaxonomy(): Promise<{ subjects: Subject[]; systems: BodySystem[] }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return {
        subjects: MOCK_SUBJECTS,
        systems: MOCK_SYSTEMS,
      };
    }
    return apiFetch<{ subjects: Subject[]; systems: BodySystem[] }>("/admin/taxonomy");
  },

  async createSubject(name: string): Promise<Subject> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const newSub: Subject = {
        id: Date.now(),
        name,
        sortOrder: MOCK_SUBJECTS.length + 1,
        questionsCount: 0,
      };
      MOCK_SUBJECTS.push(newSub);
      return newSub;
    }
    return apiFetch<Subject>("/admin/taxonomy/subjects", { method: "POST", body: JSON.stringify({ name }) });
  },

  async updateSubject(id: number, name: string): Promise<Subject> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const sub = MOCK_SUBJECTS.find((s) => s.id === id);
      if (sub) sub.name = name;
      return sub || MOCK_SUBJECTS[0];
    }
    return apiFetch<Subject>(`/admin/taxonomy/subjects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  },

  async deleteSubject(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const idx = MOCK_SUBJECTS.findIndex((s) => s.id === id);
      if (idx !== -1) MOCK_SUBJECTS.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/taxonomy/subjects/${id}`, { method: "DELETE" });
  },

  async createSystem(name: string): Promise<BodySystem> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const newSys: BodySystem = {
        id: Date.now(),
        name,
        sortOrder: MOCK_SYSTEMS.length + 1,
        questionsCount: 0,
      };
      MOCK_SYSTEMS.push(newSys);
      return newSys;
    }
    return apiFetch<BodySystem>("/admin/taxonomy/systems", { method: "POST", body: JSON.stringify({ name }) });
  },

  async updateSystem(id: number, name: string): Promise<BodySystem> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const sys = MOCK_SYSTEMS.find((s) => s.id === id);
      if (sys) sys.name = name;
      return sys || MOCK_SYSTEMS[0];
    }
    return apiFetch<BodySystem>(`/admin/taxonomy/systems/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  },

  async deleteSystem(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const idx = MOCK_SYSTEMS.findIndex((s) => s.id === id);
      if (idx !== -1) MOCK_SYSTEMS.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/taxonomy/systems/${id}`, { method: "DELETE" });
  },

  // Announcements Endpoints
  async getAnnouncements(): Promise<Announcement[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_ANNOUNCEMENTS;
    }
    return apiFetch<Announcement[]>("/admin/announcements");
  },

  async createAnnouncement(data: Omit<Announcement, "id" | "createdAt">): Promise<Announcement> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const newAnn: Announcement = {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        ...data,
      };
      MOCK_ANNOUNCEMENTS.unshift(newAnn);

      // PUSH TO STUDENT MOCK NOTIFICATIONS
      MOCK_NOTIFICATIONS.unshift({
        id: Date.now() + 1,
        userId: 1, // Student demo account
        type: "announcement",
        title: data.title,
        body: data.body,
        link: data.courseId ? `/app/courses/${data.courseId}` : "/app/dashboard",
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      // LOG TO AUDIT LOG
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now() + 2,
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "announcement.broadcast",
        entityType: "Announcement",
        entityId: newAnn.id,
        summary: `Broadcasted announcement "${newAnn.title}" to ${newAnn.audience === "all" ? "All Students" : `Course #${newAnn.courseId}`}${newAnn.sendEmail ? " (+ Email Notification)" : ""}`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });

      return newAnn;
    }
    return apiFetch<Announcement>("/admin/announcements", { method: "POST", body: JSON.stringify(data) });
  },

  async deleteAnnouncement(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      const idx = MOCK_ANNOUNCEMENTS.findIndex((a) => a.id === id);
      if (idx !== -1) MOCK_ANNOUNCEMENTS.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/announcements/${id}`, { method: "DELETE" });
  },

  // Faculty Endpoints
  async getFaculty(): Promise<FacultyMember[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return [...MOCK_FACULTY].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return apiFetch<FacultyMember[]>("/admin/faculty");
  },

  async createFaculty(data: Omit<FacultyMember, "id">): Promise<FacultyMember> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const member: FacultyMember = { id: Date.now(), ...data };
      MOCK_FACULTY.push(member);
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "faculty.create",
        entityType: "FacultyMember",
        entityId: member.id,
        summary: `Added faculty profile for ${member.name} (${member.title})`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return member;
    }
    return apiFetch<FacultyMember>("/admin/faculty", { method: "POST", body: JSON.stringify(data) });
  },

  async updateFaculty(id: number, data: Partial<FacultyMember>): Promise<FacultyMember> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const idx = MOCK_FACULTY.findIndex((f) => f.id === id);
      if (idx !== -1) {
        MOCK_FACULTY[idx] = { ...MOCK_FACULTY[idx], ...data };
        return MOCK_FACULTY[idx];
      }
      return MOCK_FACULTY[0];
    }
    return apiFetch<FacultyMember>(`/admin/faculty/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteFaculty(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      const idx = MOCK_FACULTY.findIndex((f) => f.id === id);
      if (idx !== -1) MOCK_FACULTY.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/faculty/${id}`, { method: "DELETE" });
  },

  async reorderFaculty(items: FacultyMember[]): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      items.forEach((item, index) => {
        const found = MOCK_FACULTY.find((f) => f.id === item.id);
        if (found) found.sortOrder = index + 1;
      });
      return { success: true };
    }
    return apiFetch<{ success: boolean }>("/admin/faculty/reorder", { method: "PUT", body: JSON.stringify({ items }) });
  },

  // FAQs Endpoints
  async getFaqs(): Promise<FAQ[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return [...MOCK_FAQS].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return apiFetch<FAQ[]>("/admin/faqs");
  },

  async createFaq(data: Omit<FAQ, "id">): Promise<FAQ> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const faq: FAQ = { id: Date.now(), ...data };
      MOCK_FAQS.push(faq);
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "faq.create",
        entityType: "FAQ",
        entityId: faq.id,
        summary: `Created FAQ item: "${faq.question.slice(0, 40)}..."`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return faq;
    }
    return apiFetch<FAQ>("/admin/faqs", { method: "POST", body: JSON.stringify(data) });
  },

  async updateFaq(id: number, data: Partial<FAQ>): Promise<FAQ> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const idx = MOCK_FAQS.findIndex((f) => f.id === id);
      if (idx !== -1) {
        MOCK_FAQS[idx] = { ...MOCK_FAQS[idx], ...data };
        return MOCK_FAQS[idx];
      }
      return MOCK_FAQS[0];
    }
    return apiFetch<FAQ>(`/admin/faqs/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteFaq(id: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      const idx = MOCK_FAQS.findIndex((f) => f.id === id);
      if (idx !== -1) MOCK_FAQS.splice(idx, 1);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>(`/admin/faqs/${id}`, { method: "DELETE" });
  },

  async reorderFaqs(items: FAQ[]): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      items.forEach((item, index) => {
        const found = MOCK_FAQS.find((f) => f.id === item.id);
        if (found) found.sortOrder = index + 1;
      });
      return { success: true };
    }
    return apiFetch<{ success: boolean }>("/admin/faqs/reorder", { method: "PUT", body: JSON.stringify({ items }) });
  },

  // Contact Messages Endpoints
  async getContactMessages(): Promise<ContactMessage[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_CONTACT_MESSAGES;
    }
    return apiFetch<ContactMessage[]>("/admin/messages");
  },

  async updateContactMessageStatus(id: number, status: "new" | "read" | "replied"): Promise<ContactMessage> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const msg = MOCK_CONTACT_MESSAGES.find((m) => m.id === id);
      if (msg) msg.status = status;
      return msg || MOCK_CONTACT_MESSAGES[0];
    }
    return apiFetch<ContactMessage>(`/admin/messages/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  },

  // System Settings Endpoints
  async getSettings() {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return MOCK_SETTINGS;
    }
    return apiFetch<typeof MOCK_SETTINGS>("/admin/settings");
  },

  async updateSettings(section: string, data: any) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      (MOCK_SETTINGS as any)[section] = { ...(MOCK_SETTINGS as any)[section], ...data };
      MOCK_AUDIT_LOGS.unshift({
        id: Date.now(),
        actorUserId: 2,
        actorName: "Dr. Zabih Ullah (Admin)",
        action: "settings.update",
        entityType: "Settings",
        summary: `Updated system configuration settings section: "${section.toUpperCase()}"`,
        ip: "182.180.122.45",
        createdAt: new Date().toISOString(),
      });
      return (MOCK_SETTINGS as any)[section];
    }
    return apiFetch(`/admin/settings/${section}`, { method: "PUT", body: JSON.stringify(data) });
  },

  async sendTestEmail(email: string) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      return { success: true, message: `Test SMTP email dispatched successfully to ${email}` };
    }
    return apiFetch<{ success: boolean; message: string }>("/admin/settings/smtp/test", { method: "POST", body: JSON.stringify({ email }) });
  },

  // Analytics Reports Endpoints
  async getReportsData() {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return {
        revenueByMonth: [
          { month: "Jan 2026", revenue: 210000, ordersCount: 14 },
          { month: "Feb 2026", revenue: 345000, ordersCount: 23 },
          { month: "Mar 2026", revenue: 420000, ordersCount: 28 },
          { month: "Apr 2026", revenue: 380000, ordersCount: 25 },
          { month: "May 2026", revenue: 510000, ordersCount: 34 },
          { month: "Jun 2026", revenue: 460000, ordersCount: 31 },
          { month: "Jul 2026", revenue: 525000, ordersCount: 35 },
        ],
        enrollmentsByCourse: [
          { courseTitle: "NRE Step 1 Complete Preparation Masterclass", activeCount: 240, totalRevenue: 3600000 },
          { courseTitle: "SMLE High-Yield Crash Course", activeCount: 85, totalRevenue: 1530000 },
          { courseTitle: "MBBS Clinical Foundations", activeCount: 57, totalRevenue: 684000 },
        ],
        qbankUsage: {
          totalQuestionsAttempted: 14250,
          averagePassRate: 74.2,
          activePracticeCandidates: 312,
          topSubjectsAttempted: [
            { subject: "Pathology", attempts: 4120, avgScore: 78 },
            { subject: "Pharmacology", attempts: 3200, avgScore: 71 },
            { subject: "Physiology", attempts: 2850, avgScore: 76 },
            { subject: "Anatomy", attempts: 2410, avgScore: 69 },
            { subject: "Medicine", attempts: 1670, avgScore: 82 },
          ],
        },
        topStudents: MOCK_USERS.filter((u) => u.role === "student").map((u, idx) => ({
          studentId: u.id,
          name: u.name,
          email: u.email,
          testsTaken: 12 + idx * 3,
          qbankAccuracy: 88 - idx * 4,
          studyHours: 48 + idx * 6,
        })),
      };
    }
    return apiFetch<any>("/admin/reports");
  },
};

