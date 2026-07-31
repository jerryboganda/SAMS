// client/src/pages/admin/curriculumDiff.ts
//
// The real backend (server/src/routes/v1/admin/courses.js) has no bulk
// "save the whole curriculum" endpoint — only granular per-item CRUD
// (create/update/delete one section or lecture at a time) plus two separate
// reorder endpoints (`PATCH .../sections/reorder`, `PATCH .../lectures/
// reorder`, each expecting `{ orderedIds }` that must exactly match the
// current DB id set or 422s). CoursesManagementPage.tsx's Curriculum
// Builder keeps its existing drag/add/remove UX entirely client-side (no
// network calls while the modal is open, exactly like before this
// rewiring) — only "Save Curriculum Sequence" now has to translate the
// final in-memory tree into a sequence of granular API calls.
//
// `buildCurriculumPlan()` is a pure diff: given the section tree as it was
// loaded from the server (`original`) and the section tree as the admin has
// edited it (`current`), it decides what has to be created / updated /
// deleted / reordered. It has no side effects and no dependency on
// `adminApi`, so it's unit-testable in isolation (see
// curriculumDiff.test.ts) without mocking the network.
//
// `applyCurriculumPlan()` executes that plan against a real (or fake, for
// tests) API client, in this order — per CLAUDE.md's Phase 4.3 task brief:
//   1. delete removed sections first (cascade-deletes their lectures
//      server-side — see server/src/services/adminCourseService.js)
//   2. delete individually-removed lectures (in sections that survive)
//   3. create new sections (resolving temp ids -> real ids as they're
//      returned)
//   4. update changed existing sections (title only — order is handled by
//      the reorder call below, not by per-row sortOrder patches)
//   5. create new lectures (resolving temp ids -> real ids)
//   6. update changed existing lectures
//   7. reorder sections, once the section id set is fully settled
//   8. reorder lectures per section, once each section's lecture id set is
//      fully settled
// Deletes are ordered before creates, and every reorder call happens last,
// exactly as the task brief specifies.

import { CourseSection, Lecture } from "../../types";

let tempIdSeq = -1;

/**
 * A fresh, obviously-fake id for a section/lecture the admin just added in
 * the editor and that has never been persisted. Always negative — real DB
 * ids (MySQL AUTO_INCREMENT) are always positive, so a simple sign check
 * (`isTempId`) is enough to tell "new" from "existing" without maintaining
 * any separate bookkeeping on the section/lecture objects themselves.
 */
export function nextTempId(): number {
  return tempIdSeq--;
}

/** Test-only: makes generated temp ids deterministic across test runs. */
export function resetTempIdSeqForTests(start = -1): void {
  tempIdSeq = start;
}

export function isTempId(id: number): boolean {
  return id < 0;
}

export interface CurriculumPlan {
  deleteSectionIds: number[];
  deleteLectureIds: number[];
  createSections: Array<{ tempId: number; title: string }>;
  updateSections: Array<{ id: number; title: string }>;
  createLectures: Array<{
    tempId: number;
    /** Real id, or another section's tempId — resolved during apply. */
    sectionId: number;
    title: string;
    durationSeconds: number;
    videoRef: string | null;
    videoProvider: Lecture["videoProvider"];
    isFreePreview: boolean;
  }>;
  updateLectures: Array<{
    id: number;
    patch: Partial<Pick<Lecture, "title" | "durationSeconds" | "videoRef" | "isFreePreview">>;
  }>;
  /** Final section order, ids as they appear in `current` (temp ids included). */
  sectionOrder: number[];
  /** Final lecture order per section, keyed by the section's id in `current` (temp ids included). */
  lectureOrderBySection: Record<number, number[]>;
}

