import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Play,
  CheckCircle2,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clock,
  BookOpen,
  ArrowLeft,
  FileQuestion,
  Award,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Card, Button, Badge, ProgressBar, ToastSystem } from "../../components/ui";
import { studentApi } from "../../api/endpoints/student";
import { Course, CourseSection, Lecture } from "../../types";
import { MOCK_COURSES, MOCK_SECTIONS } from "../../mock-data";

export const CourseHomePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const courseId = Number(id) || 1;

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [progressPercent, setProgressPercent] = useState(42);
  const [isLoading, setIsLoading] = useState(true);

  // Accordion state (open section IDs)
  const [openSectionIds, setOpenSectionIds] = useState<number[]>([]);
  const [bookmarkedLectureIds, setBookmarkedLectureIds] = useState<number[]>([1002]);
  const [toastMessage, setToastMessage] = useState("");

  const activeResumeLectureId = 1002; // Lecture 2 marked as current resume lecture

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const data = await studentApi.getEnrolledCourseDetails(courseId);
        if (data.course) setCourse(data.course);
        else setCourse(MOCK_COURSES.find((c) => c.id === courseId) || MOCK_COURSES[0]);

        const loadedSections = data.sections.length > 0
          ? data.sections
          : MOCK_SECTIONS.filter((s) => s.courseId === courseId);
        setSections(loadedSections);
        setOpenSectionIds(loadedSections.map((s) => s.id));
        if (data.progressPercent !== undefined) setProgressPercent(data.progressPercent);
      } catch (err) {
        console.error("Error loading course details", err);
        setCourse(MOCK_COURSES[0]);
        setSections(MOCK_SECTIONS);
        setOpenSectionIds(MOCK_SECTIONS.map((s) => s.id));
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [courseId]);

  const toggleSection = (sectionId: number) => {
    setOpenSectionIds((prev) =>
      prev.includes(sectionId) ? prev.filter((sId) => sId !== sectionId) : [...prev, sectionId]
    );
  };

  const handleBookmarkToggle = (e: React.MouseEvent, lectureId: number, title: string) => {
    e.stopPropagation();
    if (bookmarkedLectureIds.includes(lectureId)) {
      setBookmarkedLectureIds((prev) => prev.filter((id) => id !== lectureId));
      setToastMessage(`Removed bookmark for '${title}'`);
    } else {
      setBookmarkedLectureIds((prev) => [...prev, lectureId]);
      setToastMessage(`Bookmarked '${title}'`);
    }
  };

  // Helper to format duration in minutes
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  // Calculate totals
  const allLectures = sections.flatMap((s) => s.lectures || []);
  const completedCount = allLectures.filter((l) => l.isCompleted).length;
  const totalLecturesCount = allLectures.length || 28;

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && (
        <ToastSystem
          toasts={[{ id: "bm-toast", type: "success", title: toastMessage }]}
          onClose={() => setToastMessage("")}
        />
      )}

      {/* Top Header & Breadcrumb */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <Link
          to="/app/courses"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0E2A47]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Enrolled Courses
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="navy">{course?.examCategory || "NRE Step 1"}</Badge>
              <Badge variant="teal">140 Days Validity Remaining</Badge>
              <Badge variant="outline" className="text-slate-600">SAMS DRM PROTECTED</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0E2A47] leading-tight">
              {course?.title || "NRE Step 1 Complete Preparation Masterclass"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {course?.shortDescription || "High-yield medical lectures, clinical vignette breakdowns, and QBank integration."}
            </p>
          </div>

          <div className="shrink-0 space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 min-w-[240px]">
            <div className="flex justify-between items-center text-xs font-bold text-[#0E2A47]">
              <span>Overall Course Completion</span>
              <span>{progressPercent}%</span>
            </div>
            <ProgressBar progress={progressPercent} variant="teal" size="md" />
            <p className="text-[11px] text-slate-500 font-medium text-right">
              {completedCount} of {totalLecturesCount} lectures done
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Curriculum Panel (Sections Accordion) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-lg font-extrabold text-[#0E2A47] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#0FA3A3]" /> Course Curriculum & Modules
            </h2>
            <span className="text-xs text-slate-500 font-semibold">{sections.length} Sections</span>
          </div>

          <div className="space-y-4">
            {sections.map((sec) => {
              const isOpen = openSectionIds.includes(sec.id);
              const secLectures = sec.lectures || [];

              return (
                <Card key={sec.id} className="border border-slate-200 overflow-hidden shadow-sm">
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleSection(sec.id)}
                    className="w-full p-4 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between gap-3 text-left transition-colors border-b border-slate-100"
                  >
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-extrabold text-[#0E2A47]">{sec.title}</h3>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {secLectures.length} Lectures • Total Duration: {Math.floor(secLectures.reduce((acc, l) => acc + l.durationSeconds, 0) / 60)} mins
                      </p>
                    </div>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />}
                  </button>

                  {/* Accordion Content (Lecture Rows) */}
                  {isOpen && (
                    <div className="divide-y divide-slate-100">
                      {secLectures.map((lec) => {
                        const isCurrentResume = lec.id === activeResumeLectureId;
                        const isBookmarked = bookmarkedLectureIds.includes(lec.id);

                        return (
                          <div
                            key={lec.id}
                            onClick={() => navigate(`/app/learn/${lec.id}`)}
                            className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                              isCurrentResume
                                ? "bg-[#0FA3A3]/10 border-l-4 border-[#0FA3A3]"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Play or Complete Icon */}
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                  lec.isCompleted
                                    ? "bg-emerald-100 text-emerald-700"
                                    : isCurrentResume
                                    ? "bg-[#0FA3A3] text-white"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {lec.isCompleted ? (
                                  <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                  <Play className="w-4 h-4 fill-current ml-0.5" />
                                )}
                              </div>

                              <div className="space-y-0.5 min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-xs sm:text-sm font-bold text-[#0E2A47] truncate">
                                    {lec.title}
                                  </h4>
                                  {isCurrentResume && (
                                    <Badge variant="teal" size="sm" className="font-bold">
                                      RESUME HERE
                                    </Badge>
                                  )}
                                  {lec.isFreePreview && (
                                    <Badge variant="outline" size="sm">
                                      FREE PREVIEW
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 line-clamp-1">{lec.description}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {formatDuration(lec.durationSeconds)}
                              </span>

                              {/* Bookmark Toggle Button */}
                              <button
                                type="button"
                                onClick={(e) => handleBookmarkToggle(e, lec.id, lec.title)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isBookmarked
                                    ? "bg-amber-100 text-amber-600"
                                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                }`}
                                title={isBookmarked ? "Remove Bookmark" : "Bookmark Lecture"}
                              >
                                <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-amber-500" : ""}`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Small "Course Stats" Side Card */}
        <div className="space-y-6">
          <Card className="p-6 border-slate-200 space-y-5 shadow-sm">
            <h3 className="text-base font-extrabold text-[#0E2A47] border-b border-slate-100 pb-3">
              Course Statistics & Metrics
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-600 font-medium">Lectures Completed</span>
                <span className="font-extrabold text-[#0E2A47]">{completedCount} / {totalLecturesCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-600 font-medium">Watch Time</span>
                <span className="font-extrabold text-[#0E2A47]">18.5 / 20.0 Hours</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-600 font-medium">Linked QBank Questions</span>
                <span className="font-extrabold text-emerald-600 flex items-center gap-1">
                  <FileQuestion className="w-3.5 h-3.5" /> 60+ Vignettes
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-600 font-medium">Subscription Status</span>
                <Badge variant="teal" size="sm">140 Days Remaining</Badge>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                fullWidth
                variant="teal"
                size="lg"
                icon={<Play className="w-4 h-4" />}
                onClick={() => navigate(`/app/learn/${activeResumeLectureId}`)}
              >
                Resume Current Lecture
              </Button>

              <Link to="/app/qbank">
                <Button fullWidth variant="outline" size="sm" icon={<FileQuestion className="w-4 h-4" />}>
                  Launch Linked QBank Block
                </Button>
              </Link>
            </div>
          </Card>

          {/* SAMS Protection Guarantee Box */}
          <Card className="p-4 bg-slate-900 text-white space-y-2 border-slate-800">
            <div className="flex items-center gap-2 text-[#0FA3A3] text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" /> Watermarked Security
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Video stream rendered via SAMS HLS DRM with custom candidate watermark overlay. Maximum 2 registered devices permitted.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
