import React, { useState, useEffect } from "react";
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
  Sparkles,
  Lock,
  FileQuestion,
  Clock,
  BookOpen,
} from "lucide-react";
import { Card, Button, Badge, ToastSystem } from "../../components/ui";
import { SecurePlayer } from "../../components/player/SecurePlayer";
import { MOCK_SECTIONS } from "../../mock-data";
import { Lecture, CourseSection } from "../../types";

export const CoursePlayerPage: React.FC = () => {
  const { id, lectureId } = useParams<{ id?: string; lectureId?: string }>();
  const navigate = useNavigate();

  // Determine active lecture ID
  const initialLectureId = Number(lectureId) || Number(id) || 1001;
  const [activeLectureId, setActiveLectureId] = useState<number>(initialLectureId);

  // Curriculum & Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);

  // Track completed & bookmarked lectures (persisted in localStorage)
  const [completedLectureIds, setCompletedLectureIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("sams_completed_lectures");
      return saved ? JSON.parse(saved) : [1001];
    } catch {
      return [1001];
    }
  });

  const [bookmarkedLectureIds, setBookmarkedLectureIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("sams_bookmarked_lectures");
      return saved ? JSON.parse(saved) : [1002];
    } catch {
      return [1002];
    }
  });

  // Toasts
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (lectureId) {
      setActiveLectureId(Number(lectureId));
    } else if (id && Number(id) < 1000) {
      const courseLectures = MOCK_SECTIONS.filter((s) => s.courseId === Number(id)).flatMap((s) => s.lectures || []);
      if (courseLectures.length > 0) {
        setActiveLectureId(courseLectures[0].id);
      }
    }
  }, [id, lectureId]);

  // All flat lectures list for prev/next calculations
  const allLectures: Lecture[] = MOCK_SECTIONS.flatMap((s) => s.lectures || []);
  const currentIndex = allLectures.findIndex((l) => l.id === activeLectureId);

  const activeLecture = allLectures[currentIndex] || allLectures[0];
  const prevLecture = currentIndex > 0 ? allLectures[currentIndex - 1] : null;
  const nextLecture = currentIndex < allLectures.length - 1 ? allLectures[currentIndex + 1] : null;

  // Handle >=90% Completion Trigger
  const handleLectureComplete = () => {
    if (!completedLectureIds.includes(activeLectureId)) {
      const updated = [...completedLectureIds, activeLectureId];
      setCompletedLectureIds(updated);
      localStorage.setItem("sams_completed_lectures", JSON.stringify(updated));
      setToastMessage(`🎉 Lecture '${activeLecture.title}' marked as completed!`);
    }
  };

  // Handle Video Ended (Auto Advance if Enabled)
  const handleLectureEnded = () => {
    handleLectureComplete();
    if (autoAdvance && nextLecture) {
      setToastMessage(`Auto-advancing to '${nextLecture.title}'...`);
      setTimeout(() => {
        navigate(`/app/learn/${nextLecture.id}`);
      }, 1500);
    }
  };

  // Toggle Bookmark
  const handleBookmarkToggle = () => {
    if (bookmarkedLectureIds.includes(activeLectureId)) {
      const updated = bookmarkedLectureIds.filter((id) => id !== activeLectureId);
      setBookmarkedLectureIds(updated);
      localStorage.setItem("sams_bookmarked_lectures", JSON.stringify(updated));
      setToastMessage("Bookmark removed");
    } else {
      const updated = [...bookmarkedLectureIds, activeLectureId];
      setBookmarkedLectureIds(updated);
      localStorage.setItem("sams_bookmarked_lectures", JSON.stringify(updated));
      setToastMessage("Lecture added to bookmarks!");
    }
  };

  const isCurrentBookmarked = bookmarkedLectureIds.includes(activeLectureId);
  const isCurrentCompleted = completedLectureIds.includes(activeLectureId);

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification System */}
      {toastMessage && (
        <ToastSystem
          toasts={[{ id: "learn-toast", type: "success", title: toastMessage }]}
          onClose={() => setToastMessage("")}
        />
      )}

      {/* Navigation & Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/app/courses/${activeLecture.courseId}`}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 hover:text-[#0E2A47] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#0FA3A3]" /> Back to Course Overview
          </Link>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-semibold text-slate-500 truncate max-w-xs sm:max-w-md">
            {activeLecture.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
            lectureId={activeLectureId}
            lectureTitle={activeLecture.title}
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
                    />
                  </label>
                </div>

                {/* Sections & Lectures List */}
                <div className="space-y-4">
                  {MOCK_SECTIONS.map((sec) => (
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
                          const isDone = completedLectureIds.includes(lec.id);

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

                                <span className="line-clamp-2 leading-snug">{lec.title}</span>
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
