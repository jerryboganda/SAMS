import { publicApi } from "./public";
import { Course, CourseSection } from "../../types";
import { MOCK_COURSES, MOCK_SECTIONS } from "../../mock-data";

export const coursesApi = {
  async getCourses(category?: string): Promise<Course[]> {
    return publicApi.getCourses(category);
  },

  async getCourseBySlug(slug: string): Promise<Course> {
    const res = await publicApi.getCourseBySlug(slug);
    return res.course;
  },

  async getCourseSections(courseId: number): Promise<CourseSection[]> {
    const sections = MOCK_SECTIONS.filter((s) => s.courseId === courseId);
    return sections.length > 0 ? sections : MOCK_SECTIONS;
  },
};
