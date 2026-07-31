import { CONFIG } from "../../config";
import { apiFetch, mockLatency } from "../client";
import { Enrollment, Lecture, StudentDashboardStats } from "../../types";
import { MOCK_ACTIVITIES, MOCK_ANNOUNCEMENTS, MOCK_COURSES, MOCK_ENROLLMENTS, MOCK_NOTIFICATIONS, MOCK_SECTIONS } from "../../mock-data";

export const studentApi = {
  async getDashboardStats(): Promise<StudentDashboardStats> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      return {
        activeEnrollments: MOCK_ENROLLMENTS,
        continueWatching: {
          lecture: MOCK_SECTIONS[0].lectures![1],
          courseId: 1,
          courseTitle: "NRE Step 1 Complete Preparation Masterclass",
          watchedSeconds: 1500,
          durationSeconds: 3200,
        },
        studyHours7d: 18.5,
        studyHoursTotal: 64.2,
        qbankStats: {
          totalAttempted: 420,
          correctPercent: 76.5,
          activeStreakDays: 12,
          testsTakenCount: 14,
        },
        announcements: MOCK_ANNOUNCEMENTS,
        unreadNotificationsCount: MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length,
        recentActivity: MOCK_ACTIVITIES,
      };
    }
    return apiFetch<StudentDashboardStats>("/student/dashboard");
  },

  async getMyEnrollments(): Promise<Enrollment[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return MOCK_ENROLLMENTS;
    }
    return apiFetch<Enrollment[]>("/student/courses");
  },

  async getEnrolledCourseDetails(courseId: number) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      const course = MOCK_COURSES.find((c) => c.id === Number(courseId));
      const sections = MOCK_SECTIONS.filter((s) => s.courseId === Number(courseId));
      return {
        course,
        sections,
        progressPercent: 42,
      };
    }
    return apiFetch<any>(`/student/courses/${courseId}`);
  },

  /**
   * `isCurrentlyBookmarked` picks the HTTP verb — the real backend exposes
   * separate idempotent `POST` (add) / `DELETE` (remove) endpoints
   * (server/src/controllers/studentVideoController.js), not a single
   * "flip" call. See DECISIONS.md 2026-07-31 (Phase 5.4-5.5): the
   * previous version of this function always called POST regardless of
   * current state, which meant a bookmarked lecture could never actually
   * be un-bookmarked through this API surface.
   */
  async toggleLectureBookmark(lectureId: number, isCurrentlyBookmarked: boolean) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return { isBookmarked: !isCurrentlyBookmarked };
    }
    return apiFetch<{ isBookmarked: boolean }>(`/student/lectures/${lectureId}/bookmark`, {
      method: isCurrentlyBookmarked ? "DELETE" : "POST",
    });
  },

  async getBookmarkedLectures(): Promise<Lecture[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return [MOCK_SECTIONS[0].lectures![0]];
    }
    return apiFetch<Lecture[]>("/student/bookmarks/lectures");
  },
};
