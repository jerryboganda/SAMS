import { describe, it, expect, beforeEach, vi } from "vitest";
import { CourseSection, Lecture } from "../../types";
import {
  buildCurriculumPlan,
  applyCurriculumPlan,
  nextTempId,
  resetTempIdSeqForTests,
  isTempId,
  CurriculumApiClient,
} from "./curriculumDiff";

function lecture(overrides: Partial<Lecture> & { id: number }): Lecture {
  return {
    courseId: 1,
    sectionId: 1,
    title: "Untitled Lecture",
    videoProvider: "bunny",
    videoRef: "ref-1",
    durationSeconds: 600,
    isFreePreview: false,
    isPublished: true,
    sortOrder: 0,
    ...overrides,
  };
}

function section(overrides: Partial<CourseSection> & { id: number }): CourseSection {
  return {
    courseId: 1,
    title: "Untitled Section",
    sortOrder: 0,
    lectures: [],
    ...overrides,
  };
}

beforeEach(() => {
  resetTempIdSeqForTests(-1);
});

describe("nextTempId / isTempId", () => {
  it("generates decreasing negative ids", () => {
    const a = nextTempId();
    const b = nextTempId();
    expect(a).toBe(-1);
    expect(b).toBe(-2);
    expect(isTempId(a)).toBe(true);
    expect(isTempId(b)).toBe(true);
  });

  it("treats any positive id (real DB id) as not-temp", () => {
    expect(isTempId(1)).toBe(false);
    expect(isTempId(9999)).toBe(false);
  });
});

