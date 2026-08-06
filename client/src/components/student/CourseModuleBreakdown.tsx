import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  PlayCircle,
  CheckCircle2,
  Clock,
  Layers,
  AlertCircle,
} from "lucide-react";
import { ProgressBar, Badge, Button, Skeleton, EmptyState } from "../ui";
import { studentApi } from "../../api/endpoints/student";
import { ModuleProgress, buildModulesFromSections } from "../../utils/courseModules";

// Re-exported for backward compatibility with any existing import of these types
// from this component file (this is where they used to be defined).
export type { SubSectionProgress, ModuleProgress } from "../../utils/courseModules";

interface CourseModuleBreakdownProps {
  courseId: number;
  courseTitle: string;
  /**
   * Explicit override — when a caller already has real curriculum data on
   * hand (e.g. from its own `GET /student/courses/:courseId` fetch), it can
   * pass the transformed real modules directly and this component will skip
   * its own fetch. When omitted (the common case — neither CourseCard's
   * expandable panel nor MyCoursesPage's "Module Breakdown" tab have full
   * curriculum data up front, only the enrollment list), this component
   * fetches its own real data for `courseId` on mount. Since this component
   * is only ever mounted lazily (behind a "Module Progress" toggle in
   * CourseCard, or when the user selects the "Module Breakdown" tab in
   * MyCoursesPage — never eagerly for every enrollment on initial page
   * load), self-fetching here does not create an N+1 storm: at most one
   * request per course the user actually chose to expand/view, bounded by
   * their own real enrollment count.
   */
  modules?: ModuleProgress[];
  initiallyExpanded?: boolean;
}

type LoadState = "loading" | "error" | "empty" | "data";

