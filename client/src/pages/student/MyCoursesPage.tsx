import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, AlertTriangle, ShieldCheck, RefreshCw, ArrowRight, Layers, LayoutGrid, Sparkles } from "lucide-react";
import { Card, Button, Badge, ProgressBar, EmptyState, Skeleton } from "../../components/ui";
import { studentApi } from "../../api/endpoints/student";
import { Enrollment } from "../../types";
import { splitEnrollmentsByStatus } from "../../utils/enrollments";
import { CourseCard } from "../../components/student/CourseCard";
import { CourseModuleBreakdown } from "../../components/student/CourseModuleBreakdown";

type ViewMode = "grid" | "modules";
type LoadState = "loading" | "error" | "data";

export const MyCoursesPage: React.FC = () => {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const fetchEnrollments = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const data = await studentApi.getMyEnrollments();
      setEnrollments(data);
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load student enrollments", err);
      setLoadErrorMsg(err?.message || "Failed to load your enrolled courses.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  // `GET /student/courses` deliberately returns every enrollment (active AND
  // expired) — this split is what turns that flat list into the page's two
  // sections. See client/src/utils/enrollments.ts.
  const { active: activeEnrollments, expired: expiredEnrollments } = splitEnrollmentsByStatus(enrollments);

  if (loadState === "loading") {
    return (
      <div className="space-y-8 pb-12">
        <Skeleton variant="text" className="h-8 w-72" />
        <Skeleton variant="text" className="h-4 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
          <Skeleton variant="card" className="h-56 rounded-2xl" />
          <Skeleton variant="card" className="h-56 rounded-2xl" />
          <Skeleton variant="card" className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="py-12">
        <EmptyState
          icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load your courses"
          description={loadErrorMsg}
          actionLabel="Retry"
          onAction={fetchEnrollments}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header & View Mode Switcher */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0E2A47]">My Enrolled Courses</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Access active video lectures, monitor lesson module & sub-section completion, and manage course validity.
          </p>
        </div>

        {/* View Mode Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-xl shrink-0 self-start sm:self-auto border border-slate-300/60">
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "grid"
                ? "bg-white text-[#0E2A47] shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[#0FA3A3]" />
            <span>Course Cards</span>
          </button>
          <button
            onClick={() => setViewMode("modules")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "modules"
                ? "bg-[#0E2A47] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#0FA3A3]" />
            <span>Module Breakdown</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-teal-500 text-white">
              New
            </span>
          </button>
        </div>
      </div>

      {/* Main View Mode: A. Module Breakdown View */}
      {viewMode === "modules" ? (
        <div className="space-y-6">
          <div className="bg-teal-50/60 border border-teal-200 p-4 rounded-2xl flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <h4 className="font-bold text-[#0E2A47]">Lesson Module & Sub-section Progress Visualizer</h4>
              <p>
                Track animated completion bars down to individual video lectures and sub-sections across all your active course subscriptions.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {activeEnrollments.map((e) => (
              <CourseModuleBreakdown
                key={e.id}
                courseId={e.courseId}
                courseTitle={e.courseTitle}
                initiallyExpanded={true}
              />
            ))}
          </div>
        </div>
      ) : (
        /* View Mode: B. Standard Course Cards View */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-base font-extrabold text-[#0E2A47] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0FA3A3]" /> Active & Expiring Soon Subscriptions
            </h2>
            <Badge variant="teal" size="sm">{activeEnrollments.length} Active Courses</Badge>
          </div>

          {activeEnrollments.length === 0 ? (
            <Card className="p-8 text-center space-y-3 bg-slate-50 border-dashed border-slate-300">
              <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-[#0E2A47]">No Active Course Subscriptions</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Explore the SAMS Academy course catalog to enroll in NRE Step 1, SMLE, or MBBS preparation masterclasses.
              </p>
              <Link to="/courses">
                <Button variant="teal" size="sm">Browse Course Catalog</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeEnrollments.map((e) => (
                <CourseCard
                  key={e.id}
                  enrollment={e}
                  courseSlug={e.courseId === 1 ? "nre-step-1-complete" : e.courseId === 2 ? "smle-crash-course" : "mbbs-clinical-foundations"}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expired Subscriptions Section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-base font-extrabold text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" /> Expired Subscriptions
          </h2>
          <Badge variant="danger" size="sm">{expiredEnrollments.length} Expired</Badge>
        </div>

        {expiredEnrollments.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
            You have no expired course subscriptions.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {expiredEnrollments.map((e) => (
              <CourseCard
                key={e.id}
                enrollment={e}
                courseSlug={e.courseId === 1 ? "nre-step-1-complete" : e.courseId === 2 ? "smle-crash-course" : "mbbs-clinical-foundations"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

