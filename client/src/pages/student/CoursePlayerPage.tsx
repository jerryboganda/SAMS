import React, { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  CheckCircle2,
  Play,
  PanelRightClose,
  PanelRightOpen,
  FileQuestion,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { Card, Button, Badge, ToastSystem, EmptyState, Skeleton } from "../../components/ui";
import { SecurePlayer } from "../../components/player/SecurePlayer";
import { coursesApi } from "../../api/endpoints/courses";
import { studentApi } from "../../api/endpoints/student";
import { Course, CourseSection, Lecture } from "../../types";

type LoadState = "loading" | "error" | "empty" | "data";

export const CoursePlayerPage: React.FC = () => {
  const { id, lectureId } = useParams<{ id?: string; lectureId?: string }>();
  const navigate = useNavigate();

  const routeCourseId = id ? Number(id) : undefined;
  const routeLectureId = lectureId ? Number(lectureId) : undefined;

  // Curriculum & Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [activeLectureId, setActiveLectureId] = useState<number | null>(null);
  const sectionsRef = useRef<CourseSection[]>([]);

  // Real per-lecture bookmark/completion state. There is no bulk
  // "curriculum + per-lecture progress" endpoint yet — `GET
  // /student/courses/:courseId` is docs/04_API_SPEC.md §3's planned source
  // for that, but it's Phase 6 (docs/07_EXECUTION_PLAN.md), not built. This
  // page instead seeds from the two real signals Phase 5 *does* expose
  // (`GET /student/bookmarks/lectures`, which also reports `isCompleted`
  // for whichever lectures happen to be bookmarked) and otherwise fills in
  // live as the viewer actually plays lectures this session (SecurePlayer's
  // `onComplete` callback, itself driven by the real `/complete` and
  // `/play`+resume-ratio signals — see playerLogic.ts's
  // `inferAlreadyCompletedFromResume`). See DECISIONS.md 2026-07-31.
  const [bookmarkedLectureIds, setBookmarkedLectureIds] = useState<Set<number>>(new Set());
  const [completedLectureIds, setCompletedLectureIds] = useState<Set<number>>(new Set());
  const [bookmarkPending, setBookmarkPending] = useState(false);

  // Toasts
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "danger">("success");

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // Seed real bookmark + (partial) completion state once per mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bookmarks = await studentApi.getBookmarkedLectures();
        if (cancelled) return;
        setBookmarkedLectureIds(new Set(bookmarks.map((l) => l.id)));
        setCompletedLectureIds((prev) => {
          const next = new Set(prev);
          bookmarks.forEach((l) => {
            if (l.isCompleted) next.add(l.id);
          });
          return next;
        });
      } catch (err) {
        // Non-fatal — bookmark icons just default to "not bookmarked" until toggled.
        console.error("Failed to load bookmarked lectures:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the real curriculum (sections + lectures, in real DB order) for
  // whichever course owns the requested lecture/course id, via the public
  // catalog (server/src/services/publicService.js#getCourseBySlug — already
  // real, already published data; access to the actual signed video URL is
  // separately, correctly gated by SecurePlayer's own `/play` call, which
  // enforces enrollment). Fast path: if the lecture we're navigating to
  // (prev/next/sidebar click) is already in the curriculum we loaded, just
  // switch the active lecture — no refetch.
  useEffect(() => {
    if (routeLectureId) {
      const alreadyLoaded = sectionsRef.current.some((s) => (s.lectures || []).some((l) => l.id === routeLectureId));
      if (alreadyLoaded) {
        setActiveLectureId(routeLectureId);
        return;
      }
    }

    let cancelled = false;
    (async () => {
      setLoadState("loading");
      setLoadErrorMsg("");
      try {
        const allCourses = await coursesApi.getCourses();
        if (allCourses.length === 0) {
          throw new Error("No courses are currently available.");
        }

        const knownCourse = routeCourseId ? allCourses.find((c) => c.id === routeCourseId) : undefined;
        const candidates = knownCourse ? [knownCourse, ...allCourses.filter((c) => c.id !== knownCourse.id)] : allCourses;

        let resolved: { course: Course; sections: CourseSection[] } | null = null;
        for (const candidate of candidates) {
          try {
            const detail = await coursesApi.getCourseWithSections(candidate.slug);
            const hasTargetLecture =
              !routeLectureId || detail.sections.some((s) => (s.lectures || []).some((l) => l.id === routeLectureId));
            if (candidate.id === routeCourseId || hasTargetLecture) {
              resolved = detail;
              break;
            }
          } catch {
            // Unpublished/broken course — skip and try the next candidate.
          }
        }

        if (cancelled) return;

        if (!resolved) {
          setLoadState("error");
          setLoadErrorMsg(
            routeLectureId
              ? "We couldn't find this lecture in any course curriculum."
              : "We couldn't load this course's curriculum."
          );
          return;
        }

        const allLecturesFlat = resolved.sections.flatMap((s) => s.lectures || []);
        setCourse(resolved.course);
        setSections(resolved.sections);

        if (allLecturesFlat.length === 0) {
          setLoadState("empty");
          return;
        }

        const target = routeLectureId ? allLecturesFlat.find((l) => l.id === routeLectureId) : undefined;
        const resolvedActive = target || allLecturesFlat[0];
        setActiveLectureId(resolvedActive.id);
        setLoadState("data");
      } catch (err: any) {
        if (!cancelled) {
          setLoadState("error");
          setLoadErrorMsg(err.message || "Failed to load course curriculum.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeCourseId, routeLectureId]);

  const allLectures: Lecture[] = sections.flatMap((s) => s.lectures || []);
  const currentIndex = allLectures.findIndex((l) => l.id === activeLectureId);
  const activeLecture = currentIndex >= 0 ? allLectures[currentIndex] : null;
  const prevLecture = currentIndex > 0 ? allLectures[currentIndex - 1] : null;
  const nextLecture = currentIndex >= 0 && currentIndex < allLectures.length - 1 ? allLectures[currentIndex + 1] : null;

  const showToast = (message: string, type: "success" | "danger" = "success") => {
    setToastType(type);
    setToastMessage(message);
  };

  // Handle >=90% Completion Trigger — called by SecurePlayer once the real
  // POST /complete call (or the resume-ratio inference on load) confirms it.
  const handleLectureComplete = () => {
    if (!activeLectureId) return;
    setCompletedLectureIds((prev) => {
      if (prev.has(activeLectureId)) return prev;
      const next = new Set(prev);
      next.add(activeLectureId);
      return next;
    });
    if (activeLecture) {
      showToast(`Lecture '${activeLecture.title}' marked as completed!`);
    }
  };

  // Handle Video Ended (Auto Advance through the real curriculum order)
  const handleLectureEnded = () => {
    handleLectureComplete();
    if (autoAdvance && nextLecture) {
      showToast(`Auto-advancing to '${nextLecture.title}'...`);
      setTimeout(() => {
        navigate(`/app/learn/${nextLecture.id}`);
      }, 1500);
    }
  };

  // Toggle Bookmark against the real POST/DELETE endpoints.
  const handleBookmarkToggle = async () => {
    if (!activeLectureId || bookmarkPending) return;
    const isCurrentlyBookmarked = bookmarkedLectureIds.has(activeLectureId);
    setBookmarkPending(true);
    try {
      const result = await studentApi.toggleLectureBookmark(activeLectureId, isCurrentlyBookmarked);
      setBookmarkedLectureIds((prev) => {
        const next = new Set(prev);
        if (result.isBookmarked) next.add(activeLectureId);
        else next.delete(activeLectureId);
        return next;
      });
      showToast(result.isBookmarked ? "Lecture added to bookmarks!" : "Bookmark removed");
    } catch (err: any) {
      showToast(err.message || "Failed to update bookmark.", "danger");
    } finally {
      setBookmarkPending(false);
    }
  };

  const isCurrentBookmarked = activeLectureId ? bookmarkedLectureIds.has(activeLectureId) : false;
  const isCurrentCompleted = activeLectureId ? completedLectureIds.has(activeLectureId) : false;

  if (loadState === "loading") {
    return (
      <div className="space-y-6 pb-12">
        <Skeleton variant="text" className="h-6 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <Skeleton variant="card" className="h-64 sm:h-96 rounded-2xl" />
            <Skeleton variant="card" className="h-32 rounded-2xl" />
          </div>
          <div className="lg:col-span-4 space-y-3">
            <Skeleton variant="card" className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="py-12">
        <EmptyState
          icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load this lecture"
          description={loadErrorMsg || "Something went wrong loading the course curriculum."}
          actionLabel="Back to My Courses"
          onAction={() => navigate("/app/courses")}
        />
      </div>
    );
  }

  if (loadState === "empty" || !activeLecture) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<BookOpen className="w-10 h-10 text-slate-400" />}
          title="No lectures yet"
          description="This course doesn't have any published lectures yet — check back soon."
          actionLabel="Back to My Courses"
          onAction={() => navigate("/app/courses")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification System */}
      {toastMessage && (
        <ToastSystem
          toasts={[{ id: "learn-toast", type: toastType, title: toastMessage }]}
          onClose={() => setToastMessage("")}
        />
      )}

      {/* Navigation & Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={course ? `/app/courses/${course.id}` : "/app/courses"}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 hover:text-[#0E2A47] transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[#0FA3A3]" /> Back to Course Overview
          </Link>
          <span className="text-slate-300 shrink-0">|</span>
          <span className="text-xs font-semibold text-slate-500 truncate max-w-xs sm:max-w-md">
            {activeLecture.title}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Sidebar Toggle Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            icon={isSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          >
            <span className="hidden sm:inline">{isSidebarOpen ? "Collapse Curriculum" : "Show Curriculum"}</span>
          </Button>

          <Badge variant="navy" size="md">
            SAMS DRM PROTECTED
          </Badge>
        </div>
      </div>

      {/* Main Grid: Player Left (16:9), Curriculum Sidebar Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Player & Lecture Details) */}
        <div className={`${isSidebarOpen ? "lg:col-span-8" : "lg:col-span-12"} space-y-5 transition-all duration-300`}>
          {/* Secure Video Player */}
          <SecurePlayer
            key={activeLecture.id}
            lectureId={activeLecture.id}
            lectureTitle={activeLecture.title}
            lectureDurationSeconds={activeLecture.durationSeconds}
            onComplete={handleLectureComplete}
            onEnded={handleLectureEnded}
          />

          {/* Below Player Controls & Lecture Metadata */}
          <Card className="p-5 border-slate-200 space-y-4 shadow-sm bg-white rounded-2xl">
            {/* Header / Title / Action Row */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="teal" size="sm">
                    SECTION {activeLecture.sectionId}
                  </Badge>
                  {isCurrentCompleted && (
                    <Badge variant="emerald" size="sm" className="flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3 h-3" /> COMPLETED
                    </Badge>
                  )}
                  <span className="text-xs text-slate-400 font-medium">
                    Duration: {Math.floor(activeLecture.durationSeconds / 60)} mins
                  </span>
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-[#0E2A47] leading-tight">
                  {activeLecture.title}
                </h1>
              </div>

              {/* Bookmark Toggle Button */}
              <Button
                size="sm"
                variant={isCurrentBookmarked ? "secondary" : "outline"}
                icon={<Bookmark className={`w-4 h-4 ${isCurrentBookmarked ? "fill-amber-500 text-amber-500" : ""}`} />}
                onClick={handleBookmarkToggle}
                disabled={bookmarkPending}
              >
                {isCurrentBookmarked ? "Bookmarked" : "Bookmark Lecture"}
              </Button>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
              {activeLecture.description || "High-yield medical video lecture covering key clinical vignette patterns, pathophysiology, diagnostic criteria, and board exam high-yield facts."}
            </p>

            {/* Previous / Next Lecture Navigation Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={!prevLecture}
                icon={<ChevronLeft className="w-4 h-4" />}
                onClick={() => prevLecture && navigate(`/app/learn/${prevLecture.id}`)}
              >
                Previous Lecture
              </Button>

              <div className="text-xs text-slate-400 font-semibold hidden sm:block">
                Lecture {currentIndex + 1} of {allLectures.length}
              </div>

              <Button
                size="sm"
                variant="teal"
                disabled={!nextLecture}
                icon={<ChevronRight className="w-4 h-4" />}
                onClick={() => nextLecture && navigate(`/app/learn/${nextLecture.id}`)}
              >
                Next Lecture
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Collapsible Curriculum Sidebar */}
        {isSidebarOpen && (
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-4 border-slate-200 space-y-4 shadow-sm bg-white rounded-2xl max-h-[750px] flex flex-col justify-between">
              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                {/* Sidebar Header & Auto-Advance Toggle */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-extrabold text-[#0E2A47] flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#0FA3A3]" /> Course Curriculum
                  </h3>

                  {/* Auto-Advance Switch */}
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <span>Auto-advance</span>
                    <input
                      type="checkbox"
                      checked={autoAdvance}
                      onChange={(e) => setAutoAdvance(e.target.checked)}
                      className="w-4 h-4 accent-[#0FA3A3] rounded cursor-pointer"
                      aria-label="Auto-advance to the next lecture"
                    />
                  </label>
                </div>

                {/* Sections & Lectures List */}
                <div className="space-y-4">
                  {sections.map((sec) => (
                    <div key={sec.id} className="space-y-2">
                      <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-[#0E2A47] flex justify-between items-center">
                        <span className="truncate">{sec.title}</span>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-1">
                          {sec.lectures?.length || 0} lectures
                        </span>
                      </div>

                      <div className="space-y-1">
                        {sec.lectures?.map((lec) => {
                          const isCurrent = lec.id === activeLectureId;
                          const isDone = completedLectureIds.has(lec.id);
                          const isBookmarked = bookmarkedLectureIds.has(lec.id);

                          return (
                            <button
                              key={lec.id}
                              type="button"
                              onClick={() => navigate(`/app/learn/${lec.id}`)}
                              className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 transition-all ${
                                isCurrent
                                  ? "bg-[#0FA3A3]/10 font-extrabold text-[#0E2A47] border-l-4 border-[#0FA3A3] shadow-xs"
                                  : "hover:bg-slate-50 text-slate-700 border border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                    isDone
                                      ? "bg-emerald-100 text-emerald-600"
                                      : isCurrent
                                      ? "bg-[#0FA3A3] text-white"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {isDone ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                  ) : (
                                    <Play className="w-3 h-3 fill-current ml-0.5" />
                                  )}
                                </div>

                                <span className="line-clamp-2 leading-snug flex items-center gap-1">
                                  {lec.title}
                                  {isBookmarked && (
                                    <Bookmark className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />
                                  )}
                                </span>
                              </div>

                              <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                                {Math.floor(lec.durationSeconds / 60)}m
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked QBank Banner */}
              <div className="pt-3 border-t border-slate-100">
                <Link to="/app/qbank">
                  <div className="p-3 bg-gradient-to-r from-slate-900 to-[#0E2A47] text-white rounded-xl flex items-center justify-between gap-2 hover:opacity-95 transition-opacity">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] text-[#0FA3A3] font-bold uppercase tracking-wider block">
                        Linked QBank Vignettes
                      </span>
                      <p className="text-xs font-extrabold text-white truncate">
                        Practice Cardiovascular Block
                      </p>
                    </div>
                    <FileQuestion className="w-5 h-5 text-[#0FA3A3] shrink-0" />
                  </div>
                </Link>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
