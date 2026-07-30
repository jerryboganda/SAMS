import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../utils/formatters";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "teal" | "outline" | "default" | "warning";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      icon,
      fullWidth = false,
      className,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const effectiveLeftIcon = leftIcon || icon;
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none";

    const variantStyles = {
      primary: "bg-[#0E2A47] text-white hover:bg-[#081B30] focus:ring-[#0E2A47] shadow-sm active:translate-y-[0.5px]",
      default: "bg-[#0E2A47] text-white hover:bg-[#081B30] focus:ring-[#0E2A47] shadow-sm active:translate-y-[0.5px]",
      teal: "bg-[#0FA3A3] text-white hover:bg-[#0C8A8A] focus:ring-[#0FA3A3] shadow-sm active:translate-y-[0.5px]",
      secondary: "bg-white text-[#1E293B] border border-slate-300 hover:bg-slate-50 focus:ring-[#0E2A47] shadow-sm",
      outline: "border-2 border-[#0FA3A3] text-[#0FA3A3] bg-transparent hover:bg-[#0FA3A3]/10 focus:ring-[#0FA3A3]",
      ghost: "text-[#64748B] hover:text-[#1E293B] hover:bg-slate-100/80 focus:ring-slate-300",
      danger: "bg-[#DC2626] text-white hover:bg-red-700 focus:ring-[#DC2626] shadow-sm active:translate-y-[0.5px]",
      warning: "bg-[#D97706] text-white hover:bg-amber-700 focus:ring-[#D97706] shadow-sm active:translate-y-[0.5px]",
    };

    const sizeStyles = {
      xs: "text-[11px] px-2 py-1 gap-1 min-h-[26px]",
      sm: "text-xs px-3 py-1.5 gap-1.5 min-h-[32px]",
      md: "text-sm px-4 py-2 gap-2 min-h-[40px]",
      lg: "text-base px-6 py-2.5 gap-2.5 min-h-[48px]",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant] || variantStyles.primary, sizeStyles[size], fullWidth && "w-full", className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          <>
            {effectiveLeftIcon && <span className="inline-flex shrink-0">{effectiveLeftIcon}</span>}
            {children && <span>{children}</span>}
            {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