describe("buildCurriculumPlan", () => {
  it("returns an all-empty plan when nothing changed", () => {
    const original = [
      section({ id: 1, title: "Section A", lectures: [lecture({ id: 10, sectionId: 1 })] }),
    ];
    const current = JSON.parse(JSON.stringify(original));

    const plan = buildCurriculumPlan(original, current);

    expect(plan.deleteSectionIds).toEqual([]);
    expect(plan.deleteLectureIds).toEqual([]);
    expect(plan.createSections).toEqual([]);
    expect(plan.updateSections).toEqual([]);
    expect(plan.createLectures).toEqual([]);
    expect(plan.updateLectures).toEqual([]);
    expect(plan.sectionOrder).toEqual([1]);
    expect(plan.lectureOrderBySection).toEqual({ 1: [10] });
  });

  it("detects a brand-new section with a brand-new lecture", () => {
    const original: CourseSection[] = [];
    const tempSectionId = nextTempId();
    const tempLectureId = nextTempId();
    const current = [
      section({
        id: tempSectionId,
        title: "New Section",
        lectures: [lecture({ id: tempLectureId, sectionId: tempSectionId, title: "New Lecture" })],
      }),
    ];

    const plan = buildCurriculumPlan(original, current);

    expect(plan.createSections).toEqual([{ tempId: tempSectionId, title: "New Section" }]);
    expect(plan.createLectures).toHaveLength(1);
    expect(plan.createLectures[0]).toMatchObject({
      tempId: tempLectureId,
      sectionId: tempSectionId,
      title: "New Lecture",
    });
    expect(plan.deleteSectionIds).toEqual([]);
    expect(plan.deleteLectureIds).toEqual([]);
    expect(plan.sectionOrder).toEqual([tempSectionId]);
  });

  it("detects a whole-section delete and does NOT also list its lectures as individual deletes (server cascades them)", () => {
    const original = [
      section({ id: 1, title: "Keep Me", lectures: [lecture({ id: 10, sectionId: 1 })] }),
      section({ id: 2, title: "Remove Me", lectures: [lecture({ id: 20, sectionId: 2 }), lecture({ id: 21, sectionId: 2 })] }),
    ];
    const current = [JSON.parse(JSON.stringify(original[0]))];

    const plan = buildCurriculumPlan(original, current);

    expect(plan.deleteSectionIds).toEqual([2]);
    expect(plan.deleteLectureIds).toEqual([]); // cascade — not individually deleted
    expect(plan.sectionOrder).toEqual([1]);
  });

  it("detects an individual lecture delete when its section survives", () => {
    const original = [
      section({
        id: 1,
        lectures: [lecture({ id: 10, sectionId: 1, title: "Stays" }), lecture({ id: 11, sectionId: 1, title: "Removed" })],
      }),
    ];
    const current = [
      section({ id: 1, lectures: [lecture({ id: 10, sectionId: 1, title: "Stays" })] }),
    ];

    const plan = buildCurriculumPlan(original, current);

    expect(plan.deleteSectionIds).toEqual([]);
    expect(plan.deleteLectureIds).toEqual([11]);
    expect(plan.lectureOrderBySection).toEqual({ 1: [10] });
  });

  it("detects a section title update", () => {
    const original = [section({ id: 1, title: "Old Title" })];
    const current = [section({ id: 1, title: "New Title" })];

    const plan = buildCurriculumPlan(original, current);

    expect(plan.updateSections).toEqual([{ id: 1, title: "New Title" }]);
    expect(plan.createSections).toEqual([]);
  });

  it("detects only the specific lecture fields that changed", () => {
    const original = [
      section({
        id: 1,
        lectures: [lecture({ id: 10, sectionId: 1, title: "Old", durationSeconds: 300, isFreePreview: false })],
      }),
    ];
    const current = [
      section({
        id: 1,
        lectures: [lecture({ id: 10, sectionId: 1, title: "Old", durationSeconds: 900, isFreePreview: false })],
      }),
    ];

    const plan = buildCurriculumPlan(original, current);

    expect(plan.updateLectures).toEqual([{ id: 10, patch: { durationSeconds: 900 } }]);
  });

  it("produces no update entry when a lecture is unchanged", () => {
    const original = [section({ id: 1, lectures: [lecture({ id: 10, sectionId: 1 })] })];
    const current = [section({ id: 1, lectures: [lecture({ id: 10, sectionId: 1 })] })];

    const plan = buildCurriculumPlan(original, current);

    expect(plan.updateLectures).toEqual([]);
  });

  it("captures reordering (sections and lectures) with no other changes", () => {
    const original = [
      section({ id: 1, lectures: [lecture({ id: 10, sectionId: 1 }), lecture({ id: 11, sectionId: 1 })] }),
      section({ id: 2, lectures: [] }),
    ];
    // Swap section order, and swap lecture order within section 1.
    const current = [
      section({ id: 2, lectures: [] }),
      section({ id: 1, lectures: [lecture({ id: 11, sectionId: 1 }), lecture({ id: 10, sectionId: 1 })] }),
    ];

    const plan = buildCurriculumPlan(original, current);

    expect(plan.createSections).toEqual([]);
    expect(plan.updateSections).toEqual([]);
    expect(plan.deleteSectionIds).toEqual([]);
    expect(plan.createLectures).toEqual([]);
    expect(plan.updateLectures).toEqual([]);
    expect(plan.sectionOrder).toEqual([2, 1]);
    expect(plan.lectureOrderBySection[1]).toEqual([11, 10]);
  });
});

