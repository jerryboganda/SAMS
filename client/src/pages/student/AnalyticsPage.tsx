import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Edit2,
  Calendar,
  BookOpen,
  Play,
  AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card, Button, Badge, Modal, Input, Skeleton, EmptyState } from "../../components/ui";
import { qbankApi, AnalyticsRange, AnalyticsResponse } from "../../api/endpoints/qbank";
import { TestSession, ExamCategory } from "../../types";
import { formatHoursMins } from "../../utils/formatters";
import {
  mapDailyTrendToChartPoints,
  computeAccuracyTrendDelta,
  sumRecentQuestions,
  computeStudyMinutes,
  summarizeTestBlocks,
} from "./analyticsViewModel";

type LoadState = "loading" | "error" | "data";

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "daily", label: "Daily (30d)" },
  { value: "weekly", label: "Weekly (12w)" },
  { value: "monthly", label: "Monthly (12mo)" },
];

const ACCURACY_COLOR = (percent: number) => (percent >= 75 ? "#0FA3A3" : percent >= 65 ? "#0E2A47" : "#E11D48");

export const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();

  // Date-range toggle — must match the real `?range=daily|weekly|monthly` values the backend accepts
  // (server/src/services/analyticsService.js); anything else 422s.
  const [range, setRange] = useState<AnalyticsRange>("daily");

  // Weekly Goal State (a genuine student-configurable target, persisted client-side — not fabricated
  // server data; the PROGRESS against it below is always real).
  const [weeklyGoal, setWeeklyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("sams_weekly_goal");
    return saved ? parseInt(saved, 10) : 250;
  });
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState<string>(weeklyGoal.toString());

  // Real data from the API
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [testHistory, setTestHistory] = useState<TestSession[]>([]);
  /** Sum of the most recent 7 REAL calendar days' `questions` — always sourced from a 'daily'-range
   * fetch regardless of which range the trend chart itself is showing, so the weekly-goal ring doesn't
   * jump around just because the user toggled the trend chart to Weekly/Monthly. */
  const [questionsThisWeek, setQuestionsThisWeek] = useState(0);
  const [poolTotal, setPoolTotal] = useState<number | null>(null);
  const [defaultCategory, setDefaultCategory] = useState<ExamCategory | null>(null);

  const loadAnalytics = useCallback(async (selectedRange: AnalyticsRange) => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const needsSeparateDailyFetch = selectedRange !== "daily";
      const [rangeData, dailyData, history, meta] = await Promise.all([
        qbankApi.getAnalytics(selectedRange),
        needsSeparateDailyFetch ? qbankApi.getAnalytics("daily") : Promise.resolve(null),
        qbankApi.getTestHistory(),
        qbankApi.getMeta(),
      ]);

      const dailySeries = needsSeparateDailyFetch ? dailyData!.dailyTrend : rangeData.dailyTrend;

      setAnalyticsData(rangeData);
      setQuestionsThisWeek(sumRecentQuestions(dailySeries, 7));
      setTestHistory(history);
      setPoolTotal(meta.poolsCount?.all ?? null);
      setDefaultCategory(meta.categories?.[0] ?? null);
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load analytics", err);
      setLoadErrorMsg(err?.message || "Failed to load your diagnostic analytics.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    loadAnalytics(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Save Goal to localStorage
  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(tempGoalInput, 10);
    if (!isNaN(val) && val > 0) {
      setWeeklyGoal(val);
      localStorage.setItem("sams_weekly_goal", val.toString());
      setIsGoalModalOpen(false);
    }
  };

  // Quick Action navigation for practicing a subject/system — uses the student's actual first accessible
  // exam category (from GET /qbank/meta) rather than a hardcoded one, so the wizard opens pre-scoped to a
  // category the student can genuinely see questions in.
  const handlePracticeSubject = (subjectName: string, isWeakness = false) => {
    const category = defaultCategory || "NRE1";
    const url = isWeakness
      ? `/app/qbank/new?category=${category}&pool=incorrect&subject=${encodeURIComponent(subjectName)}`
      : `/app/qbank/new?category=${category}&subject=${encodeURIComponent(subjectName)}`;
    navigate(url);
  };

  const trendChartData = useMemo(
    () => (analyticsData ? mapDailyTrendToChartPoints(analyticsData.dailyTrend, range) : []),
    [analyticsData, range]
  );

  const accuracyTrendDelta = useMemo(
    () => (analyticsData ? computeAccuracyTrendDelta(analyticsData.dailyTrend) : null),
    [analyticsData]
  );

  const testBlockSummary = useMemo(() => summarizeTestBlocks(testHistory), [testHistory]);

  if (loadState === "loading") {
    return (
      <div className="space-y-8 pb-12 max-w-6xl mx-auto">
        <Skeleton variant="text" className="h-8 w-80" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton variant="card" className="h-28 rounded-2xl" />
          <Skeleton variant="card" className="h-28 rounded-2xl" />
          <Skeleton variant="card" className="h-28 rounded-2xl" />
          <Skeleton variant="card" className="h-28 rounded-2xl" />
        </div>
        <Skeleton variant="card" className="h-32 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton variant="card" className="h-72 rounded-2xl" />
          <Skeleton variant="card" className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (loadState === "error" || !analyticsData) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<AlertCircle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load your analytics"
          description={loadErrorMsg}
          actionLabel="Retry"
          onAction={() => loadAnalytics(range)}
        />
      </div>
    );
  }

  const { overall, strengths, weaknesses } = analyticsData;
  const hasAnyActivity = overall.totalAttempted > 0;

  const goalPercent = Math.min(100, Math.round((questionsThisWeek / weeklyGoal) * 100));

  const subjectChartData = analyticsData.subjectPerformance.map((s) => ({ name: s.name, accuracy: s.percent }));
  const systemChartData = analyticsData.systemPerformance.map((sys) => ({ name: sys.name, accuracy: sys.percent }));

  const studyMinutes = computeStudyMinutes(overall.totalAttempted, overall.avgTimePerQuestionSeconds);

  return (
    <div className="space-y-8 pb-12 max-w-6xl mx-auto">
      {/* Top Header & Date Range Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">Diagnostic Performance & Analytics</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track clinical vignette accuracy, subject mastery trends, and targeted revision weak spots.
          </p>
        </div>

        {/* Date-Range Selector Toggle — real backend windows, not a client-side fabricated day count */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <Calendar className="w-4 h-4 text-slate-400 ml-2 mr-1" />
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                range === opt.value
                  ? "bg-white text-[#0E2A47] shadow-xs border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty-state banner for a brand-new user with zero graded QBank history */}
      {!hasAnyActivity && (
        <div className="p-5 rounded-2xl border border-teal-200 bg-teal-50/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white text-[#0FA3A3] border border-teal-200 shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#0E2A47]">No diagnostic history yet</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Complete a QBank practice or exam block to start building your accuracy trend, subject
                breakdown, and strengths/weaknesses.
              </p>
            </div>
          </div>
          <Button variant="teal" size="sm" onClick={() => navigate("/app/qbank/new")} icon={<Play className="w-4 h-4" />}>
            Start a QBank Block
          </Button>
        </div>
      )}

      {/* Top Stat Cards Grid — every number below is read directly from the real analytics/history
          responses (or derived from them via analyticsViewModel.ts); nothing is fabricated. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Overall Accuracy</p>
              <div className="text-2xl sm:text-3xl font-bold text-[#0E2A47] tracking-tight">
                {overall.overallPercent}%
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 text-[#0FA3A3] shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-xs">
            {accuracyTrendDelta && (
              <span
                className={`inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-md ${
                  accuracyTrendDelta.isUp ? "bg-emerald-50 text-[#16A34A]" : "bg-red-50 text-[#DC2626]"
                }`}
              >
                {accuracyTrendDelta.isUp ? "+" : ""}
                {accuracyTrendDelta.deltaPoints} pts vs earlier in range
              </span>
            )}
            {!accuracyTrendDelta && (
              <span className="text-[#64748B]">
                {overall.totalCorrect} correct • {overall.totalIncorrect} incorrect • {overall.totalSkipped} skipped
              </span>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Questions Completed</p>
              <div className="text-2xl sm:text-3xl font-bold text-[#0E2A47] tracking-tight">
                {overall.totalAttempted}
                {poolTotal ? ` / ${poolTotal}` : ""}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 text-indigo-600 shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-xs text-[#64748B]">
            {poolTotal
              ? `${Math.min(100, Math.round((overall.totalAttempted / poolTotal) * 100))}% of your accessible QBank pool attempted`
              : "Across your accessible QBank pool"}
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Cumulative Study Time</p>
              <div className="text-2xl sm:text-3xl font-bold text-[#0E2A47] tracking-tight">
                {formatHoursMins(studyMinutes)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 text-emerald-600 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-xs text-[#64748B]">
            Avg {overall.avgTimePerQuestionSeconds}s per question
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Completed Test Blocks</p>
              <div className="text-2xl sm:text-3xl font-bold text-[#0E2A47] tracking-tight">
                {testBlockSummary.totalFinished} Blocks
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 text-amber-600 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-xs text-[#64748B]">
            {testBlockSummary.practice} Practice • {testBlockSummary.exam} Exam
            {testBlockSummary.mock > 0 ? ` • ${testBlockSummary.mock} Mock` : ""}
          </div>
        </Card>
      </div>

      {/* Cumulative Weekly Progress Goal Card (real "this week" count vs a student-configured target) */}
      <Card className="p-6 bg-gradient-to-r from-[#0E2A47] to-slate-900 text-white rounded-2xl shadow-md">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-700"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#0FA3A3]"
                  strokeDasharray={`${goalPercent}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-black text-white">{goalPercent}%</span>
                <span className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">Goal</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Badge variant="teal" size="sm" className="font-extrabold uppercase">
                CURRENT WEEK TARGET
              </Badge>
              <h3 className="text-lg font-black text-white">
                {questionsThisWeek} / {weeklyGoal} Questions Completed
              </h3>
              <p className="text-xs text-slate-300 max-w-md leading-relaxed">
                You need <strong>{Math.max(0, weeklyGoal - questionsThisWeek)}</strong> more vignettes this week to achieve your target milestone.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="text-white border-slate-600 hover:bg-slate-800 shrink-0"
            onClick={() => {
              setTempGoalInput(weeklyGoal.toString());
              setIsGoalModalOpen(true);
            }}
            icon={<Edit2 className="w-4 h-4" />}
          >
            Edit Weekly Goal
          </Button>
        </div>
      </Card>

      {/* Main Charts Row 1: Accuracy Trend Line Chart & Questions-Per-Bucket Bar Chart — both driven by
          the SAME real `dailyTrend` series for the selected range, never fabricated data. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-[#0E2A47]">Accuracy Trend Over Time</h3>
              <p className="text-[11px] text-slate-400">Diagnostic correctness trajectory for the selected window</p>
            </div>
            <Badge variant="teal" size="sm" className="font-bold">
              {RANGE_OPTIONS.find((o) => o.value === range)?.label}
            </Badge>
          </div>

          {hasAnyActivity ? (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11} tickLine={false} unit="%" />
                  <Tooltip
                    formatter={(val: any) => [val == null ? "No attempts" : `${val}%`, "Accuracy"]}
                    contentStyle={{
                      backgroundColor: "#0E2A47",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "12px",
                      border: "none",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#0FA3A3"
                    strokeWidth={3}
                    dot={{ fill: "#0FA3A3", r: 4 }}
                    activeDot={{ r: 6, fill: "#0E2A47" }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-center px-6">
              <p className="text-xs text-slate-400">
                No attempts recorded yet for this window — your accuracy trend will appear here once you
                complete a QBank block.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-[#0E2A47]">Vignettes Solved</h3>
              <p className="text-[11px] text-slate-400">Questions answered per bucket, colored by that bucket's accuracy</p>
            </div>
            <Badge variant="emerald" size="sm" className="font-bold">
              Activity
            </Badge>
          </div>

          {hasAnyActivity ? (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(val: any, _name: any, item: any) => [
                      `${val} Qs${item?.payload?.accuracy != null ? ` (${item.payload.accuracy}% accuracy)` : ""}`,
                      "Questions",
                    ]}
                    contentStyle={{
                      backgroundColor: "#0E2A47",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "12px",
                      border: "none",
                    }}
                  />
                  <Bar dataKey="questions" fill="#0E2A47" radius={[6, 6, 0, 0]}>
                    {trendChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.accuracy != null ? ACCURACY_COLOR(entry.accuracy) : "#E2E8F0"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-center px-6">
              <p className="text-xs text-slate-400">
                No vignette activity in this window yet.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Strengths & Weaknesses Panels with Quick Action Practice Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border-emerald-200 bg-emerald-50/30 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-black text-emerald-950">Top Diagnostic Strengths (Top 3)</h3>
            </div>
            {strengths.length > 0 && (
              <Badge variant="emerald" size="sm" className="font-extrabold">
                STRONG
              </Badge>
            )}
          </div>

          {strengths.length > 0 ? (
            <div className="space-y-3">
              {strengths.map((str) => (
                <div
                  key={str.name}
                  className="p-3 bg-white rounded-xl border border-emerald-200 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div>
                    <div className="font-extrabold text-slate-900 text-xs">{str.name}</div>
                    <div className="text-[11px] text-emerald-700 font-bold mt-0.5">
                      {str.score}% Accuracy Mastered
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-[11px] py-1"
                    onClick={() => handlePracticeSubject(str.name, false)}
                    icon={<Play className="w-3 h-3 text-emerald-600" />}
                  >
                    Practice This
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-800/70 py-4 text-center">
              Complete at least 5 questions in a subject or body system to see your top strengths here.
            </p>
          )}
        </Card>

        <Card className="p-6 border-rose-200 bg-rose-50/30 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-rose-200/60 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="text-sm font-black text-rose-950">Revision Weak Spots (Bottom 3)</h3>
            </div>
            {weaknesses.length > 0 && (
              <Badge variant="danger" size="sm" className="font-extrabold">
                NEEDS WORK
              </Badge>
            )}
          </div>

          {weaknesses.length > 0 ? (
            <div className="space-y-3">
              {weaknesses.map((weak) => (
                <div
                  key={weak.name}
                  className="p-3 bg-white rounded-xl border border-rose-200 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div>
                    <div className="font-extrabold text-slate-900 text-xs">{weak.name}</div>
                    <div className="text-[11px] text-rose-700 font-bold mt-0.5">
                      {weak.score}% Accuracy (Low)
                    </div>
                  </div>

                  <Button
                    variant="teal"
                    size="sm"
                    className="text-[11px] py-1"
                    onClick={() => handlePracticeSubject(weak.name, true)}
                    icon={<Play className="w-3 h-3" />}
                  >
                    Practice Weak Pool
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-rose-800/70 py-4 text-center">
              Answer more questions to identify weak areas needing revision — none stand out yet.
            </p>
          )}
        </Card>
      </div>

      {/* Main Charts Row 2: Subject-Wise & System-Wise Horizontal Accuracy Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0FA3A3]" /> Subject-Wise Accuracy Breakdown
            </h3>
            <span className="text-xs text-slate-400 font-bold">{subjectChartData.length} Subjects</span>
          </div>

          {subjectChartData.length > 0 ? (
            <div className="h-72 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={subjectChartData} margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} stroke="#64748B" fontSize={11} unit="%" />
                  <YAxis dataKey="name" type="category" stroke="#0E2A47" fontSize={10} tickLine={false} width={110} />
                  <Tooltip
                    formatter={(val: any) => [`${val}%`, "Accuracy"]}
                    contentStyle={{
                      backgroundColor: "#0E2A47",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "12px",
                      border: "none",
                    }}
                  />
                  <Bar dataKey="accuracy" fill="#0FA3A3" radius={[0, 6, 6, 0]} barSize={16}>
                    {subjectChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={ACCURACY_COLOR(entry.accuracy)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-center px-6">
              <p className="text-xs text-slate-400">
                No subject-wise data yet — complete a QBank test to see this breakdown.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0FA3A3]" /> Body System Accuracy Breakdown
            </h3>
            <span className="text-xs text-slate-400 font-bold">{systemChartData.length} Systems</span>
          </div>

          {systemChartData.length > 0 ? (
            <div className="h-72 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={systemChartData} margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} stroke="#64748B" fontSize={11} unit="%" />
                  <YAxis dataKey="name" type="category" stroke="#0E2A47" fontSize={10} tickLine={false} width={110} />
                  <Tooltip
                    formatter={(val: any) => [`${val}%`, "Accuracy"]}
                    contentStyle={{
                      backgroundColor: "#0E2A47",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "12px",
                      border: "none",
                    }}
                  />
                  <Bar dataKey="accuracy" fill="#0E2A47" radius={[0, 6, 6, 0]} barSize={16}>
                    {systemChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={ACCURACY_COLOR(entry.accuracy)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-center px-6">
              <p className="text-xs text-slate-400">
                No body-system data yet — complete a QBank test to see this breakdown.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Edit Weekly Goal Modal */}
      <Modal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        title="Set Weekly QBank Question Goal"
        size="sm"
      >
        <form onSubmit={handleSaveGoal} className="space-y-4 text-xs">
          <p className="text-slate-600">
            Establish a target number of clinical vignettes to solve each week to stay on track for your licensing examination.
          </p>

          <div className="space-y-1.5">
            <label className="font-extrabold text-[#0E2A47] block">Target Questions Per Week</label>
            <Input
              type="number"
              value={tempGoalInput}
              onChange={(e) => setTempGoalInput(e.target.value)}
              min={50}
              max={1000}
              step={10}
              required
            />
            <span className="text-[10px] text-slate-400">Recommended for NRE Step 1: 250 – 350 Qs/week</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsGoalModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="teal" size="sm" type="submit">
              Save Goal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