export const CourseModuleBreakdown: React.FC<CourseModuleBreakdownProps> = ({
  courseId,
  courseTitle,
  modules: modulesOverride,
  initiallyExpanded = false,
}) => {
  const [isCourseExpanded, setIsCourseExpanded] = useState(initiallyExpanded);
  const [expandedModuleId, setExpandedModuleId] = useState<number | null>(
    modulesOverride?.[0]?.id ?? null
  );
  const [loadState, setLoadState] = useState<LoadState>(modulesOverride ? "data" : "loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");
  const [fetchedModules, setFetchedModules] = useState<ModuleProgress[]>(modulesOverride || []);

  const loadModules = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const data = await studentApi.getEnrolledCourseDetails(courseId);
      const built = buildModulesFromSections(data.sections || []);
      setFetchedModules(built);
      setLoadState(built.length > 0 ? "data" : "empty");
    } catch (err: any) {
      console.error("Failed to load module breakdown", err);
      setLoadErrorMsg(err?.message || "Failed to load this course's module breakdown.");
      setLoadState("error");
    }
  }, [courseId]);

  useEffect(() => {
    // Caller already supplied real data — nothing to fetch.
    if (modulesOverride) return;
    loadModules();
  }, [loadModules, modulesOverride]);

  const modules = modulesOverride ?? fetchedModules;

  // Auto-expand the first module once real data actually arrives (mirrors the
  // previous synchronous-fixture behavior, now safe for async-loaded data).
  useEffect(() => {
    if (expandedModuleId === null && modules.length > 0) {
      setExpandedModuleId(modules[0].id);
    }
  }, [modules, expandedModuleId]);

  // Compute Overall Course Completion Metrics across modules and sub-sections
  let totalCourseMinutes = 0;
  let totalWatchedMinutes = 0;
  let totalSubSectionsCount = 0;

  modules.forEach((mod) => {
    mod.subSections.forEach((sub) => {
      totalCourseMinutes += sub.durationMinutes;
      totalWatchedMinutes += sub.watchedMinutes;
      totalSubSectionsCount += 1;
    });
  });

  const overallCoursePercent = totalCourseMinutes > 0
    ? Math.round((totalWatchedMinutes / totalCourseMinutes) * 100)
    : 0;

  if (loadState === "loading") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs p-4 sm:p-5 space-y-3">
        <Skeleton variant="text" className="h-5 w-2/3" />
        <Skeleton variant="text" className="h-3 w-1/3" />
        <Skeleton variant="card" className="h-16 rounded-xl" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 overflow-hidden shadow-xs p-4 sm:p-5">
        <EmptyState
          icon={<AlertCircle className="w-8 h-8 text-rose-500" />}
          title="Couldn't load module breakdown"
          description={loadErrorMsg}
          actionLabel="Retry"
          onAction={loadModules}
        />
      </div>
    );
  }

  if (loadState === "empty") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs p-4 sm:p-5">
        <EmptyState
          icon={<Layers className="w-8 h-8 text-slate-400" />}
          title="No modules published yet"
          description={`${courseTitle} doesn't have any curriculum sections published yet.`}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-0">
      {/* Course Module Breakdown Card Header */}
      <div
        onClick={() => setIsCourseExpanded(!isCourseExpanded)}
        className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-teal-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-100/80 transition-all border-b border-slate-200/70"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#0E2A47] text-[#0FA3A3] shrink-0 shadow-2xs">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0FA3A3] bg-teal-50 border border-teal-200/60 px-2 py-0.5 rounded-md">
                Modules & Sub-sections Breakdown
              </span>
              <span className="text-[11px] text-slate-500 font-semibold">
                {modules.length} Modules • {totalSubSectionsCount} Sub-sections
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-extrabold text-[#0E2A47]">
              {courseTitle}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:self-center">
          <div className="w-40 sm:w-48 text-right">
            <div className="flex justify-between items-center text-xs font-bold mb-1">
              <span className="text-slate-500 text-[11px]">Course Completion</span>
              <span className="text-[#0E2A47]">{overallCoursePercent}%</span>
            </div>
            <ProgressBar progress={overallCoursePercent} size="sm" animated />
          </div>
          <button className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-colors">
            {isCourseExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Course Modules List */}
      {isCourseExpanded && (
        <div className="divide-y divide-slate-100 p-3 sm:p-4 bg-slate-50/50 space-y-3 transition-all duration-300">
          {modules.map((moduleItem, modIdx) => {
              // Calculate module level progress percent
              let modTotalMins = 0;
              let modWatchedMins = 0;
              let modCompletedSubs = 0;

              moduleItem.subSections.forEach((sub) => {
                modTotalMins += sub.durationMinutes;
                modWatchedMins += sub.watchedMinutes;
                if (sub.isCompleted || sub.watchedMinutes >= sub.durationMinutes) {
                  modCompletedSubs += 1;
                }
              });

              const modulePercent = modTotalMins > 0
                ? Math.round((modWatchedMins / modTotalMins) * 100)
                : 0;

              const isModExpanded = expandedModuleId === moduleItem.id;

              return (
                <div
                  key={moduleItem.id}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
                >
                  {/* Module Header */}
                  <div
                    onClick={() => setExpandedModuleId(isModExpanded ? null : moduleItem.id)}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 text-[#0FA3A3] flex items-center justify-center font-extrabold text-xs shrink-0 border border-teal-200/60">
                        M{modIdx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h5 className="text-xs sm:text-sm font-bold text-[#0E2A47]">
                            {moduleItem.title}
                          </h5>
                          {modulePercent === 100 && (
                            <Badge variant="emerald" size="sm" className="py-0 px-1.5 text-[10px]">
                              Completed ✓
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {modCompletedSubs} of {moduleItem.subSections.length} sub-sections completed • {modWatchedMins} of {modTotalMins} mins watched
                        </p>
                      </div>
                    </div>

                    {/* Module Animated Progress Bar */}
                    <div className="flex items-center gap-3 sm:w-64 shrink-0">
                      <div className="flex-1">
                        <div className="flex justify-between items-center text-[11px] font-bold mb-1">
                          <span className="text-slate-500">Module Progress</span>
                          <span className="text-[#0FA3A3]">{modulePercent}%</span>
                        </div>
                        <ProgressBar
                          progress={modulePercent}
                          variant={modulePercent === 100 ? "success" : modulePercent > 0 ? "teal" : "navy"}
                          size="sm"
                          animated
                        />
                      </div>
                      <span className="text-slate-400">
                        {isModExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </div>
                  </div>

                  {/* Sub-sections List */}
                  {isModExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/80 p-3 sm:p-4 space-y-2.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                        Sub-section Video Lessons ({moduleItem.subSections.length})
                      </span>

                      {moduleItem.subSections.map((subItem) => {
                        const subPercent = subItem.durationMinutes > 0
                          ? Math.round((subItem.watchedMinutes / subItem.durationMinutes) * 100)
                          : 0;

                        return (
                          <div
                            key={subItem.id}
                            className={`p-3 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:shadow-2xs ${
                              subItem.isCompleted
                                ? "border-emerald-200/80 bg-emerald-50/10"
                                : subPercent > 0
                                ? "border-teal-200 bg-teal-50/10"
                                : "border-slate-200"
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {/* Icon Status */}
                              {subItem.isCompleted ? (
                                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                              ) : subPercent > 0 ? (
                                <div className="p-1.5 rounded-lg bg-teal-100 text-[#0FA3A3] shrink-0 mt-0.5">
                                  <PlayCircle className="w-4 h-4" />
                                </div>
                              ) : (
                                <div className="p-1.5 rounded-lg bg-slate-100 text-slate-400 shrink-0 mt-0.5">
                                  <Clock className="w-4 h-4" />
                                </div>
                              )}

                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h6 className="text-xs sm:text-sm font-bold text-[#0E2A47]">
                                    {subItem.title}
                                  </h6>
                                  {subItem.isFreePreview && (
                                    <span className="text-[9px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded-xs border border-teal-200">
                                      Free Preview
                                    </span>
                                  )}
                                </div>
                                {subItem.description && (
                                  <p className="text-[11px] text-slate-500 line-clamp-1">
                                    {subItem.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Sub-section Animated Progress Bar & CTA */}
                            <div className="flex items-center gap-3 sm:w-72 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                              <div className="flex-1">
                                <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 mb-1">
                                  <span>{subItem.watchedMinutes} / {subItem.durationMinutes} mins</span>
                                  <span className="font-bold text-[#0E2A47]">{subPercent}%</span>
                                </div>
                                <ProgressBar
                                  progress={subPercent}
                                  variant={subItem.isCompleted ? "success" : subPercent > 0 ? "teal" : "navy"}
                                  size="sm"
                                  animated
                                />
                              </div>

                              <Link to={`/app/courses/${courseId}/player?lectureId=${subItem.id}`}>
                                <Button
                                  size="xs"
                                  variant={subItem.isCompleted ? "outline" : "teal"}
                                  className="font-bold text-xs whitespace-nowrap"
                                >
                                  {subItem.isCompleted ? "Review" : subPercent > 0 ? "Resume" : "Start"}
                                </Button>
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
