// client/src/pages/student/analyticsViewModel.ts
//
// Pure, framework-free helpers extracted from AnalyticsPage.tsx so the
// non-trivial derivations it needs (trend-label formatting per range,
// week-over-week comparison, cumulative study time, completed-block
// counts) are unit-testable without mounting the component or a real
// QueryClient/router. Mirrors the extraction precedent already established
// by client/src/pages/admin/curriculumDiff.ts.
//
// Every function here operates on the REAL `GET /qbank/analytics` shape
// (server/src/services/analyticsService.js) and the real `GET /qbank/tests`
// history shape — nothing here invents or interpolates numbers the server
// didn't provide; a bucket the server zero-filled (no activity that
// day/week/month) stays an honest zero/null, never a fabricated placeholder.
// See docs/07_EXECUTION_PLAN.md 8.2's "renders fixture correctly,
// empty-state for new user" AC.

import { TestMode, TestSession } from "../../types";
import { AnalyticsDailyTrendPoint, AnalyticsRange } from "../../api/endpoints/qbank";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parses the server's `YYYY-MM-DD` bucket key as a UTC calendar date (no local-timezone off-by-one). */
function parseDateOnly(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/**
 * `daily` buckets key off a calendar `YYYY-MM-DD` day; `weekly` buckets key off the `YYYY-MM-DD` FIRST day
 * of that rolling 7-day window; `monthly` buckets key off `YYYY-MM`
 * (server/src/services/analyticsService.js#buildSeries). Falls back to the raw string for anything that
 * doesn't parse rather than throwing — a chart label is never worth a hard crash.
 */
export function formatTrendLabel(dateStr: string, range: AnalyticsRange): string {
  if (range === "monthly") {
    const m = /^(\d{4})-(\d{2})$/.exec(dateStr);
    if (!m) return dateStr;
    return `${MONTH_ABBR[Number(m[2]) - 1]} ${m[1]}`;
  }
  const d = parseDateOnly(dateStr);
  if (!d) return dateStr;
  const day = `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return range === "weekly" ? `Wk of ${day}` : day;
}

export interface TrendChartPoint {
  label: string;
  /** `null` (never `0`) when the bucket had zero questions — an honest "no activity" gap, not a
   * fabricated 0% accuracy score. Recharts' `<Line connectNulls={false}>` renders this as a real gap. */
  accuracy: number | null;
  questions: number;
  correct: number;
}

export function mapDailyTrendToChartPoints(
  dailyTrend: AnalyticsDailyTrendPoint[],
  range: AnalyticsRange
): TrendChartPoint[] {
  return dailyTrend.map((point) => ({
    label: formatTrendLabel(point.date, range),
    accuracy: point.questions > 0 ? Math.round((point.correct / point.questions) * 100) : null,
    questions: point.questions,
    correct: point.correct,
  }));
}

export interface TrendDelta {
  deltaPoints: number;
  isUp: boolean;
}

/**
 * Compares WEIGHTED accuracy (sum correct / sum questions — not an average-of-per-bucket-percents, which
 * would over-weight low-volume buckets) between the chronological first and second half of the series — a
 * real, derivable "vs earlier in this period" signal computed entirely from server-provided numbers.
 * Returns `null` when there isn't real activity in BOTH halves to make the comparison meaningful (fewer
 * than 2 buckets, or either half has zero questions) — never fabricates a placeholder trend badge.
 */
export function computeAccuracyTrendDelta(dailyTrend: AnalyticsDailyTrendPoint[]): TrendDelta | null {
  if (dailyTrend.length < 2) return null;
  const mid = Math.floor(dailyTrend.length / 2);
  const firstHalf = dailyTrend.slice(0, mid);
  const secondHalf = dailyTrend.slice(mid);

  const sum = (points: AnalyticsDailyTrendPoint[]) =>
    points.reduce(
      (acc, p) => ({ questions: acc.questions + p.questions, correct: acc.correct + p.correct }),
      { questions: 0, correct: 0 }
    );

  const first = sum(firstHalf);
  const second = sum(secondHalf);
  if (first.questions === 0 || second.questions === 0) return null;

  const firstPercent = (first.correct / first.questions) * 100;
  const secondPercent = (second.correct / second.questions) * 100;
  const deltaPoints = Math.round((secondPercent - firstPercent) * 10) / 10;

  return { deltaPoints, isUp: deltaPoints >= 0 };
}

/**
 * Sum of the most recent `days` buckets' `questions` count. Only meaningful against a `'daily'`-range
 * series (1 bucket = 1 calendar day); callers must not pass a `'weekly'`/`'monthly'` series here.
 */
export function sumRecentQuestions(dailyTrend: AnalyticsDailyTrendPoint[], days = 7): number {
  return dailyTrend.slice(-days).reduce((sum, p) => sum + p.questions, 0);
}

/**
 * Total QBank study time in minutes, reconstructed from the two real numbers the server's `overall`
 * block actually returns (`totalAttempted × avgTimePerQuestionSeconds`) — the analytics endpoint has no
 * raw total-seconds field of its own to read directly.
 */
export function computeStudyMinutes(totalAttempted: number, avgTimePerQuestionSeconds: number): number {
  if (totalAttempted <= 0 || avgTimePerQuestionSeconds <= 0) return 0;
  return Math.round((totalAttempted * avgTimePerQuestionSeconds) / 60);
}

export interface TestBlockSummary {
  totalFinished: number;
  practice: number;
  exam: number;
  mock: number;
}

/**
 * Counts FINISHED (`completed` OR `abandoned` — never `in_progress`) sessions per mode, from the
 * student's own real `GET /qbank/tests` history. There is no dedicated "completed blocks" field on the
 * analytics response itself, so this is derived from a second real endpoint the page already has reason
 * to call (MockExamsPage.tsx's attempt-history table uses the same endpoint) rather than invented.
 */
export function summarizeTestBlocks(history: TestSession[]): TestBlockSummary {
  const finished = history.filter((s) => s.status !== "in_progress");
  const countByMode = (mode: TestMode) => finished.filter((s) => s.mode === mode).length;
  return {
    totalFinished: finished.length,
    practice: countByMode("practice"),
    exam: countByMode("exam"),
    mock: countByMode("mock"),
  };
}
