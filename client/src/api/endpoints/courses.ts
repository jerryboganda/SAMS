import { publicApi } from "./public";
import { Course, CourseSection } from "../../types";

export const coursesApi = {
  async getCourses(category?: string): Promise<Course[]> {
    return publicApi.getCourses(category);
  },

  async getCourseBySlug(slug: string): Promise<Course> {
    const res = await publicApi.getCourseBySlug(slug);
    return res.course;
  },

  /**
   * Fetches the course AND its curriculum sections/lectures together, in a
   * single call — the real `GET /public/courses/:slug` endpoint already
   * returns both in one response (server/src/services/publicService.js
   * #getCourseBySlug). Previously `getCourseSections()` re-derived sections
   * from a separately-imported mock list keyed off `courseId`, which was
   * disconnected from whatever course had actually been fetched — see
   * DECISIONS.md 2026-07-31 (Phase 3.2-3.4).
   */
  async getCourseWithSections(slug: string): Promise<{ course: Course; sections: CourseSection[] }> {
    return publicApi.getCourseBySlug(slug);
  },
};
