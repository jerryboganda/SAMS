import React from "react";
import { cn } from "../../utils/formatters";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "teal" | "navy" | "success" | "warning" | "danger" | "outline" | "secondary" | "emerald" | "neutral" | "indigo" | "blue" | "slate" | "gray";
  size?: "sm" | "md" | "lg";
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  className,
  ...props
}) => {
  const baseStyles = "inline-flex items-center font-medium rounded-full select-none";

  const variantStyles: Record<string, string> = {
    default: "bg-slate-100 text-slate-800",
    secondary: "bg-slate-100 text-slate-700 border border-slate-200",
    neutral: "bg-slate-100 text-slate-700",
    teal: "bg-[#0FA3A3]/10 text-[#0FA3A3] border border-[#0FA3A3]/20",
    navy: "bg-[#0E2A47] text-white",
    success: "bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20",
    emerald: "bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20",
    warning: "bg-[#D97706]/10 text-[#D97706] border border-[#D97706]/20",
    danger: "bg-[#DC2626]/10 text-[#DC2626] border border-[#DC2626]/20",
    indigo: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-200",
    slate: "bg-slate-100 text-slate-700 border border-slate-200",
    gray: "bg-slate-100 text-slate-700 border border-slate-200",
    outline: "border border-slate-300 text-slate-700 bg-transparent",
  };

  const sizeStyles = {
    sm: "text-[10px] px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
    lg: "text-sm px-3 py-1.5 font-semibold",
  };

  return (
    <span className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)} {...props}>
      {children}
    </span>
  );
};
