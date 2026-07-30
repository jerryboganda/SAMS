import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "../../utils/formatters";

export interface Column<T = any> {
  key?: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render?: (item: T, index: number) => React.ReactNode;
  accessor?: keyof T | string | ((item: T, index: number) => React.ReactNode);
}

export interface TableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (item: T, index: number) => string | number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnKey: string) => void;
  isLoading?: boolean;
  emptyText?: string;
  className?: string;
}

export function Table<T = any>({
  columns,
  data,
  keyExtractor,
  sortColumn,
  sortDirection,
  onSort,
  isLoading,
  emptyText = "No records found.",
  className,
}: TableProps<T>) {
  const getKey = (item: T, index: number): string | number => {
    if (keyExtractor) return keyExtractor(item, index);
    if (item && typeof item === "object" && "id" in item) {
      return (item as any).id;
    }
    return index;
  };

  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs", className)}>
      <table className="w-full text-left text-sm text-[#1E293B]">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-[#64748B] border-b border-slate-200 select-none">
          <tr>
            {columns.map((col, cIdx) => {
              const colKey = col.key || `col_${cIdx}`;
              const isSorted = sortColumn === colKey;
              return (
                <th
                  key={colKey}
                  className={cn(
                    "px-4 py-3.5 whitespace-nowrap",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right",
                    col.sortable && "cursor-pointer hover:bg-slate-100/80 transition-colors"
                  )}
                  onClick={() => col.sortable && onSort && onSort(colKey)}
                >
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      col.align === "center" && "justify-center",
                      col.align === "right" && "justify-end"
                    )}
                  >
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-slate-400">
                        {isSorted ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5 text-[#0FA3A3]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-[#0FA3A3]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, rIdx) => (
              <tr key={rIdx} className="animate-pulse">
                {columns.map((_, cIdx) => (
                  <td key={cIdx} className="px-4 py-4">
                    <div className="h-4 bg-slate-200 rounded-sm w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500 text-sm">
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr key={getKey(item, index)} className="hover:bg-slate-50/80 transition-colors">
                {columns.map((col, cIdx) => {
                  const colKey = col.key || `col_${cIdx}`;
                  const content = col.render
                    ? col.render(item, index)
                    : typeof col.accessor === "function"
                    ? col.accessor(item, index)
                    : col.accessor
                    ? (item as any)[col.accessor]
                    : (item as any)[colKey];

                  return (
                    <td
                      key={colKey}
                      className={cn(
                        "px-4 py-3.5 text-sm",
                        col.align === "center" && "text-center",
                        col.align === "right" && "text-right"
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
