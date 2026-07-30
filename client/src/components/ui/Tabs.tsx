import React from "react";
import { cn } from "../../utils/formatters";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: "underline" | "pills";
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  className,
}) => {
  if (variant === "pills") {
    return (
      <div className={cn("inline-flex p-1 bg-slate-100 rounded-xl gap-1 overflow-x-auto max-w-full", className)}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap",
                isActive ? "bg-[#0E2A47] text-white shadow-xs" : "text-[#64748B] hover:text-[#1E293B] hover:bg-slate-200/60"
              )}
            >
              {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                    isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("border-b border-slate-200 overflow-x-auto", className)}>
      <nav className="flex gap-6 -mb-px">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? "border-[#0FA3A3] text-[#0FA3A3] font-semibold"
                  : "border-transparent text-[#64748B] hover:text-[#1E293B] hover:border-slate-300"
              )}
            >
              {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-semibold",
                    isActive ? "bg-[#0FA3A3]/10 text-[#0FA3A3]" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
