import React from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../../utils/formatters";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <FolderOpen className="w-10 h-10 text-slate-400" />,
  title,
  description,
  actionLabel,
  actionText,
  onAction,
  className,
}) => {
  const effectiveLabel = actionLabel || actionText;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60",
        className
      )}
    >
      <div className="p-3 bg-slate-100 rounded-2xl mb-4 text-[#0FA3A3]">{icon}</div>
      <h3 className="text-lg font-bold text-[#0E2A47]">{title}</h3>
      {description && <p className="text-sm text-[#64748B] max-w-sm mt-1 mb-6">{description}</p>}
      {effectiveLabel && onAction && (
        <Button variant="teal" onClick={onAction}>
          {effectiveLabel}
        </Button>
      )}
    </div>
  );
};
