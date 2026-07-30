import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../utils/formatters";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, hint, leftIcon, rightIcon, icon, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
    const effectiveLeftIcon = leftIcon || icon;
    const effectiveHelperText = helperText || hint;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-[#1E293B]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {effectiveLeftIcon && <div className="absolute left-3 text-slate-400 pointer-events-none">{effectiveLeftIcon}</div>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-[#1E293B] placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]/20 focus:border-[#0FA3A3] disabled:bg-slate-50 disabled:cursor-not-allowed",
              effectiveLeftIcon && "pl-10",
              rightIcon && "pr-10",
              error ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/20" : "border-slate-300",
              className
            )}
            {...props}
          />
          {rightIcon && <div className="absolute right-3 text-slate-400">{rightIcon}</div>}
        </div>
        {error ? (
          <p className="text-xs text-[#DC2626]">{error}</p>
        ) : effectiveHelperText ? (
          <p className="text-xs text-[#64748B]">{effectiveHelperText}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <Input
        ref={ref}
        type={showPassword ? "text" : "password"}
        rightIcon={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-slate-400 hover:text-slate-600 focus:outline-none p-1"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
        className={className}
        {...props}
      />
    );
  }
);
PasswordInput.displayName = "PasswordInput";
