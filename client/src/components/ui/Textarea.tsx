import React from "react";
import { cn } from "../../utils/formatters";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className, id, rows = 4, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-semibold uppercase tracking-wider text-[#1E293B]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(
            "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-[#1E293B] placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]/20 focus:border-[#0FA3A3] disabled:bg-slate-50 disabled:cursor-not-allowed",
            error ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/20" : "border-slate-300",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-[#DC2626]">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-[#64748B]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
