import React from "react";
import { Check } from "lucide-react";
import { cn } from "../../utils/formatters";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className, id, checked, ...props }, ref) => {
    const checkboxId = id || (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="space-y-1">
        <label htmlFor={checkboxId} className="inline-flex items-start gap-2.5 cursor-pointer select-none">
          <div className="relative flex items-center justify-center mt-0.5">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              checked={checked}
              className="sr-only peer"
              {...props}
            />
            <div
              className={cn(
                "w-4 h-4 rounded border transition-all flex items-center justify-center bg-white peer-focus:ring-2 peer-focus:ring-[#0FA3A3]/20",
                checked ? "bg-[#0FA3A3] border-[#0FA3A3] text-white" : "border-slate-300 hover:border-slate-400",
                error && "border-[#DC2626]"
              )}
            >
              {checked && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          </div>
          {label && <span className="text-sm text-[#1E293B] leading-tight">{label}</span>}
        </label>
        {error && <p className="text-xs text-[#DC2626] pl-6">{error}</p>}
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";
