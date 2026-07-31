import React, { useRef, useState, useEffect } from "react";
import {
  Plus,
  Edit,
  Trash2,
  BookOpen,
  GripVertical,
  Video,
  Eye,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Search,
  UploadCloud,
} from "lucide-react";
import { Card, Button, Input, Table, Badge, Modal, Toast, ConfirmDialog } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { ApiError } from "../../api/client";
import { Course, CourseSection, Lecture } from "../../types";
import { formatPKR } from "../../utils/formatters";
import { buildCurriculumPlan, applyCurriculumPlan, nextTempId } from "./curriculumDiff";

// Mock Bunny.net Video Library Assets
const BUNNY_LIBRARY_VIDEOS = [
  { id: "bun_cv_01", title: "Myocardial Infarction & ECG Waveform Interpretation", duration: "45 mins", size: "1.2 GB" },
  { id: "bun_cv_02", title: "Antihypertensive Pharmacology & RAAS Cascade", duration: "38 mins", size: "980 MB" },
  { id: "bun_ren_01", title: "Nephrotic vs Nephritic Syndrome Histopathology", duration: "52 mins", size: "1.5 GB" },
  { id: "bun_neuro_01", title: "Cranial Nerve Lesions & Localizing Brainstem Strokes", duration: "60 mins", size: "1.8 GB" },
  { id: "bun_path_01", title: "Cellular Injury, Apoptosis & Necrosis Mechanisms", duration: "42 mins", size: "1.1 GB" },
];

import { useAdminSearch } from "../../context/AdminSearchContext";

