import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Play, Clock, AlertTriangle, RefreshCw, BookOpen, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { Card, Button, Badge, ProgressBar } from "../ui";
import { Enrollment } from "../../types";
import { CourseModuleBreakdown } from "./CourseModuleBreakdown";

interface CourseCardProps {
  enrollment: Enrollment;
  /**
   * Real per-lecture counts, when the caller actually has them (e.g. from
   * `GET /student/courses/:courseId`'s curriculum response). Deliberately no
   * fabricated defaults here — `Enrollment` itself only carries an aggregate
   * `progressPercent` (rendered by the bar above, always real), not a lecture
   * count; a caller that doesn't have real counts should simply omit these
   * props rather than pass a guessed number. See DECISIONS.md's Phase
   * 6.2-6.3 entry (this replaced a hardcoded "X of 28 lectures" fallback that
   * had nothing to do with the actual enrolled course).
   */
  totalLectures?: number;
  completedLectures?: number;
  /**
   * Explicit override, when a caller already has a courseSlug from somewhere
   * other than `enrollment.courseSlug` (e.g. a fresher lookup). Most callers
   * should omit this and let it fall through to the real
   * `enrollment.courseSlug` field (server/src/services/studentCourseService.js
   * #serializeEnrollment) below — never a hardcoded per-course guess.
   */
  courseSlug?: string;
  showModuleBreakdownInitially?: boolean;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  enrollment,
  totalLectures,
  completedLectures,
  courseSlug,
  showModuleBreakdownInitially = false,
}) => {
  const resolvedCourseSlug = courseSlug ?? enrollment.courseSlug;
  const [showModules, setShowModules] = useState(showModuleBreakdownInitially);

  const isExpired = enrollment.status === "expired" || (enrollment.remainingDays !== undefined && enrollment.remainingDays <= 0);
  const isExpiringSoon = !isExpired && enrollment.remainingDays !== undefined && enrollment.remainingDays <= 14;

  const hasRealLectureCounts =
    typeof totalLectures === "number" && typeof completedLectures === "number" && totalLectures > 0;
  const remainingLectures = hasRealLectureCounts ? Math.max(0, totalLectures! - completedLectures!) : undefined;

  // Render Expiry Badge based on the three states
  const renderExpiryBadge = () => {
    if (isExpired) {
      return (
        <Badge variant="danger" size="sm" className="font-bold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Subscription Expired
        </Badge>
      );
    }
    if (isExpiringSoon) {
      return (
        <Badge variant="warning" size="sm" className="font-bold flex items-center gap-1">
          <Clock className="w-3 h-3 shrink-0" />
          {enrollment.remainingDays} Days Left (Expiring Soon)
        </Badge>
      );
    }
    return (
      <Badge variant="teal" size="sm" className="font-bold flex items-center gap-1">
        <Clock className="w-3 h-3 shrink-0" />
        {enrollment.remainingDays ?? 180} Days Validity
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      <Card className={`p-5 border flex flex-col justify-between transition-all duration-200 hover:shadow-md ${
        isExpired ? "border-rose-200 bg-rose-50/20" : isExpiringSoon ? "border-amber-200 bg-amber-50/10" : "border-slate-200"
      }`}>
        <div className="space-y-4">
          {/* Card Header */}
          <div className="flex items-start gap-3.5">
            <img
              src={enrollment.courseThumbnail || "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=400&q=80"}
              alt={enrollment.courseTitle}
              className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0 shadow-sm"
            />
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {renderExpiryBadge()}
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#0E2A47] line-clamp-2 leading-snug">
                {enrollment.courseTitle}
              </h3>
            </div>
          </div>

          {/* Progress & Lectures Remaining */}
          <div className="space-y-2 pt-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-600 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-[#0FA3A3]" /> Overall Progress
              </span>
              <span className="font-bold text-[#0E2A47]">{enrollment.progressPercent || 0}%</span>
            </div>
            <ProgressBar
              progress={enrollment.progressPercent || 0}
              variant={isExpired ? "danger" : isExpiringSoon ? "warning" : "teal"}
              animated
            />
            {hasRealLectureCounts && (
              <div className="flex justify-between items-center text-[11px] text-slate-500 pt-0.5 font-medium">
                <span>{completedLectures} of {totalLectures} lectures completed</span>
                <span className="font-bold text-slate-700">{remainingLectures} remaining</span>
              </div>
            )}
          </div>
        </div>

        {/* Card Footer / Action CTA */}
        <div className="pt-4 mt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setShowModules(!showModules)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0FA3A3] hover:text-[#0E2A47] px-2.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Module Progress</span>
            {showModules ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {isExpired ? (
            <Link to={resolvedCourseSlug ? `/checkout/${resolvedCourseSlug}` : "/courses"}>
              <Button size="sm" variant="danger" icon={<RefreshCw className="w-3.5 h-3.5" />}>
                Renew Subscription
              </Button>
            </Link>
          ) : (
            <Link to={`/app/courses/${enrollment.courseId}`}>
              <Button size="sm" variant="teal" icon={<Play className="w-3.5 h-3.5" />}>
                Open Course
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {/* Expandable Module & Sub-section Breakdown Panel */}
      {showModules && (
        <CourseModuleBreakdown
          courseId={enrollment.courseId}
          courseTitle={enrollment.courseTitle}
          initiallyExpanded={true}
        />
      )}
    </div>
  );
};

