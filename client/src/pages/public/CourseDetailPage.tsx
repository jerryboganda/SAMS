import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Play,
  CheckCircle2,
  ShieldCheck,
  Clock,
  BookOpen,
  FileQuestion,
  ArrowRight,
  Lock,
  ChevronDown,
  ChevronUp,
  Award,
  Video,
  HelpCircle,
  Smartphone,
  Star,
  Check,
} from "lucide-react";
import { Card, Button, Badge, Modal } from "../../components/ui";
import { SecurePlayer } from "../../components/player/SecurePlayer";
import { MOCK_COURSES, MOCK_SECTIONS, MOCK_FAQS, MOCK_ENROLLMENTS } from "../../mock-data";
import { useAuth } from "../../stores/authStore";
import { formatPKR, formatDuration } from "../../utils/formatters";
import { Course, CourseSection, Lecture, FacultyMember } from "../../types";
import { coursesApi } from "../../api/endpoints/courses";
import { publicApi } from "../../api/endpoints/public";

export const CourseDetailPage: React.FC = () => {
  const { slug, id } = useParams<{ slug?: string; id?: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const paramVal = slug || id || "";

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Accordion state for sections
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({});

  // Free Preview Modal State
  const [previewLecture, setPreviewLecture] = useState<Lecture | null>(null);

  // The real schema has no course<->faculty relationship (Phase 3.1 finding
  // — see DECISIONS.md 2026-07-31), so this is the general faculty roster,
  // not "this course's instructor". Fetched independently of the course
  // itself and fails silently (empty list just hides the section) so a
  // faculty-endpoint hiccup never blocks the course page from rendering.
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        // GET /public/courses/:slug already returns {course, sections} in
        // one response — see coursesApi.getCourseWithSections for why this
        // must NOT be two separate calls (DECISIONS.md 2026-07-31).
        const { course: fetchedCourse, sections: fetchedSections } = await coursesApi.getCourseWithSections(paramVal);
        setCourse(fetchedCourse);
        setSections(fetchedSections);

        // Open first section by default
        if (fetchedSections.length > 0) {
          setOpenSections({ [fetchedSections[0].id]: true });
        }
      } catch {
        // Fallback to mock data
        const found =
          MOCK_COURSES.find((c) => c.slug === paramVal || String(c.id) === paramVal) ||
          MOCK_COURSES[0];
        setCourse(found);
        setSections(MOCK_SECTIONS);
        setOpenSections({ [MOCK_SECTIONS[0].id]: true });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [paramVal]);

  useEffect(() => {
    publicApi
      .getFaculty()
      .then(setFaculty)
      .catch(() => setFaculty([]));
  }, []);

  // Check if current user is enrolled in this course
  const isEnrolled = React.useMemo(() => {
    if (!isAuthenticated || !user || !course) return false;
    // Check demo enrollments or role === admin
    if (user.role === "admin") return true;
    return MOCK_ENROLLMENTS.some(
      (e) => e.userId === user.id && e.courseId === course.id && e.status === "active"
    );
  }, [isAuthenticated, user, course]);

  const toggleSection = (sectionId: number) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  if (isLoading || !course) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium">
        Loading course details...
      </div>
    );
  }

  const whatYouWillLearn = [
    "Comprehensive organ system pathology and high-yield disease mechanisms.",
    "PMDC NRE Step 1 exam blueprint coverage with high-yield clinical vignettes.",
    "Pharmacology drug classifications, mechanisms, and side effects.",
    "ECG interpretation, valvular heart diseases, and cardiovascular diagnostics.",
    "Microbiology, immunology, and antimicrobial therapy guidelines.",
    "Integrated QBank practice in Practice Mode & timed Exam Mode.",
    "High-yield image review for radiology, histopathology, and gross anatomy.",
    "Strategic exam techniques for single-best-answer MCQs.",
  ];

  return (
    <div className="space-y-10 pb-16">
      {/* HEADER HERO BANNER */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl relative overflow-hidden shadow-xl">
        <div className="absolute -right-16 -top-16 w-96 h-96 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl space-y-4 relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="teal">{course.examCategory} MASTERCLASS</Badge>
            <span className="text-xs text-slate-300 font-medium flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> 4.9 (128 Candidates)
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            {course.title}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl font-normal">
            {course.description}
          </p>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300 pt-4 border-t border-slate-800">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4 text-[#0FA3A3]" /> {course.validityDays} Days Validity
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <BookOpen className="w-4 h-4 text-[#0FA3A3]" /> {course.lecturesCount || 28} HD Lectures
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <FileQuestion className="w-4 h-4 text-[#0FA3A3]" /> Full QBank Included
            </span>
            <span className="flex items-center gap-1.5 font-medium text-emerald-400">
              <ShieldCheck className="w-4 h-4" /> 100% DRM Protected
            </span>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN CONTENT AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT COLUMN: OVERVIEW, WHAT YOU'LL LEARN, CURRICULUM, FACULTY, FAQS */}
        <div className="lg:col-span-2 space-y-10">
          {/* What You'll Learn Box */}
          <Card className="p-6 border-slate-200 space-y-4">
            <h2 className="text-xl font-extrabold text-[#0E2A47] flex items-center gap-2">
              <Award className="w-5 h-5 text-[#0FA3A3]" /> What You'll Learn & Master
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {whatYouWillLearn.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Curriculum Accordion */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-xl font-extrabold text-[#0E2A47]">Course Curriculum Syllabus</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {sections.length} Sections • {course.lecturesCount || 28} Lectures • {formatDuration(course.totalDurationSeconds || 72000)} Total Duration
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {sections.map((section) => {
                const isOpen = !!openSections[section.id];
                const sectionLectures = section.lectures || [];

                return (
                  <Card key={section.id} className="border-slate-200 overflow-hidden">
                    {/* Section Accordion Header */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                        <div>
                          <h3 className="text-sm font-bold text-[#0E2A47]">{section.title}</h3>
                          <span className="text-[11px] text-slate-500">{sectionLectures.length} Lectures</span>
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </button>

                    {/* Section Lectures List */}
                    {isOpen && (
                      <div className="divide-y divide-slate-100 p-2 bg-white">
                        {sectionLectures.map((lecture) => (
                          <div
                            key={lecture.id}
                            className={`p-3 rounded-lg flex items-center justify-between transition-colors ${
                              lecture.isFreePreview
                                ? "hover:bg-[#0FA3A3]/5 cursor-pointer"
                                : "hover:bg-slate-50"
                            }`}
                            onClick={() => {
                              if (lecture.isFreePreview) {
                                setPreviewLecture(lecture);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 pr-2">
                              {lecture.isFreePreview ? (
                                <div className="w-7 h-7 rounded-full bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center shrink-0">
                                  <Play className="w-3.5 h-3.5 fill-[#0FA3A3]" />
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                                  <Lock className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div>
                                <h4 className="text-xs font-semibold text-[#0E2A47] flex items-center gap-2">
                                  {lecture.title}
                                </h4>
                                {lecture.description && (
                                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                    {lecture.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] font-mono text-slate-400">
                                {formatDuration(lecture.durationSeconds)}
                              </span>
                              {lecture.isFreePreview ? (
                                <Badge variant="teal" size="sm">FREE PREVIEW</Badge>
                              ) : (
                                <Badge variant="secondary" size="sm" className="text-slate-400">LOCKED</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Faculty Card — the schema has no course<->faculty relationship,
              so this shows the general SAMS Academy faculty roster rather
              than claiming a specific "this course's instructor" (which
              would be fabricated data). See DECISIONS.md 2026-07-31
              (Phase 3.2-3.4). Hidden entirely if the roster is empty/fails
              to load, so it never blocks the rest of the course page. */}
          {faculty.length > 0 && (
            <Card className="p-6 border-slate-200 space-y-4">
              <div>
                <h2 className="text-xl font-extrabold text-[#0E2A47]">Meet Our Faculty</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  SAMS Academy instructors guiding students across our full course catalog.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {faculty.slice(0, 2).map((member) => (
                  <div key={member.id} className="flex flex-col sm:flex-row items-start gap-4">
                    <img
                      src={member.photoUrl}
                      alt={member.name}
                      className="w-20 h-20 rounded-full object-cover border-2 border-[#0FA3A3] shrink-0"
                    />
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-bold text-[#0E2A47]">{member.name}</h3>
                      <p className="text-xs font-semibold text-[#0FA3A3]">{member.title}</p>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{member.bio}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/faculty" className="text-xs font-bold text-[#0FA3A3] hover:underline inline-block">
                View Full Faculty Roster &rarr;
              </Link>
            </Card>
          )}

          {/* FAQ Accordion */}
          <Card className="p-6 border-slate-200 space-y-4">
            <h2 className="text-xl font-extrabold text-[#0E2A47]">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {MOCK_FAQS.slice(0, 4).map((faq) => (
                <div key={faq.id} className="p-3 bg-slate-50 rounded-lg space-y-1">
                  <h4 className="text-xs font-bold text-[#0E2A47] flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-[#0FA3A3] shrink-0" />
                    {faq.question}
                  </h4>
                  <p className="text-xs text-slate-600 pl-5 leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: STICKY PRICING & ENROLLMENT CARD */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-6">
            <Card className="p-6 border-slate-200 shadow-lg bg-white space-y-6">
              {/* Thumbnail Header */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900">
                <img
                  src={course.thumbnailUrl}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-3">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#0FA3A3]" /> SAMS DRM Watermark Security
                  </span>
                </div>
              </div>

              {/* Fee & Validity */}
              <div className="space-y-1 text-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">Total Course Fee</span>
                <p className="text-3xl font-black text-[#0E2A47]">{formatPKR(course.price)}</p>
                <span className="inline-block px-3 py-1 bg-[#0FA3A3]/10 text-[#0FA3A3] text-xs font-bold rounded-full mt-1">
                  {course.validityDays} Days Full Validity Access
                </span>
              </div>

              {/* Enrollment Status Check / Action Button */}
              {isEnrolled ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" /> You are enrolled in this course!
                  </div>
                  <Button
                    fullWidth
                    variant="teal"
                    size="lg"
                    onClick={() => navigate(`/app/courses/${course.id}/player`)}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Go to Course Player
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    fullWidth
                    variant="teal"
                    size="lg"
                    onClick={() => {
                      const checkoutPath = `/checkout?course=${course.slug || course.id}`;
                      if (isAuthenticated) {
                        navigate(checkoutPath);
                      } else {
                        navigate(`/login?redirect=${encodeURIComponent(checkoutPath)}`);
                      }
                    }}
                    rightIcon={<ArrowRight className="w-5 h-5" />}
                    className="shadow-md shadow-[#0FA3A3]/20"
                  >
                    Enroll Now
                  </Button>

                  {/* Free Preview Button */}
                  <Button
                    fullWidth
                    variant="outline"
                    onClick={() => {
                      const freeLec = sections
                        .flatMap((s) => s.lectures || [])
                        .find((l) => l.isFreePreview);
                      if (freeLec) setPreviewLecture(freeLec);
                    }}
                  >
                    Watch Free Preview
                  </Button>
                </div>
              )}

              {/* Package Features List */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-700">
                <p className="font-bold text-[#0E2A47] uppercase text-[10px] tracking-wider">Package Includes:</p>
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                  <span>{course.lecturesCount || 28} High-Definition Video Lectures</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileQuestion className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                  <span>NRE & Gulf Style QBank Access</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                  <span>Dynamic Watermark DRM Security</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                  <span>2-Device Registered Access Policy</span>
                </div>
              </div>

              {/* Trust Footer */}
              <div className="pt-2 text-center text-[11px] text-slate-400 font-mono">
                Instant Activation via JazzCash, EasyPaisa, Raast & Bank Transfer
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* FREE PREVIEW LECTURE MODAL */}
      <Modal
        isOpen={!!previewLecture}
        onClose={() => setPreviewLecture(null)}
        title={`Free Preview: ${previewLecture?.title}`}
        size="lg"
      >
        {previewLecture && (
          <div className="space-y-4 p-2">
            {/*
              Real, unauthenticated free-preview playback — GET
              /student/lectures/:id/play allows role P (anonymous) for
              `isFreePreview` lectures (server/src/services/videoService.js),
              returning a literal "PREVIEW" watermark and a resumeAt of 0.
              SecurePlayer itself gates heartbeat/mark-complete behind
              `useAuth().isAuthenticated`, so an anonymous viewer here never
              attempts either (see docs/07_EXECUTION_PLAN.md 5.5 + the
              client/src/components/player/SecurePlayer.tsx header comment).
              A logged-in-but-not-enrolled visitor gets the same preview
              treatment; an enrolled visitor previewing still works fine —
              this modal is reachable regardless of enrollment status.
            */}
            <SecurePlayer
              key={previewLecture.id}
              lectureId={previewLecture.id}
              lectureTitle={previewLecture.title}
              lectureDurationSeconds={previewLecture.durationSeconds}
            />

            {/* Modal CTA Note */}
            <div className="p-4 bg-slate-50 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 font-medium">
                Like what you see? Enroll now to unlock all {course.lecturesCount || 28} lectures and full QBank access!
              </span>
              <Button
                variant="teal"
                size="sm"
                onClick={() => {
                  setPreviewLecture(null);
                  const checkoutPath = `/checkout?course=${course.slug || course.id}`;
                  if (isAuthenticated) {
                    navigate(checkoutPath);
                  } else {
                    navigate(`/login?redirect=${encodeURIComponent(checkoutPath)}`);
                  }
                }}
              >
                Enroll Now
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
