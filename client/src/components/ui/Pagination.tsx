import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../../utils/formatters";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className,
}) => {
  if (totalPages <= 1) return null;

  const startItem = totalItems && pageSize ? (currentPage - 1) * pageSize + 1 : undefined;
  const endItem = totalItems && pageSize ? Math.min(currentPage * pageSize, totalItems) : undefined;

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4 py-3 px-1", className)}>
      {totalItems && startItem && endItem ? (
        <p className="text-xs text-[#64748B]">
          Showing <span className="font-semibold text-[#1E293B]">{startItem}</span> to{" "}
          <span className="font-semibold text-[#1E293B]">{endItem}</span> of{" "}
          <span className="font-semibold text-[#1E293B]">{totalItems}</span> results
        </p>
      ) : (
        <p className="text-xs text-[#64748B]">
          Page <span className="font-semibold text-[#1E293B]">{currentPage}</span> of{" "}
          <span className="font-semibold text-[#1E293B]">{totalPages}</span>
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          leftIcon={<ChevronLeft className="w-4 h-4" />}
        >
          Previous
        </Button>

        <div className="flex items-center gap-1 px-1">
          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1;
            const isActive = pageNum === currentPage;
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center",
                  isActive ? "bg-[#0E2A47] text-white" : "text-[#64748B] hover:bg-slate-100"
                )}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          rightIcon={<ChevronRight className="w-4 h-4" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
