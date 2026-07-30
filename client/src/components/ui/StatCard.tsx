import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "./Card";
import { cn } from "../../utils/formatters";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  change?: string;
  changeType?: "increase" | "decrease" | "neutral" | string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isUp: boolean;
  };
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  change,
  changeType = "increase",
  icon,
  trend,
  className,
}) => {
  const effectiveTrend = trend || (change ? { value: change, isUp: changeType !== "decrease" } : undefined);
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">{title}</p>
          <div className="text-2xl sm:text-3xl font-bold text-[#0E2A47] tracking-tight">{value}</div>
        </div>
        {icon && <div className="p-2.5 rounded-xl bg-slate-100 text-[#0FA3A3] shrink-0">{icon}</div>}
      </div>

      {(subtext || effectiveTrend) && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-xs">
          {effectiveTrend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-md",
                effectiveTrend.isUp ? "bg-emerald-50 text-[#16A34A]" : "bg-red-50 text-[#DC2626]"
              )}
            >
              {effectiveTrend.isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {effectiveTrend.value}
            </span>
          )}
          {subtext && <span className="text-[#64748B]">{subtext}</span>}
        </div>
      )}
    </Card>
  );
};
