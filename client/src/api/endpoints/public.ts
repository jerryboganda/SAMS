import { CONFIG } from "../../config";
import { apiFetch, mockLatency } from "../client";
import { Course, FacultyMember, FAQ, Question } from "../../types";
import { MOCK_COURSES, MOCK_FACULTY, MOCK_FAQS, MOCK_QUESTIONS, MOCK_SECTIONS } from "../../mock-data";

/** The 4 admin-editable content keys the backend Settings table exposes via
 * GET /public/pages/:key (server/src/config/constants.js PUBLIC_PAGE_KEYS). */
export type PageKey = "legal.privacy" | "legal.terms" | "legal.refund" | "site.about";

export interface PageContent {
  key: PageKey;
  title: string;
  content: string;
}

/** Shape of GET /public/home's response — field names match
 * server/src/services/publicService.js#getHome exactly (NOT the older
 * studentsEnrolled/passRatePercent/questionsInBank mock-only naming that
 * predates the real backend contract; see DECISIONS.md 2026-07-31). */
export interface HomeData {
  featuredCourses: Course[];
  faculty: FacultyMember[];
  faqs: FAQ[];
  stats: {
    coursesCount: number;
    questionsCount: number;
    facultyCount: number;
    videoLecturesCount: number;
  };
}

export const publicApi = {
  async getHomeData(): Promise<HomeData> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return {
        featuredCourses: MOCK_COURSES.filter((c) => c.isPublished),
        faculty: MOCK_FACULTY.filter((f) => f.isActive),
        faqs: MOCK_FAQS.slice(0, 4),
        stats: {
          coursesCount: MOCK_COURSES.filter((c) => c.isPublished).length,
          questionsCount: MOCK_QUESTIONS.length,
          facultyCount: MOCK_FACULTY.filter((f) => f.isActive).length,
          videoLecturesCount: 450,
        },
      };
    }
    return apiFetch<HomeData>("/public/home");
  },

  async getCourses(category?: string): Promise<Course[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      let list = MOCK_COURSES.filter((c) => c.isPublished);
      if (category && category !== "ALL") {
        list = list.filter((c) => c.examCategory === category);
      }
      return list;
    }
    const query = category ? `?category=${category}` : "";
    return apiFetch<Course[]>(`/public/courses${query}`);
  },

  async getCourseBySlug(slug: string): Promise<{ course: Course; sections: any[] }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      const course = MOCK_COURSES.find((c) => c.slug === slug || c.id === Number(slug));
      if (!course) {
        throw new Error("Course not found");
      }
      const sections = MOCK_SECTIONS.filter((s) => s.courseId === course.id);
      return { course, sections };
    }
    return apiFetch<{ course: Course; sections: any[] }>(`/public/courses/${slug}`);
  },

  async getFaculty(): Promise<FacultyMember[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_FACULTY;
    }
    return apiFetch<FacultyMember[]>("/public/faculty");
  },

  async getFAQs(): Promise<FAQ[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_FAQS;
    }
    return apiFetch<FAQ[]>("/public/faqs");
  },

  async getSampleQuestions(): Promise<Question[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return MOCK_QUESTIONS.slice(0, 5);
    }
    return apiFetch<Question[]>("/public/sample-questions");
  },

  async getPage(key: PageKey): Promise<PageContent> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const MOCK_PAGES: Record<PageKey, PageContent> = {
        "legal.privacy": {
          key: "legal.privacy",
          title: "Privacy Policy",
          content:
            "SAMS Academy collects only the information needed to provide course access, QBank practice, and payment processing. We do not sell personal data to third parties. Contact support for data-access or deletion requests.",
        },
        "legal.terms": {
          key: "legal.terms",
          title: "Terms & Conditions",
          content:
            "By using SAMS Academy you agree to use course and QBank content for personal exam preparation only, not for redistribution. Course access is granted for the validity period shown at purchase.",
        },
        "legal.refund": {
          key: "legal.refund",
          title: "Refund Policy",
          content:
            "Refund requests are reviewed on a case-by-case basis and must be submitted within 7 days of purchase, before significant course or QBank usage. Approved refunds are processed to the original payment method where possible.",
        },
        "site.about": {
          key: "site.about",
          title: "About SAMS Academy",
          content:
            "SAMS Academy is a medical exam-prep platform offering video courses, a QBank of practice questions, and timed mock exams for the NRE and related licensing exams.",
        },
      };
      return MOCK_PAGES[key];
    }
    return apiFetch<PageContent>(`/public/pages/${key}`);
  },

  async submitContactForm(data: { name: string; email: string; subject?: string; message: string }) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 500);
      return { success: true, message: "Thank you for contacting SAMS Academy. Our team will get back to you within 24 hours." };
    }
    return apiFetch<{ success: boolean; message: string }>("/public/contact", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
