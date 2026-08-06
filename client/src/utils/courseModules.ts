// client/src/utils/courseModules.ts
//
// Pure `sections[].lectures[]` → `ModuleProgress[]` transform (Phase 13.3
// Fix 6). `GET /student/courses/:courseId` (server/src/services/
// studentCourseService.js#getCourseCurriculum) already returns every real
// per-lecture field this needs — `durationSeconds`, `watchedSeconds`,
// `isCompleted`, `isFreePreview`, `title`, `description` — so no new backend
// field was required, only this client-side aggregation.
//
// Extracted out of CourseModuleBreakdown.tsx (a component file, not
// independently unit-testable via plain vitest without a DOM) so this pure
// mapping can be tested directly. Replaces the component's previous
// `DEFAULT_COURSE_MODULES` — a 100%-hardcoded fixture keyed by courseId that
// was shown regardless of which course/lectures the student actually had.
import { CourseSection } from "../types";

export interface SubSectionProgress {
  id: number;
  title: string;
  description?: string;
  durationMinutes: number;
  watchedMinutes: number;
  isCompleted: boolean;
  isFreePreview?: boolean;
}

export interface ModuleProgress {
  id: number;
  title: string;
  subSections: SubSectionProgress[];
}

export function buildModulesFromSections(sections: CourseSection[]): ModuleProgress[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    subSections: (section.lectures || []).map((lecture) => ({
      id: lecture.id,
      title: lecture.title,
      description: lecture.description,
      // Real fields are in seconds; SubSectionProgress (matching this component's
      // pre-existing shape) is expressed in minutes.
      durationMinutes: Math.round((lecture.durationSeconds || 0) / 60),
      watchedMinutes: Math.round((lecture.watchedSeconds || 0) / 60),
      isCompleted: !!lecture.isCompleted,
      isFreePreview: lecture.isFreePreview,
    })),
  }));
}
