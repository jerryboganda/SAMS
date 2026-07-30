import React from "react";
import { cn } from "../../utils/formatters";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "card" | "circle" | "button";
}

export const Skeleton: React.FC<SkeletonProps> = ({ variant = "text", className, ...props }) => {
  const base = "animate-pulse bg-slate-200 rounded-lg";

  const variantClasses = {
    text: "h-4 w-full",
    card: "h-32 w-full",
    circle: "h-10 w-10 rounded-full",
    button: "h-10 w-28",
  };

  return <div className={cn(base, variantClasses[variant], className)} {...props} />;
};
