import { CONFIG } from "../../config";
import { apiFetch, mockLatency } from "../client";
import { Course, FacultyMember, FAQ, Question } from "../../types";
import { MOCK_COURSES, MOCK_FACULTY, MOCK_FAQS, MOCK_QUESTIONS, MOCK_SECTIONS } from "../../mock-data";

export const publicApi = {
  async getHomeData() {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return {
        featuredCourses: MOCK_COURSES.filter((c) => c.isPublished),
        faculty: MOCK_FACULTY.filter((f) => f.isActive),
        faqs: MOCK_FAQS.slice(0, 4),
        stats: {
          studentsEnrolled: 8500,
          passRatePercent: 94.8,
          questionsInBank: 3200,
          videoLecturesCount: 450,
        },
      };
    }
    return apiFetch<any>("/public/home");
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