function diffLecturePatch(
  original: Lecture,
  current: Lecture
): CurriculumPlan["updateLectures"][number]["patch"] {
  const patch: CurriculumPlan["updateLectures"][number]["patch"] = {};
  if (original.title !== current.title) patch.title = current.title;
  if (original.durationSeconds !== current.durationSeconds) patch.durationSeconds = current.durationSeconds;
  if ((original.videoRef ?? null) !== (current.videoRef ?? null)) patch.videoRef = current.videoRef ?? null;
  if (!!original.isFreePreview !== !!current.isFreePreview) patch.isFreePreview = !!current.isFreePreview;
  return patch;
}

export function buildCurriculumPlan(original: CourseSection[], current: CourseSection[]): CurriculumPlan {
  const originalSectionById = new Map(original.map((s) => [s.id, s]));
  const currentSectionIds = new Set(current.map((s) => s.id));

  const deleteSectionIds = original.filter((s) => !currentSectionIds.has(s.id)).map((s) => s.id);

  const createSections: CurriculumPlan["createSections"] = [];
  const updateSections: CurriculumPlan["updateSections"] = [];
  const createLectures: CurriculumPlan["createLectures"] = [];
  const updateLectures: CurriculumPlan["updateLectures"] = [];
  const deleteLectureIds: number[] = [];
  const sectionOrder: number[] = [];
  const lectureOrderBySection: Record<number, number[]> = {};

  for (const sec of current) {
    sectionOrder.push(sec.id);
    const origSec = originalSectionById.get(sec.id);
    const isNewSection = isTempId(sec.id) || !origSec;

    if (isNewSection) {
      createSections.push({ tempId: sec.id, title: sec.title });
    } else if (origSec.title !== sec.title) {
      updateSections.push({ id: sec.id, title: sec.title });
    }

    const currentLectures = sec.lectures || [];
    // A whole-section delete cascades its lectures server-side (see
    // assertSectionDeletable/CourseSection.destroy in
    // adminCourseService.js), so per-lecture deletes only matter for
    // sections that are staying — `sec` is in `current` by construction,
    // so it always survives here.
    const originalLectures = !isNewSection && origSec ? origSec.lectures || [] : [];
    const originalLectureById = new Map(originalLectures.map((l) => [l.id, l]));
    const currentLectureIds = new Set(currentLectures.map((l) => l.id));

    for (const origLec of originalLectures) {
      if (!currentLectureIds.has(origLec.id)) {
        deleteLectureIds.push(origLec.id);
      }
    }

    const lecOrder: number[] = [];
    for (const lec of currentLectures) {
      lecOrder.push(lec.id);
      const origLec = originalLectureById.get(lec.id);
      const isNewLecture = isTempId(lec.id) || !origLec;

      if (isNewLecture) {
        createLectures.push({
          tempId: lec.id,
          sectionId: sec.id,
          title: lec.title,
          durationSeconds: lec.durationSeconds,
          videoRef: lec.videoRef ?? null,
          videoProvider: lec.videoProvider || "bunny",
          isFreePreview: !!lec.isFreePreview,
        });
      } else if (origLec) {
        const patch = diffLecturePatch(origLec, lec);
        if (Object.keys(patch).length > 0) {
          updateLectures.push({ id: lec.id, patch });
        }
      }
    }
    lectureOrderBySection[sec.id] = lecOrder;
  }

  return {
    deleteSectionIds,
    deleteLectureIds,
    createSections,
    updateSections,
    createLectures,
    updateLectures,
    sectionOrder,
    lectureOrderBySection,
  };
}

/**
 * Minimal structural subset of `adminApi` this module depends on — lets
 * tests pass a fake/mock client without importing the real one (and lets
 * `adminApi` itself be passed directly at the call site, since it already
 * satisfies this shape).
 */
