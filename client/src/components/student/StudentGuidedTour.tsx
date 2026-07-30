import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Search,
  BookOpen,
  FileQuestion,
  Bell,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  HelpCircle,
  Compass,
} from "lucide-react";
import { Button } from "../ui";

export interface TourStep {
  targetId: string;
  title: string;
  description: string;
  icon: React.ElementType;
  position: "top" | "bottom" | "left" | "right";
  badgeText?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "tour-search-bar",
    title: "Universal Search (⌘K)",
    description:
      "Quickly search across video lectures, QBank subjects, body systems, clinical vignettes, and mock exams from anywhere in the portal.",
    icon: Search,
    position: "bottom",
    badgeText: "Search Engine",
  },
  {
    targetId: "tour-sidebar-nav",
    title: "Portal Sidebar Navigation",
    description:
      "Navigate smoothly between your enrolled courses, custom QBank practice sessions, mock exams, analytics, and bookmarks.",
    icon: BookOpen,
    position: "right",
    badgeText: "Main Hub",
  },
  {
    targetId: "tour-qbank-link",
    title: "QBank & Custom Test Creator",
    description:
      "Create personalized practice tests filtered by medical subjects (Pathology, Pharmacology, etc.), body systems, and test modes.",
    icon: FileQuestion,
    position: "right",
    badgeText: "High-Yield Practice",
  },
  {
    targetId: "tour-notifications",
    title: "Live Portal Notifications",
    description:
      "Stay informed about new lecture releases, mock exam schedules, order verification status, and clinical updates.",
    icon: Bell,
    position: "bottom",
    badgeText: "Alerts",
  },
  {
    targetId: "tour-profile-menu",
    title: "Candidate Profile & Receipts",
    description:
      "Manage your candidate details, active DRM registered devices, and view detailed payment receipts & invoice records.",
    icon: UserIcon,
    position: "bottom",
    badgeText: "Account Settings",
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const StudentGuidedTour: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  // Check if first time user on mount
  useEffect(() => {
    try {
      const completed = localStorage.getItem("sams_guided_tour_completed");
      if (!completed) {
        // Auto start tour for first-time visitors after short delay
        const timer = setTimeout(() => {
          setIsActive(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for custom trigger event (for manual restart)
  useEffect(() => {
    const handleStartTour = () => {
      setCurrentStepIndex(0);
      setIsActive(true);
    };
    window.addEventListener("start-student-guided-tour", handleStartTour);
    return () => window.removeEventListener("start-student-guided-tour", handleStartTour);
  }, []);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // Update target bounding box
  const updateTargetRect = useCallback(() => {
    if (!isActive || !currentStep) return;

    const el = document.getElementById(currentStep.targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      // Scroll element into view if needed
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      // Fallback center position if element is hidden (e.g., mobile collapsed sidebar)
      setTargetRect(null);
    }
  }, [isActive, currentStep]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect);
    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect);
    };
  }, [updateTargetRect, currentStepIndex]);

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      finishTour();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const finishTour = () => {
    setIsActive(false);
    try {
      localStorage.setItem("sams_guided_tour_completed", "true");
    } catch {
      // ignore
    }
  };

  if (!isActive) return null;

  const IconComponent = currentStep.icon;

  // Compute Tooltip Popover Style Positioning
  let tooltipStyle: React.CSSProperties = {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };

  if (targetRect) {
    const padding = 12;
    const isMobile = window.innerWidth < 640;

    if (isMobile) {
      // Mobile fallback: position near bottom or top
      tooltipStyle = {
        bottom: "24px",
        left: "16px",
        right: "16px",
        width: "calc(100vw - 32px)",
        transform: "none",
      };
    } else {
      switch (currentStep.position) {
        case "bottom":
          tooltipStyle = {
            top: `${targetRect.top + targetRect.height + padding}px`,
            left: `${Math.max(16, Math.min(window.innerWidth - 380, targetRect.left))}px`,
          };
          break;
        case "right":
          tooltipStyle = {
            top: `${Math.max(16, targetRect.top)}px`,
            left: `${targetRect.left + targetRect.width + padding}px`,
          };
          break;
        case "top":
          tooltipStyle = {
            top: `${targetRect.top - padding}px`,
            left: `${targetRect.left}px`,
            transform: "translateY(-100%)",
          };
          break;
        case "left":
          tooltipStyle = {
            top: `${targetRect.top}px`,
            left: `${targetRect.left - padding}px`,
            transform: "translateX(-100%)",
          };
          break;
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto">
      {/* Semi-transparent dark overlay */}
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-2xs transition-all duration-300" />

      {/* Spotlight cutout border highlight around target element */}
      {targetRect && (
        <div
          style={{
            top: `${targetRect.top - 6}px`,
            left: `${targetRect.left - 6}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
          }}
          className="absolute rounded-2xl border-2 border-[#0FA3A3] shadow-[0_0_25px_rgba(15,163,163,0.6)] bg-transparent transition-all duration-300 pointer-events-none ring-4 ring-[#0FA3A3]/20 animate-pulse"
        />
      )}

      {/* Guided Tour Tooltip Card */}
      <div
        style={tooltipStyle}
        className="fixed z-50 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header line: step badge & close button */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-[#0FA3A3] font-bold text-[11px] border border-teal-200/60 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Step {currentStepIndex + 1} of {TOUR_STEPS.length}
            </span>
            {currentStep.badgeText && (
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                {currentStep.badgeText}
              </span>
            )}
          </div>
          <button
            onClick={finishTour}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            title="Skip Tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#0E2A47] text-[#0FA3A3] shrink-0">
              <IconComponent className="w-5 h-5" />
            </div>
            <h4 className="text-base font-extrabold text-[#0E2A47]">
              {currentStep.title}
            </h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-normal">
            {currentStep.description}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {TOUR_STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStepIndex(idx)}
              className={`h-1.5 rounded-full transition-all ${
                idx === currentStepIndex
                  ? "w-6 bg-[#0FA3A3]"
                  : "w-1.5 bg-slate-200 hover:bg-slate-300"
              }`}
              title={`Go to step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Footer Navigation Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            onClick={finishTour}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 transition-colors"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <Button
                variant="outline"
                size="xs"
                onClick={handlePrev}
                className="flex items-center gap-1 border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </Button>
            )}

            <Button
              variant="teal"
              size="xs"
              onClick={handleNext}
              className="flex items-center gap-1 font-bold shadow-xs"
            >
              {currentStepIndex === TOUR_STEPS.length - 1 ? (
                <>
                  <span>Got it! Finish</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
