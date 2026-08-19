import React from "react";
import {
  Clock,
  CheckCircle2,
  BookOpen,
  HelpCircle,
  Monitor,
  Flame,
  Edit,
  Trash2,
  Power,
  Sparkles,
  Layers,
} from "lucide-react";
import { Badge, Button } from "../ui";
import { Course, SubscriptionPackage } from "../../types";
import { formatPKR, cn } from "../../utils/formatters";

export interface PackageCardProps {
  pkg: SubscriptionPackage;
  courses: Course[];
  onEdit: (pkg: SubscriptionPackage) => void;
  onToggleActive: (id: number) => void;
  onDelete: (pkg: SubscriptionPackage) => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  pkg,
  courses,
  onEdit,
  onToggleActive,
  onDelete,
}) => {
  const hasDiscount =
    pkg.originalPrice !== null &&
    pkg.originalPrice !== undefined &&
    pkg.originalPrice > pkg.price;
  const savingsAmount = hasDiscount ? pkg.originalPrice! - pkg.price : 0;
  const savingsPercentage = hasDiscount
    ? Math.round((savingsAmount / pkg.originalPrice!) * 100)
    : 0;

  // Resolve included course names
  const resolvedCourses: { id: number; title: string; category?: string }[] = [];
  if (pkg.includedCourseIds && pkg.includedCourseIds.length > 0) {
    for (const courseId of pkg.includedCourseIds) {
      const found = courses.find((c) => c.id === courseId);
      if (found) {
        resolvedCourses.push({ id: found.id, title: found.title, category: found.examCategory });
      } else if (pkg.includedCourses) {
        const fallback = pkg.includedCourses.find((ic) => ic.id === courseId);
        if (fallback) {
          resolvedCourses.push({ id: fallback.id, title: fallback.title, category: fallback.examCategory });
        }
      }
    }
  } else if (pkg.includedCourses && pkg.includedCourses.length > 0) {
    for (const ic of pkg.includedCourses) {
      resolvedCourses.push({ id: ic.id, title: ic.title, category: ic.examCategory });
    }
  }

  const isHighlighted = pkg.isPopular || Boolean(pkg.badge);

  return (
    <div
      className={cn(
        "relative rounded-2xl transition-all duration-200 flex flex-col justify-between overflow-hidden",
        isHighlighted
          ? "border-2 border-[#0FA3A3] shadow-md hover:shadow-lg bg-gradient-to-b from-teal-50/30 via-white to-white ring-4 ring-[#0FA3A3]/10"
          : "border border-slate-200 shadow-xs hover:shadow-md bg-white"
      )}
    >
      {/* Top Banner for Popular or Custom Badge */}
      {pkg.badge && (
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[11px] font-bold uppercase tracking-wider py-1 px-4 text-center flex items-center justify-center gap-1.5 shadow-xs">
          <Flame className="w-3.5 h-3.5 fill-current" />
          <span>{pkg.badge}</span>
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col space-y-4">
        {/* Header Badges & Status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="indigo" size="sm">
              {pkg.examCategory}
            </Badge>
            {pkg.isPopular && !pkg.badge && (
              <Badge variant="warning" size="sm">
                Featured
              </Badge>
            )}
          </div>
          <Badge variant={pkg.isActive ? "teal" : "gray"} size="sm">
            {pkg.isActive ? "ACTIVE" : "DRAFT"}
          </Badge>
        </div>

        {/* Title & Description */}
        <div>
          <h3 className="text-lg font-bold text-[#0E2A47] leading-snug group-hover:text-[#0FA3A3] transition-colors line-clamp-2">
            {pkg.title}
          </h3>
          {pkg.description && (
            <p className="text-xs text-[#64748B] mt-1.5 line-clamp-3 leading-relaxed">
              {pkg.description}
            </p>
          )}
        </div>

        {/* Pricing Block */}
        <div className="pt-2 pb-3 border-y border-slate-100 space-y-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#0E2A47]">
              {formatPKR(pkg.price)}
            </span>
            {hasDiscount && (
              <div className="flex items-center gap-1.5">
                <span className="line-through text-xs font-semibold text-slate-400">
                  {formatPKR(pkg.originalPrice!)}
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {savingsPercentage}% OFF
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100/90 px-2.5 py-1 rounded-md font-medium">
              <Clock className="w-3.5 h-3.5 text-[#0FA3A3]" />
              <span>{pkg.validityDays} Days Full Access</span>
            </div>
            {hasDiscount && (
              <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Save {formatPKR(savingsAmount)}
              </span>
            )}
          </div>
        </div>

        {/* Modules & Feature Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {pkg.includesQbank && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
              <HelpCircle className="w-3 h-3" /> QBank
            </span>
          )}
          {pkg.includesMockExams && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200/60">
              <Layers className="w-3 h-3" /> Mock Exams
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            <Monitor className="w-3 h-3" /> {pkg.maxDevices || 2} Devices
          </span>
        </div>

        {/* Included Courses Section */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>Included Video Courses ({resolvedCourses.length})</span>
          </div>
          {resolvedCourses.length > 0 ? (
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {resolvedCourses.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 p-1.5 rounded-md bg-slate-50 text-xs text-slate-700 border border-slate-100"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0FA3A3] shrink-0" />
                  <span className="truncate font-medium flex-1">{c.title}</span>
                  {c.category && (
                    <span className="text-[10px] text-slate-400 uppercase font-semibold shrink-0">
                      {c.category}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No specific courses assigned</p>
          )}
        </div>

        {/* Features Checklist */}
        {pkg.features && pkg.features.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
              Package Features
            </span>
            <ul className="space-y-1.5">
              {pkg.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 leading-snug">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Card Actions / Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onToggleActive(pkg.id)}
          className={cn(
            "text-xs font-semibold px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer",
            pkg.isActive
              ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
              : "text-slate-600 bg-white border-slate-200 hover:bg-slate-100"
          )}
          title={pkg.isActive ? "Click to deactivate package" : "Click to activate package"}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{pkg.isActive ? "Active" : "Draft"}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onEdit(pkg)}
            leftIcon={<Edit className="w-3.5 h-3.5" />}
          >
            Edit Plan
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:bg-red-50 hover:text-red-600 p-2"
            onClick={() => onDelete(pkg)}
            aria-label="Delete Package"
            title="Delete Package"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
