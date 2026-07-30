import React from "react";
import { cn } from "../../utils/formatters";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, hover, hoverable, ...props }) => {
  const isHoverable = hover ?? hoverable ?? false;
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all duration-150",
        isHoverable && "hover:border-slate-300 hover:shadow-md cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => {
  return (
    <div className={cn("flex flex-col space-y-1.5 mb-4", className)} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => {
  return (
    <h3 className={cn("text-lg font-semibold text-[#0E2A47] tracking-tight", className)} {...props}>
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => {
  return (
    <p className={cn("text-xs text-[#64748B]", className)} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => {
  return (
    <div className={cn("", className)} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => {
  return (
    <div className={cn("flex items-center justify-between pt-4 mt-4 border-t border-slate-100", className)} {...props}>
      {children}
    </div>
  );
};