export const CoursesManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "danger" | "warning" | "info">("success");

  const showToast = (message: string, type: "success" | "danger" | "warning" | "info" = "success") => {
    setToastType(type);
    setToastMessage(message);
  };

  const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof ApiError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  };

  // Course Add/Edit Form State
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formCategory, setFormCategory] = useState<any>("NRE1");
  const [formPrice, setFormPrice] = useState("15000");
  const [formValidity, setFormValidity] = useState("180");
  const [formDescription, setFormDescription] = useState("");
  const [formThumbnail, setFormThumbnail] = useState("https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);

  // Course Delete Confirmation State
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [isDeletingCourse, setIsDeletingCourse] = useState(false);

  // Curriculum Builder State
  const [isCurriculumModalOpen, setIsCurriculumModalOpen] = useState(false);
  const [curriculumCourse, setCurriculumCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  // Snapshot of `sections` exactly as loaded from the server — diffed
  // against the (possibly heavily edited) `sections` state on save. See
  // curriculumDiff.ts.
  const [originalSections, setOriginalSections] = useState<CourseSection[]>([]);
  const [isSavingCurriculum, setIsSavingCurriculum] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");

  // Lecture Edit Modal State
  const [isLectureModalOpen, setIsLectureModalOpen] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<number | null>(null);
  const [editingLecture, setEditingLecture] = useState<Lecture | null>(null);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureDuration, setLectureDuration] = useState("30");
  const [lectureVideoRef, setLectureVideoRef] = useState("bun_cv_01");
  const [lectureIsFreePreview, setLectureIsFreePreview] = useState(false);
  const [videoVerified, setVideoVerified] = useState(false);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    setIsLoading(true);
    try {
      const data = await adminApi.getCourses();
      setCourses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCourseModal = (course?: Course) => {
    if (course) {
      setEditingCourse(course);
      setFormTitle(course.title);
      setFormSlug(course.slug);
      setFormCategory(course.examCategory);
      setFormPrice(String(course.price));
      setFormValidity(String(course.validityDays));
      setFormDescription(course.description);
      setFormThumbnail(course.thumbnailUrl);
      setFormIsPublished(course.isPublished);
    } else {
      setEditingCourse(null);
      setFormTitle("");
      setFormSlug("");
      setFormCategory("NRE1");
      setFormPrice("15000");
      setFormValidity("180");
      setFormDescription("");
      setFormThumbnail("https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80");
      setFormIsPublished(true);
    }
    setIsUploadingThumbnail(false);
    setIsCourseModalOpen(true);
  };

  const handleThumbnailFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingThumbnail(true);
    try {
      const uploaded = await adminApi.uploadImage(file);
      setFormThumbnail(uploaded.url);
      showToast("Thumbnail image uploaded successfully.", "success");
    } catch (err) {
      showToast(describeError(err, "Failed to upload thumbnail image."), "danger");
    } finally {
      setIsUploadingThumbnail(false);
      e.target.value = "";
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormTitle(val);
    if (!editingCourse) {
      setFormSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, "")
          .replace(/\s+/g, "-")
      );
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle) return;

    setIsSavingCourse(true);
    try {
      if (editingCourse) {
        const updated = await adminApi.updateCourse(editingCourse.id, {
          title: formTitle,
          slug: formSlug,
          examCategory: formCategory,
          price: Number(formPrice),
          validityDays: Number(formValidity),
          description: formDescription,
          thumbnailUrl: formThumbnail,
          isPublished: formIsPublished,
        });
        setCourses(courses.map((c) => (c.id === updated.id ? updated : c)));
        showToast(`Course "${updated.title}" updated successfully.`, "success");
      } else {
        const created = await adminApi.createCourse({
          title: formTitle,
          slug: formSlug || `course-${Date.now()}`,
          examCategory: formCategory,
          price: Number(formPrice),
          validityDays: Number(formValidity),
          description: formDescription,
          thumbnailUrl: formThumbnail,
          isPublished: formIsPublished,
        });
        setCourses([created, ...courses]);
        showToast(`New course "${created.title}" created successfully!`, "success");
      }
      setIsCourseModalOpen(false);
    } catch (err) {
      showToast(describeError(err, "Failed to save course. Please check the form and try again."), "danger");
    } finally {
      setIsSavingCourse(false);
    }
  };

  const handleTogglePublished = async (course: Course) => {
    const newStatus = !course.isPublished;
    try {
      const updated = newStatus ? await adminApi.publishCourse(course.id) : await adminApi.unpublishCourse(course.id);
      setCourses(courses.map((c) => (c.id === course.id ? updated : c)));
      showToast(`Course published status updated to ${newStatus ? "LIVE" : "DRAFT"}`, "success");
    } catch (err) {
      showToast(describeError(err, "Failed to update publish status."), "danger");
    }
  };

  const handleDeleteCourse = async () => {
    if (!courseToDelete) return;
    setIsDeletingCourse(true);
    try {
      await adminApi.deleteCourse(courseToDelete.id);
      setCourses(courses.filter((c) => c.id !== courseToDelete.id));
      showToast(`Course "${courseToDelete.title}" deleted.`, "success");
      setCourseToDelete(null);
    } catch (err) {
      // 409 CONFLICT (existing orders/enrollments) and any other failure
      // both surface the backend's own friendly message here rather than a
      // raw error — the confirm dialog stays open so the admin can read it
      // (a page-level Toast would be hidden behind the modal backdrop, same
      // convention as StudentsManagementPage's destructive-action confirms).
      alert(describeError(err, "Failed to delete course."));
    } finally {
      setIsDeletingCourse(false);
    }
  };

  // Open Curriculum Manager
  const handleOpenCurriculum = async (course: Course) => {
    setCurriculumCourse(course);
    setSections([]);
    setOriginalSections([]);
    setIsCurriculumModalOpen(true);
    try {
      const secData = await adminApi.getCourseSections(course.id);
      // Deep-clone so `sections` (the editable copy) and `originalSections`
      // (the diff baseline) never alias the same nested lecture arrays.
      setSections(JSON.parse(JSON.stringify(secData)));
      setOriginalSections(JSON.parse(JSON.stringify(secData)));
    } catch (err) {
      showToast(describeError(err, "Failed to load curriculum for this course."), "danger");
    }
  };

  const handleAddSection = () => {
    if (!newSectionTitle.trim()) return;
    const newSec: CourseSection = {
      id: nextTempId(),
      courseId: curriculumCourse?.id || 1,
      title: newSectionTitle,
      sortOrder: sections.length + 1,
      lectures: [],
    };
    setSections([...sections, newSec]);
    setNewSectionTitle("");
  };

  const handleDeleteSection = (secId: number) => {
    setSections(sections.filter((s) => s.id !== secId));
  };

  const handleMoveSection = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === sections.length - 1)) return;
    const newSecs = [...sections];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const temp = newSecs[index];
    newSecs[index] = newSecs[targetIdx];
    newSecs[targetIdx] = temp;
    setSections(newSecs);
  };

  // Lecture Add/Edit
  const handleOpenLectureModal = (sectionId: number, lecture?: Lecture) => {
    setCurrentSectionId(sectionId);
    if (lecture) {
      setEditingLecture(lecture);
      setLectureTitle(lecture.title);
      setLectureDuration(String(Math.round(lecture.durationSeconds / 60)));
      setLectureVideoRef(lecture.videoRef || "bun_cv_01");
      setLectureIsFreePreview(lecture.isFreePreview);
    } else {
      setEditingLecture(null);
      setLectureTitle("");
      setLectureDuration("30");
      setLectureVideoRef("bun_cv_01");
      setLectureIsFreePreview(false);
    }
    setVideoVerified(false);
    setIsLectureModalOpen(true);
  };

  const handleSaveLecture = () => {
    if (!lectureTitle || !currentSectionId) return;

    const durSec = Number(lectureDuration) * 60;
    const updatedSections = sections.map((sec) => {
      if (sec.id === currentSectionId) {
        const lecs = sec.lectures || [];
        if (editingLecture) {
          const updatedLecs = lecs.map((l) =>
            l.id === editingLecture.id
              ? {
                  ...l,
                  title: lectureTitle,
                  durationSeconds: durSec,
                  videoRef: lectureVideoRef,
                  isFreePreview: lectureIsFreePreview,
                }
              : l
          );
          return { ...sec, lectures: updatedLecs };
        } else {
          const newLec: Lecture = {
            id: nextTempId(),
            courseId: curriculumCourse?.id || 1,
            sectionId: currentSectionId,
            title: lectureTitle,
            videoProvider: "bunny",
            videoRef: lectureVideoRef,
            durationSeconds: durSec,
            isFreePreview: lectureIsFreePreview,
            isPublished: true,
            sortOrder: lecs.length + 1,
          };
          return { ...sec, lectures: [...lecs, newLec] };
        }
      }
      return sec;
    });

    setSections(updatedSections);
    setIsLectureModalOpen(false);
  };

  const handleMoveLecture = (sectionId: number, lecIndex: number, direction: "up" | "down") => {
    setSections(
      sections.map((sec) => {
        if (sec.id === sectionId && sec.lectures) {
          const lecs = [...sec.lectures];
          if ((direction === "up" && lecIndex === 0) || (direction === "down" && lecIndex === lecs.length - 1))
            return sec;
          const targetIdx = direction === "up" ? lecIndex - 1 : lecIndex + 1;
          const temp = lecs[lecIndex];
          lecs[lecIndex] = lecs[targetIdx];
          lecs[targetIdx] = temp;
          return { ...sec, lectures: lecs };
        }
        return sec;
      })
    );
  };

  const handleDeleteLecture = (sectionId: number, lecId: number) => {
    setSections(
      sections.map((sec) => {
        if (sec.id === sectionId && sec.lectures) {
          return { ...sec, lectures: sec.lectures.filter((l) => l.id !== lecId) };
        }
        return sec;
      })
    );
  };

  // The real backend has no bulk "save the whole curriculum" endpoint — only
  // granular per-item CRUD + separate reorder calls (see curriculumDiff.ts
  // and DECISIONS.md, Phase 4.3). Diff the editor's local state against
  // what was loaded, then apply the resulting sequence of API calls.
  const handleSaveCurriculum = async () => {
    if (!curriculumCourse) return;
    setIsSavingCurriculum(true);
    try {
      const plan = buildCurriculumPlan(originalSections, sections);
      const persisted = await applyCurriculumPlan(curriculumCourse.id, plan, adminApi);
      setSections(persisted);
      setOriginalSections(JSON.parse(JSON.stringify(persisted)));
      showToast(`Curriculum structure & video associations saved for "${curriculumCourse.title}"!`, "success");
      setIsCurriculumModalOpen(false);
      // Refresh the course list so sectionsCount/lecturesCount/duration stay accurate.
      loadCourses();
    } catch (err) {
      // Some operations in the plan may have already landed server-side
      // before this one failed — re-sync both the editor and the diff
      // baseline against the server's real current state so the admin
      // isn't left editing a tree that's silently out of sync, and can
      // retry just the remaining changes instead of re-doing everything.
      try {
        const latest = await adminApi.getCourseSections(curriculumCourse.id);
        setSections(latest);
        setOriginalSections(JSON.parse(JSON.stringify(latest)));
      } catch {
        // If even the re-sync fails, leave the editor state as-is.
      }
      const baseMessage = describeError(err, "Failed to save curriculum.");
      showToast(`${baseMessage} Some changes may have partially applied — the list above has been refreshed with the current saved state; please review and retry.`, "danger");
    } finally {
      setIsSavingCurriculum(false);
    }
  };

  const filteredCourses = courses.filter((c) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.examCategory.toLowerCase().includes(q) ||
      String(c.id).includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}

      {/* Header Bar */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Course Catalog Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure video packages, pricing, validity periods, and syllabus modules for candidates.
          </p>
        </div>
        <Button variant="teal" icon={<Plus className="w-4 h-4" />} onClick={() => handleOpenCourseModal()}>
          Create New Course
        </Button>
      </div>

      {/* Course List Card */}
      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "Course Package",
              accessor: (row) => (
                <div className="flex items-center gap-3">
                  <img
                    src={row.thumbnailUrl}
                    alt={row.title}
                    className="w-12 h-10 object-cover rounded-lg border border-slate-200 shrink-0"
                  />
                  <div>
                    <span className="font-bold text-[#0E2A47] block text-sm">{row.title}</span>
                    <span className="text-[11px] text-slate-400 font-mono">slug: /{row.slug}</span>
                  </div>
                </div>
              ),
            },
            {
              header: "Category",
              accessor: (row) => <Badge variant="teal" size="sm">{row.examCategory}</Badge>,
            },
            {
              header: "Price (PKR)",
              accessor: (row) => <span className="font-bold text-slate-800">{formatPKR(row.price)}</span>,
            },
            {
              header: "Validity",
              accessor: (row) => <span className="text-xs font-medium text-slate-600">{row.validityDays} Days</span>,
            },
            {
              header: "Status",
              accessor: (row) => (
                <button
                  onClick={() => handleTogglePublished(row)}
                  className="flex items-center gap-1.5 focus:outline-none group"
                  title="Click to toggle live/draft"
                >
                  <Badge variant={row.isPublished ? "success" : "neutral"} size="sm">
                    {row.isPublished ? "Published (Live)" : "Draft"}
                  </Badge>
                </button>
              ),
            },
            {
              header: "Actions",
              accessor: (row) => (
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<Layers className="w-3.5 h-3.5 text-[#0FA3A3]" />}
                    onClick={() => handleOpenCurriculum(row)}
                  >
                    Curriculum
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<Edit className="w-3.5 h-3.5 text-slate-600" />}
                    onClick={() => handleOpenCourseModal(row)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                    onClick={() => setCourseToDelete(row)}
                  >
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredCourses}
          isLoading={isLoading}
          emptyText="No courses yet — click “Create New Course” to add your first medical course package."
        />
      </Card>

      {/* Course Add / Edit Modal */}
      <Modal
        isOpen={isCourseModalOpen}
        onClose={() => setIsCourseModalOpen(false)}
        title={editingCourse ? "Edit Course Details" : "Create New Medical Course"}
      >
        <form onSubmit={handleSaveCourse} className="space-y-4">
          <Input
            label="Course Title"
            required
            value={formTitle}
            onChange={handleTitleChange}
            placeholder="e.g. NRE Step 1 Complete Preparation Masterclass"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="URL Slug"
              required
              value={formSlug}
              onChange={(e) => setFormSlug(e.target.value)}
              placeholder="e.g. nre-step-1-complete"
            />
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as any)}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
              >
                <option value="NRE1">NRE Step 1 (PMDC)</option>
                <option value="USMLE1">USMLE Step 1</option>
                <option value="USMLE2CK">USMLE Step 2 CK</option>
                <option value="SMLE">SMLE (Saudi Medical)</option>
                <option value="DHA">DHA / HAAD (Dubai)</option>
                <option value="PROMETRIC">Prometric Gulf</option>
                <option value="MBBS">MBBS Basic Sciences</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Course Price (PKR)"
              type="number"
              required
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
              placeholder="15000"
            />
            <Input
              label="Access Duration (Days)"
              type="number"
              required
              value={formValidity}
              onChange={(e) => setFormValidity(e.target.value)}
              placeholder="180"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Rich Description & Syllabus</label>
            <textarea
              rows={4}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full p-3 text-sm border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
              placeholder="Detailed course description, high-yield topics covered, video lecture count..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Thumbnail Image</label>
            <div className="flex items-start gap-3">
              {formThumbnail && (
                <img
                  src={formThumbnail}
                  alt="Thumbnail preview"
                  className="w-20 h-16 object-cover rounded-lg border border-slate-200 shrink-0 bg-slate-100"
                />
              )}
              <div className="flex-1 space-y-2">
                <Input
                  value={formThumbnail}
                  onChange={(e) => setFormThumbnail(e.target.value)}
                  placeholder="https://... (or upload a file below)"
                  aria-label="Thumbnail Image URL"
                />
                <input
                  ref={thumbnailFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleThumbnailFileChange}
                  className="hidden"
                  aria-label="Upload thumbnail image file"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={<UploadCloud className="w-3.5 h-3.5" />}
                  isLoading={isUploadingThumbnail}
                  onClick={() => thumbnailFileInputRef.current?.click()}
                >
                  {isUploadingThumbnail ? "Uploading..." : "Upload Image File"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <p className="text-xs font-bold text-[#0E2A47]">Publish Status</p>
              <p className="text-[11px] text-slate-500">Enable to make visible on public website & checkout</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formIsPublished}
                onChange={(e) => setFormIsPublished(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0FA3A3]"></div>
            </label>
          </div>

          <Button type="submit" variant="teal" fullWidth isLoading={isSavingCourse}>
            {editingCourse ? "Save Changes" : "Create Course Package"}
          </Button>
        </form>
      </Modal>

      {/* Curriculum Manager Modal */}
      <Modal
        isOpen={isCurriculumModalOpen}
        onClose={() => setIsCurriculumModalOpen(false)}
        title={`Syllabus & Curriculum: ${curriculumCourse?.title}`}
        size="lg"
      >
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
          {/* Add Section Form */}
          <div className="flex gap-2">
            <Input
              placeholder="New Section Title (e.g. Section 4: Endocrine & Metabolic Disorders)"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              className="flex-1"
            />
            <Button variant="teal" icon={<Plus className="w-4 h-4" />} onClick={handleAddSection}>
              Add Section
            </Button>
          </div>

          {/* Sections List */}
          <div className="space-y-4">
            {sections.map((sec, secIdx) => (
              <div key={sec.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {/* Section Header */}
                <div className="bg-slate-100 p-3.5 flex items-center justify-between border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-slate-400">
                      <button
                        onClick={() => handleMoveSection(secIdx, "up")}
                        disabled={secIdx === 0}
                        className="hover:text-slate-800 disabled:opacity-30"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveSection(secIdx, "down")}
                        disabled={secIdx === sections.length - 1}
                        className="hover:text-slate-800 disabled:opacity-30"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="font-bold text-sm text-[#0E2A47]">{sec.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Plus className="w-3 h-3" />}
                      onClick={() => handleOpenLectureModal(sec.id)}
                    >
                      Add Lecture
                    </Button>
                    <button
                      onClick={() => handleDeleteSection(sec.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Lectures List */}
                <div className="p-3 divide-y divide-slate-100">
                  {(!sec.lectures || sec.lectures.length === 0) && (
                    <p className="text-xs text-slate-400 italic py-2 px-3">No lectures added to this section yet.</p>
                  )}
                  {sec.lectures?.map((lec, lecIdx) => (
                    <div key={lec.id} className="py-2.5 px-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-slate-300">
                          <button
                            onClick={() => handleMoveLecture(sec.id, lecIdx, "up")}
                            disabled={lecIdx === 0}
                            className="hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveLecture(sec.id, lecIdx, "down")}
                            disabled={lecIdx === (sec.lectures?.length || 0) - 1}
                            className="hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <Video className="w-4 h-4 text-[#0FA3A3]" />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{lec.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {Math.round(lec.durationSeconds / 60)} mins • Stream GUID: {lec.videoRef}
                            </span>
                            {lec.isFreePreview && (
                              <Badge variant="teal" size="sm" className="text-[9px] py-0 px-1">
                                FREE PREVIEW
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenLectureModal(sec.id, lec)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLecture(sec.id, lec.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button variant="teal" fullWidth onClick={handleSaveCurriculum} isLoading={isSavingCurriculum}>
            {isSavingCurriculum ? "Saving Curriculum..." : "Save Curriculum Sequence"}
          </Button>
        </div>
      </Modal>

      {/* Lecture Edit Modal */}
      <Modal
        isOpen={isLectureModalOpen}
        onClose={() => setIsLectureModalOpen(false)}
        title={editingLecture ? "Edit Lecture Details" : "Attach New Lecture Video"}
      >
        <div className="space-y-4">
          <Input
            label="Lecture Title"
            required
            value={lectureTitle}
            onChange={(e) => setLectureTitle(e.target.value)}
            placeholder="e.g. Lecture 3: Renal Tubular Acidosis Types I, II & IV"
          />

          <Input
            label="Duration (Minutes)"
            type="number"
            required
            value={lectureDuration}
            onChange={(e) => setLectureDuration(e.target.value)}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bunny.net Video Stream Library Selector
            </label>
            <select
              value={lectureVideoRef}
              onChange={(e) => {
                setLectureVideoRef(e.target.value);
                setVideoVerified(false);
              }}
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
            >
              {BUNNY_LIBRARY_VIDEOS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} ({v.duration} • ID: {v.id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-[#0FA3A3]" />
              <span className="text-xs text-slate-700 font-medium">Test Bunny Stream Endpoint</span>
            </div>
            <Button
              size="xs"
              variant={videoVerified ? "teal" : "outline"}
              icon={videoVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : undefined}
              onClick={() => setVideoVerified(true)}
            >
              {videoVerified ? "Stream Verified" : "Verify GUID"}
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="freePreviewChk"
              checked={lectureIsFreePreview}
              onChange={(e) => setLectureIsFreePreview(e.target.checked)}
              className="w-4 h-4 text-[#0FA3A3] rounded border-slate-300 focus:ring-[#0FA3A3]"
            />
            <label htmlFor="freePreviewChk" className="text-xs font-medium text-slate-700">
              Mark as Free Preview Lecture (unlocked for guests before purchasing)
            </label>
          </div>

          <Button variant="teal" fullWidth onClick={handleSaveLecture}>
            {editingLecture ? "Update Lecture" : "Attach Lecture"}
          </Button>
        </div>
      </Modal>

      {/* Delete Course Confirmation */}
      <ConfirmDialog
        isOpen={!!courseToDelete}
        title="Delete Course Package"
        message={
          courseToDelete
            ? `Are you sure you want to permanently delete "${courseToDelete.title}"? This cannot be undone. Courses with existing student orders or enrollments cannot be deleted — unpublish them instead.`
            : ""
        }
        confirmLabel="Delete Course"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeletingCourse}
        onConfirm={handleDeleteCourse}
        onCancel={() => setCourseToDelete(null)}
      />
    </div>
  );
};