export interface CurriculumApiClient {
  createSection: (courseId: number, data: { title: string; sortOrder?: number }) => Promise<CourseSection>;
  updateSection: (id: number, data: { title?: string; sortOrder?: number }) => Promise<CourseSection>;
  deleteSection: (id: number) => Promise<{ success: boolean }>;
  reorderSections: (courseId: number, orderedIds: number[]) => Promise<CourseSection[]>;
  createLecture: (
    sectionId: number,
    data: {
      title: string;
      videoProvider?: Lecture["videoProvider"];
      videoRef?: string | null;
      durationSeconds?: number;
      isFreePreview?: boolean;
      isPublished?: boolean;
    }
  ) => Promise<Lecture>;
  updateLecture: (
    id: number,
    data: Partial<Pick<Lecture, "title" | "durationSeconds" | "videoRef" | "isFreePreview">>
  ) => Promise<Lecture>;
  deleteLecture: (id: number) => Promise<{ success: boolean }>;
  reorderLectures: (sectionId: number, orderedIds: number[]) => Promise<Lecture[]>;
  getCourseSections: (courseId: number) => Promise<CourseSection[]>;
}

export async function applyCurriculumPlan(
  courseId: number,
  plan: CurriculumPlan,
  api: CurriculumApiClient
): Promise<CourseSection[]> {
  // 1) Delete removed sections first (cascades their lectures server-side).
  // Every step below is deliberately sequential (not Promise.all) — the
  // whole point of this function is that later steps depend on ids
  // resolved by earlier ones (e.g. a new lecture needs its parent
  // section's just-created real id), and the task brief specifies a strict
  // delete-then-create-then-reorder ordering.
  for (const id of plan.deleteSectionIds) {
    await api.deleteSection(id);
  }

  // 2) Delete individually-removed lectures in sections that survive.
  for (const id of plan.deleteLectureIds) {
    await api.deleteLecture(id);
  }

  // 3) Create new sections, resolving temp ids -> real ids as we go.
  const sectionIdMap = new Map<number, number>();
  for (const { tempId, title } of plan.createSections) {
    const created = await api.createSection(courseId, { title });
    sectionIdMap.set(tempId, created.id);
  }

  // 4) Update changed existing sections (title only).
  for (const { id, title } of plan.updateSections) {
    await api.updateSection(id, { title });
  }

  const resolveSectionId = (id: number): number => (isTempId(id) ? sectionIdMap.get(id) ?? id : id);

  // 5) Create new lectures under their (possibly just-created) section.
  const lectureIdMap = new Map<number, number>();
  for (const lec of plan.createLectures) {
    const realSectionId = resolveSectionId(lec.sectionId);
    const created = await api.createLecture(realSectionId, {
      title: lec.title,
      durationSeconds: lec.durationSeconds,
      videoRef: lec.videoRef,
      videoProvider: lec.videoProvider,
      isFreePreview: lec.isFreePreview,
      isPublished: true,
    });
    lectureIdMap.set(lec.tempId, created.id);
  }

  // 6) Update changed existing lectures.
  for (const { id, patch } of plan.updateLectures) {
    await api.updateLecture(id, patch);
  }

  const resolveLectureId = (id: number): number => (isTempId(id) ? lectureIdMap.get(id) ?? id : id);

  // 7) Reorder sections, once the section id set is fully settled.
  const finalSectionOrder = plan.sectionOrder.map(resolveSectionId);
  if (finalSectionOrder.length > 0) {
    await api.reorderSections(courseId, finalSectionOrder);
  }

  // 8) Reorder lectures per section, once each section's id set is settled.
  for (const [sectionIdKey, lectureIds] of Object.entries(plan.lectureOrderBySection)) {
    const realSectionId = resolveSectionId(Number(sectionIdKey));
    const finalLectureOrder = lectureIds.map(resolveLectureId);
    if (finalLectureOrder.length > 0) {
      await api.reorderLectures(realSectionId, finalLectureOrder);
    }
  }

  // Return the authoritative, freshly-persisted state so the editor's local
  // (temp-id-laden) tree gets replaced with real ids/sortOrders from the DB.
  return api.getCourseSections(courseId);
}