describe("applyCurriculumPlan", () => {
  function makeFakeApi(overrides: Partial<CurriculumApiClient> = {}): CurriculumApiClient {
    return {
      createSection: vi.fn(async (_courseId, data) => section({ id: 100, title: data.title })),
      updateSection: vi.fn(async (id, data) => section({ id, title: data.title || "" })),
      deleteSection: vi.fn(async () => ({ success: true })),
      reorderSections: vi.fn(async () => []),
      createLecture: vi.fn(async (sectionId, data) => lecture({ id: 200, sectionId, title: data.title })),
      updateLecture: vi.fn(async (id, data) => lecture({ id, sectionId: 1, ...data })),
      deleteLecture: vi.fn(async () => ({ success: true })),
      reorderLectures: vi.fn(async () => []),
      getCourseSections: vi.fn(async () => []),
      ...overrides,
    };
  }

  it("calls deletes before creates, and reorders last", async () => {
    const callOrder: string[] = [];
    const api = makeFakeApi({
      deleteSection: vi.fn(async () => {
        callOrder.push("deleteSection");
        return { success: true };
      }),
      deleteLecture: vi.fn(async () => {
        callOrder.push("deleteLecture");
        return { success: true };
      }),
      createSection: vi.fn(async (_courseId, data) => {
        callOrder.push("createSection");
        return section({ id: 100, title: data.title });
      }),
      createLecture: vi.fn(async (sectionId, data) => {
        callOrder.push("createLecture");
        return lecture({ id: 200, sectionId, title: data.title });
      }),
      reorderSections: vi.fn(async () => {
        callOrder.push("reorderSections");
        return [];
      }),
      reorderLectures: vi.fn(async () => {
        callOrder.push("reorderLectures");
        return [];
      }),
    });

    const tempSectionId = nextTempId();
    const tempLectureId = nextTempId();
    const plan = buildCurriculumPlan(
      [section({ id: 5, lectures: [lecture({ id: 50, sectionId: 5 })] })],
      [
        section({
          id: tempSectionId,
          lectures: [lecture({ id: tempLectureId, sectionId: tempSectionId })],
        }),
      ]
    );

    await applyCurriculumPlan(1, plan, api);

    expect(callOrder.indexOf("deleteSection")).toBeLessThan(callOrder.indexOf("createSection"));
    expect(callOrder.indexOf("createSection")).toBeLessThan(callOrder.indexOf("createLecture"));
    expect(callOrder.indexOf("createLecture")).toBeLessThan(callOrder.indexOf("reorderSections"));
    expect(callOrder.indexOf("reorderSections")).toBeLessThan(callOrder.indexOf("reorderLectures"));
  });

  it("resolves a new section's temp id into its real id before creating lectures/reordering", async () => {
    const api = makeFakeApi({
      createSection: vi.fn(async (_courseId, data) => section({ id: 777, title: data.title })),
      createLecture: vi.fn(async (sectionId, data) => lecture({ id: 888, sectionId, title: data.title })),
    });

    const tempSectionId = nextTempId();
    const tempLectureId = nextTempId();
    const plan = buildCurriculumPlan(
      [],
      [
        section({
          id: tempSectionId,
          title: "Brand New",
          lectures: [lecture({ id: tempLectureId, sectionId: tempSectionId, title: "Brand New Lecture" })],
        }),
      ]
    );

    await applyCurriculumPlan(1, plan, api);

    // createLecture must be called with the REAL section id (777), not the temp id.
    expect(api.createLecture).toHaveBeenCalledWith(777, expect.objectContaining({ title: "Brand New Lecture" }));
    // reorderSections must be called with the real id too.
    expect(api.reorderSections).toHaveBeenCalledWith(1, [777]);
    // reorderLectures must be called against the real section id with the real lecture id.
    expect(api.reorderLectures).toHaveBeenCalledWith(777, [888]);
  });

  it("skips reorder calls for empty lecture lists", async () => {
    const api = makeFakeApi();
    const plan = buildCurriculumPlan(
      [section({ id: 1, lectures: [] })],
      [section({ id: 1, lectures: [] })]
    );

    await applyCurriculumPlan(1, plan, api);

    expect(api.reorderLectures).not.toHaveBeenCalled();
    // Sections list is non-empty, so reorderSections IS still called.
    expect(api.reorderSections).toHaveBeenCalledWith(1, [1]);
  });

  it("returns the freshly-fetched section list from the server as the new source of truth", async () => {
    const freshFromServer = [section({ id: 1, title: "Persisted" })];
    const api = makeFakeApi({
      getCourseSections: vi.fn(async () => freshFromServer),
    });
    const plan = buildCurriculumPlan([section({ id: 1 })], [section({ id: 1 })]);

    const result = await applyCurriculumPlan(1, plan, api);

    expect(result).toBe(freshFromServer);
  });
});
