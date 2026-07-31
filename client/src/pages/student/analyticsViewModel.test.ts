import { describe, it, expect } from "vitest";
import { TestSession } from "../../types";
import { AnalyticsDailyTrendPoint } from "../../api/endpoints/qbank";
import {
  formatTrendLabel,
  mapDailyTrendToChartPoints,
  computeAccuracyTrendDelta,
  sumRecentQuestions,
  computeStudyMinutes,
  summarizeTestBlocks,
} from "./analyticsViewModel";

function point(overrides: Partial<AnalyticsDailyTrendPoint> & { date: string }): AnalyticsDailyTrendPoint {
  return { questions: 0, correct: 0, ...overrides };
}

function session(overrides: Partial<TestSession> & { id: number }): TestSession {
  return {
    userId: 1,
    mode: "practice",
    examCategory: "NRE1",
    questionCount: 20,
    status: "completed",
    startedAt: "2026-07-01T00:00:00.000Z",
    correctCount: 15,
    incorrectCount: 3,
    skippedCount: 2,
    ...overrides,
  };
}

describe("formatTrendLabel", () => {
  it("formats a daily bucket as 'Mon D'", () => {
    expect(formatTrendLabel("2026-07-31", "daily")).toBe("Jul 31");
  });

  it("formats a weekly bucket with a 'Wk of' prefix", () => {
    expect(formatTrendLabel("2026-07-25", "weekly")).toBe("Wk of Jul 25");
  });

  it("formats a monthly bucket as 'Mon YYYY'", () => {
    expect(formatTrendLabel("2026-07", "monthly")).toBe("Jul 2026");
  });

  it("falls back to the raw string for an unparseable daily/weekly date", () => {
    expect(formatTrendLabel("not-a-date", "daily")).toBe("not-a-date");
  });

  it("falls back to the raw string for an unparseable monthly date", () => {
    expect(formatTrendLabel("garbage", "monthly")).toBe("garbage");
  });
});

describe("mapDailyTrendToChartPoints", () => {
  it("computes rounded accuracy per bucket", () => {
    const result = mapDailyTrendToChartPoints(
      [point({ date: "2026-07-30", questions: 8, correct: 6 })],
      "daily"
    );
    expect(result).toEqual([{ label: "Jul 30", accuracy: 75, questions: 8, correct: 6 }]);
  });

  it("uses null (not 0) accuracy for a zero-question bucket — no fabricated 0%", () => {
    const result = mapDailyTrendToChartPoints([point({ date: "2026-07-30", questions: 0, correct: 0 })], "daily");
    expect(result[0].accuracy).toBeNull();
  });
});

describe("computeAccuracyTrendDelta", () => {
  it("returns null when the series has fewer than 2 buckets", () => {
    expect(computeAccuracyTrendDelta([point({ date: "2026-07-30", questions: 5, correct: 5 })])).toBeNull();
  });

  it("returns null when every bucket is zero (brand-new user)", () => {
    const series = [point({ date: "2026-07-01" }), point({ date: "2026-07-02" }), point({ date: "2026-07-03" })];
    expect(computeAccuracyTrendDelta(series)).toBeNull();
  });

  it("returns null when one half has zero questions even if the other doesn't", () => {
    const series = [
      point({ date: "2026-07-01", questions: 10, correct: 5 }),
      point({ date: "2026-07-02" }),
    ];
    expect(computeAccuracyTrendDelta(series)).toBeNull();
  });

  it("detects an upward trend using weighted (not averaged) accuracy", () => {
    const series = [
      point({ date: "2026-07-01", questions: 10, correct: 5 }), // first half: 50%
      point({ date: "2026-07-02", questions: 10, correct: 8 }), // second half: 80%
    ];
    const delta = computeAccuracyTrendDelta(series);
    expect(delta).not.toBeNull();
    expect(delta!.isUp).toBe(true);
    expect(delta!.deltaPoints).toBe(30);
  });

  it("detects a downward trend", () => {
    const series = [
      point({ date: "2026-07-01", questions: 10, correct: 9 }), // 90%
      point({ date: "2026-07-02", questions: 10, correct: 3 }), // 30%
    ];
    const delta = computeAccuracyTrendDelta(series);
    expect(delta!.isUp).toBe(false);
    expect(delta!.deltaPoints).toBe(-60);
  });
});

describe("sumRecentQuestions", () => {
  it("sums only the most recent N buckets", () => {
    const series = Array.from({ length: 10 }, (_, i) =>
      point({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, questions: 1 })
    );
    expect(sumRecentQuestions(series, 7)).toBe(7);
  });

  it("sums the whole series when shorter than the requested window", () => {
    const series = [point({ date: "2026-07-01", questions: 3 }), point({ date: "2026-07-02", questions: 4 })];
    expect(sumRecentQuestions(series, 7)).toBe(7);
  });
});

describe("computeStudyMinutes", () => {
  it("returns 0 for a brand-new user with no attempts", () => {
    expect(computeStudyMinutes(0, 0)).toBe(0);
  });

  it("reconstructs total minutes from attempted count × average seconds", () => {
    // 420 questions * 42s = 17640s = 294 minutes
    expect(computeStudyMinutes(420, 42)).toBe(294);
  });
});

describe("summarizeTestBlocks", () => {
  it("excludes in_progress sessions and buckets the rest by mode", () => {
    const history: TestSession[] = [
      session({ id: 1, mode: "practice", status: "completed" }),
      session({ id: 2, mode: "practice", status: "abandoned" }),
      session({ id: 3, mode: "exam", status: "completed" }),
      session({ id: 4, mode: "mock", status: "completed" }),
      session({ id: 5, mode: "practice", status: "in_progress" }),
    ];
    expect(summarizeTestBlocks(history)).toEqual({
      totalFinished: 4,
      practice: 2,
      exam: 1,
      mock: 1,
    });
  });

  it("returns all zeros for an empty history (new user)", () => {
    expect(summarizeTestBlocks([])).toEqual({ totalFinished: 0, practice: 0, exam: 0, mock: 0 });
  });
});
