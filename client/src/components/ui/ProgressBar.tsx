import React, { useEffect, useState } from "react";
import { cn } from "../../utils/formatters";

export interface ProgressBarProps {
  percentage?: number;
  value?: number;
  progress?: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  color?: "teal" | "navy" | "success" | "warning" | "danger" | string;
  variant?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percentage,
  value,
  progress,
  max = 100,
  label,
  showValue = false,
  color = "teal",
  variant,
  size = "md",
  className,
  animated = true,
}) => {
  const rawVal = percentage ?? value ?? progress ?? 0;
  const actualVal = max !== 100 ? (rawVal / max) * 100 : rawVal;
  const clamped = Math.min(100, Math.max(0, actualVal));
  const effectiveColor = variant || color;

  // React state for smooth mounted animation
  const [currentWidth, setCurrentWidth] = useState(animated ? 0 : clamped);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setCurrentWidth(clamped);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setCurrentWidth(clamped);
    }
  }, [clamped, animated]);

  const colorStyles = {
    teal: "bg-[#0FA3A3]",
    navy: "bg-[#0E2A47]",
    success: "bg-[#16A34A]",
    warning: "bg-[#D97706]",
    danger: "bg-[#DC2626]",
  };

  const heightStyles = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center text-xs">
          {label && <span className="font-medium text-[#1E293B]">{label}</span>}
          {showValue && <span className="font-semibold text-[#64748B]">{Math.round(clamped)}%</span>}
        </div>
      )}
      <div className={cn("w-full rounded-full bg-slate-200/80 overflow-hidden relative shadow-inner", heightStyles[size])}>
        <div
          className={cn(
            "h-full rounded-full relative overflow-hidden transition-all duration-700 ease-out",
            colorStyles[effectiveColor as keyof typeof colorStyles] || "bg-[#0FA3A3]"
          )}
          style={{ width: `${currentWidth}%` }}
        >
          {/* Subtle shiny animated gradient highlight overlay */}
          {animated && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
};

