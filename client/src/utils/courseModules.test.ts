import { describe, it, expect } from "vitest";
import { CourseSection, Lecture } from "../types";
import { buildModulesFromSections } from "./courseModules";

function lecture(overrides: Partial<Lecture> & { id: number; title: string }): Lecture {
  return {
    courseId: 1,
    sectionId: 1,
    videoProvider: "mock",
    videoRef: "mock-ref",
    durationSeconds: 0,
    isFreePreview: false,
    isPublished: true,
    sortOrder: 0,
    ...overrides,
  };
}

function section(overrides: Partial<CourseSection> & { id: number; title: string }): CourseSection {
  return {
    courseId: 1,
    sortOrder: 0,
    lectures: [],
    ...overrides,
  };
}

describe("buildModulesFromSections", () => {
  it("returns an empty array for an empty section list (course with no published curriculum yet)", () => {
    expect(buildModulesFromSections([])).toEqual([]);
  });

  it("maps a section's real id/title straight through to a ModuleProgress", () => {
    const sections = [section({ id: 10, title: "Module 1: Cardiology", lectures: [] })];
    const result = buildModulesFromSections(sections);
    expect(result).toEqual([{ id: 10, title: "Module 1: Cardiology", subSections: [] }]);
  });

  it("converts real per-lecture seconds fields into minutes, never fabricating a duration/watched value", () => {
    const sections = [
      section({
        id: 10,
        title: "Module 1",
        lectures: [
          lecture({
            id: 100,
            title: "MI & Ischemic Heart Disease",
            description: "ECG findings",
            durationSeconds: 2700, // 45 min
            watchedSeconds: 900, // 15 min
            isCompleted: false,
            isFreePreview: true,
          }),
        ],
      }),
    ];

    const [module] = buildModulesFromSections(sections);
    expect(module.subSections).toEqual([
      {
        id: 100,
        title: "MI & Ischemic Heart Disease",
        description: "ECG findings",
        durationMinutes: 45,
        watchedMinutes: 15,
        isCompleted: false,
        isFreePreview: true,
      },
    ]);
  });

  it("treats a lecture with no watch progress yet (watchedSeconds undefined) as 0 minutes watched, not NaN/undefined", () => {
    const sections = [
      section({
        id: 10,
        title: "Module 1",
        lectures: [lecture({ id: 101, title: "Unwatched Lecture", durationSeconds: 1200, watchedSeconds: undefined })],
      }),
    ];

    const [module] = buildModulesFromSections(sections);
    expect(module.subSections[0].watchedMinutes).toBe(0);
    expect(module.subSections[0].isCompleted).toBe(false);
  });

  it("coerces a missing/undefined isCompleted to false rather than leaving it undefined", () => {
    const sections = [
      section({
        id: 10,
        title: "Module 1",
        lectures: [lecture({ id: 102, title: "Lecture", isCompleted: undefined })],
      }),
    ];
    const [module] = buildModulesFromSections(sections);
    expect(module.subSections[0].isCompleted).toBe(false);
  });

  it("preserves multiple real sections/lectures in the same order the server returned them", () => {
    const sections = [
      section({
        id: 1,
        title: "Module 1",
        lectures: [
          lecture({ id: 1, title: "Lecture 1.1", durationSeconds: 600, watchedSeconds: 600, isCompleted: true }),
          lecture({ id: 2, title: "Lecture 1.2", durationSeconds: 600, watchedSeconds: 0 }),
        ],
      }),
      section({
        id: 2,
        title: "Module 2",
        lectures: [lecture({ id: 3, title: "Lecture 2.1", durationSeconds: 900, watchedSeconds: 450 })],
      }),
    ];

    const result = buildModulesFromSections(sections);
    expect(result.map((m) => m.id)).toEqual([1, 2]);
    expect(result[0].subSections.map((s) => s.id)).toEqual([1, 2]);
    expect(result[1].subSections.map((s) => s.id)).toEqual([3]);
    expect(result[0].subSections[0].isCompleted).toBe(true);
  });

  it("a section with no lectures published yet becomes a module with an empty subSections array", () => {
    const sections = [section({ id: 5, title: "Coming Soon Module", lectures: undefined })];
    const result = buildModulesFromSections(sections);
    expect(result).toEqual([{ id: 5, title: "Coming Soon Module", subSections: [] }]);
  });
});
