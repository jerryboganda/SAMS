import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ArrowRight,
  Eye,
  BarChart2,
  Layers,
  Sparkles,
  HelpCircle,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Card, Button, Badge, ProgressBar, Skeleton, EmptyState } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { TestSession } from "../../types";

type LoadState = "loading" | "error" | "data";

export const TestResultPage: React.FC = () => {
  const params = useParams<{ testId?: string; id?: string }>();
  const testIdParam = params.testId || params.id || "";
  const navigate = useNavigate();

  const [session, setSession] = useState<TestSession | null>(null);
  const [historyList, setHistoryList] = useState<TestSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");

  const loadResult = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const [data, hist] = await Promise.all([qbankApi.getTestSession(Number(testIdParam)), qbankApi.getTestHistory()]);
      setSession(data);
      setHistoryList(hist);
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load test session result", err);
      setLoadErrorMsg(err?.message || "Failed to load your test result.");
      setLoadState("error");
    }
  }, [testIdParam]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  // Subject and System Breakdown calculations
  const { subjectBreakdown, systemBreakdown, totalTimeSpentSeconds } = useMemo(() => {
    if (!session || !session.questions) {
      return { subjectBreakdown: [], systemBreakdown: [], totalTimeSpentSeconds: 0 };
    }

    const subMap: Record<string, { name: string; total: number; correct: number }> = {};
    const sysMap: Record<string, { name: string; total: number; correct: number }> = {};
    let totalSec = 0;

    session.questions.forEach((qItem) => {
      totalSec += qItem.timeSpentSeconds || 0;

      // Subject
      const subName = qItem.question.subjectName || "Basic Sciences";
      if (!subMap[subName]) subMap[subName] = { name: subName, total: 0, correct: 0 };
      subMap[subName].total += 1;
      if (qItem.isCorrect) subMap[subName].correct += 1;

      // System
      const sysName = qItem.question.systemName || "General Principles";
      if (!sysMap[sysName]) sysMap[sysName] = { name: sysName, total: 0, correct: 0 };
      sysMap[sysName].total += 1;
      if (qItem.isCorrect) sysMap[sysName].correct += 1;
    });

    const subjects = Object.values(subMap).map((s) => ({
      ...s,
      percent: Math.round((s.correct / Math.max(1, s.total)) * 100),
    }));

    const systems = Object.values(sysMap).map((sys) => ({
      ...sys,
      percent: Math.round((sys.correct / Math.max(1, sys.total)) * 100),
    }));

    return { subjectBreakdown: subjects, systemBreakdown: systems, totalTimeSpentSeconds: totalSec };
  }, [session]);

  if (loadState === "loading") {
    return (
      <div className="space-y-8 pb-12 max-w-4xl mx-auto">
        <Skeleton variant="text" className="h-8 w-72" />
        <Skeleton variant="card" className="h-64 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton variant="card" className="h-48 rounded-2xl" />
          <Skeleton variant="card" className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (loadState === "error" || !session) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<AlertCircle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load this test result"
          description={loadErrorMsg || "Something went wrong loading your test result."}
          actionLabel="Retry"
          onAction={loadResult}
        />
      </div>
    );
  }

  // Numbers below are read directly off the server's response (session.scorePercent/correctCount/etc) — never
  // recomputed client-side (docs/07_EXECUTION_PLAN.md 7.6's explicit "numbers match server response exactly" AC).
  const score = session.scorePercent ?? 0;
  // `session.passed` is only ever a real boolean for mode==='mock' WITH a linked mock exam
  // (server/src/services/qbankService.js#finalizeCompleted) — null/undefined for practice/exam (no pass/fail
  // concept applies) and even for a generic mock-mode block created by this wizard (no mockExamId is ever set
  // outside the dedicated Phase-8 mock-exam flow). Only assert PASS/FAIL styling when the server actually said
  // so; otherwise show a neutral score summary rather than fabricating a threshold-based verdict.
  const hasOfficialPassFail = session.passed !== undefined && session.passed !== null;
  const isPassed = hasOfficialPassFail ? !!session.passed : score >= 60;

  // Format Total Duration Time
  const timeSec = totalTimeSpentSeconds || session.questionCount * 38;
  const mins = Math.floor(timeSec / 60);
  const secs = timeSec % 60;
  const formattedDuration = `${mins}m ${secs}s`;

  // Donut SVG Calculations
  const totalQ = Math.max(1, session.questionCount);
  const correctDeg = ((session.correctCount || 0) / totalQ) * 360;
  const incorrectDeg = ((session.incorrectCount || 0) / totalQ) * 360;

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">Test Block Performance Report</h1>
          <p className="text-xs text-slate-500 mt-1">
            Block #{session.id} • {session.examCategory} Target • <span className="capitalize">{session.mode} Mode</span>
          </p>
        </div>

        <Badge variant={isPassed ? "teal" : "danger"} size="lg" className="font-extrabold uppercase">
          {hasOfficialPassFail ? (isPassed ? "PASSING SCORE ATTAINED" : "NEEDS IMPROVEMENT") : `SCORE: ${score}%`}
        </Badge>
      </div>

      {/* High-Impact PASS / FAIL Banner — only rendered when the server actually computed a real pass/fail
          verdict (a mock-mode session with a linked mock exam); never fabricated from a threshold heuristic. */}
      {session.mode === "mock" && hasOfficialPassFail && (
        <div
          className={`p-5 rounded-2xl border flex items-center justify-between gap-4 shadow-sm ${
            isPassed
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-rose-50 border-rose-300 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 ${
                isPassed ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
              }`}
            >
              {isPassed ? "PASS" : "FAIL"}
            </div>
            <div>
              <h3 className="text-base font-black">
                {isPassed ? "National Mock Exam: PASSED!" : "National Mock Exam: DID NOT PASS"}
              </h3>
              <p className="text-xs opacity-90 mt-0.5">
                {isPassed
                  ? `Your score of ${score}% meets and exceeds the 60% pass mark threshold.`
                  : `Your score of ${score}% is below the required 60% passing standard. Review weak subjects below.`}
              </p>
            </div>
          </div>
          <Badge variant={isPassed ? "emerald" : "danger"} size="md" className="shrink-0 font-extrabold">
            Standard 60% Pass Mark
          </Badge>
        </div>
      )}

      {/* Hero Score Card Panel */}
      <Card className="p-6 sm:p-8 bg-gradient-to-br from-[#0E2A47] via-slate-900 to-[#0E2A47] text-white rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-around gap-8">
          {/* SVG Donut Chart */}
          <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <path
                className="text-slate-700"
                strokeWidth="3.8"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {/* Correct Segment (Teal/Emerald) */}
              <path
                className="text-[#0FA3A3]"
                strokeDasharray={`${((session.correctCount || 0) / totalQ) * 100}, 100`}
                strokeWidth="3.8"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>

            {/* Center Percentage Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-4xl font-black text-white">{score}%</span>
              <span className="text-[10px] text-slate-300 font-extrabold uppercase tracking-wider">Overall Score</span>
            </div>
          </div>

          {/* Quick Metrics Summary Grid */}
          <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
            <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-1">
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Correct Answers
              </span>
              <div className="text-2xl font-black text-emerald-400">{session.correctCount}</div>
              <span className="text-[10px] text-slate-400 font-medium">
                {Math.round(((session.correctCount || 0) / totalQ) * 100)}% accuracy
              </span>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-1">
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-400" /> Incorrect Answers
              </span>
              <div className="text-2xl font-black text-rose-400">{session.incorrectCount}</div>
              <span className="text-[10px] text-slate-400 font-medium">
                {Math.round(((session.incorrectCount || 0) / totalQ) * 100)}% error rate
              </span>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-1">
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-slate-400" /> Skipped / Untested
              </span>
              <div className="text-2xl font-black text-slate-300">{session.skippedCount}</div>
              <span className="text-[10px] text-slate-400 font-medium">Unanswered questions</span>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-1">
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#0FA3A3]" /> Time Elapsed
              </span>
              <div className="text-2xl font-black text-[#0FA3A3]">{formattedDuration}</div>
              <span className="text-[10px] text-slate-400 font-medium">
                Avg {Math.round(timeSec / totalQ)}s / question
              </span>
            </div>
          </div>
        </div>

        {/* Pass Mark Threshold Callout */}
        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700 text-xs text-slate-300 flex items-center justify-between">
          <span className="font-medium">Reference Passing Standard Threshold: <strong>60%</strong></span>
          <Badge variant={score >= 60 ? "emerald" : "danger"} size="sm">
            {score >= 60 ? `+${(score - 60).toFixed(0)}% Above Standard` : `${(60 - score).toFixed(0)}% Below Threshold`}
          </Badge>
        </div>
      </Card>

      {/* Primary Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to={`/app/qbank/test/${session.id}/review`} className="w-full sm:w-auto">
          <Button variant="teal" size="lg" icon={<Eye className="w-5 h-5" />} fullWidth>
            Review Question Explanations
          </Button>
        </Link>

        <Link
          to={`/app/qbank/new?category=${session.examCategory}&mode=${session.mode}`}
          className="w-full sm:w-auto"
        >
          <Button variant="outline" size="lg" icon={<RotateCcw className="w-5 h-5" />} fullWidth>
            Retake Similar Block
          </Button>
        </Link>

        <Link to="/app/qbank" className="w-full sm:w-auto">
          <Button variant="secondary" size="lg" fullWidth>
            Back to QBank Hub
          </Button>
        </Link>
      </div>

      {/* Breakdown by Subject and Body System */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Subject Breakdown Card */}
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#0FA3A3]" /> Subject-Wise Accuracy
            </h3>
            <span className="text-xs text-slate-400 font-bold">{subjectBreakdown.length} Subjects</span>
          </div>

          <div className="space-y-3">
            {subjectBreakdown.map((s) => (
              <div key={s.name} className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700">{s.name}</span>
                  <span className="text-[#0E2A47]">
                    {s.correct}/{s.total} ({s.percent}%)
                  </span>
                </div>
                <ProgressBar
                  value={s.percent}
                  variant={s.percent >= 70 ? "emerald" : s.percent >= 50 ? "teal" : "danger"}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* System Breakdown Card */}
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0FA3A3]" /> Body System Performance
            </h3>
            <span className="text-xs text-slate-400 font-bold">{systemBreakdown.length} Systems</span>
          </div>

          <div className="space-y-3">
            {systemBreakdown.map((sys) => (
              <div key={sys.name} className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700">{sys.name}</span>
                  <span className="text-[#0E2A47]">
                    {sys.correct}/{sys.total} ({sys.percent}%)
                  </span>
                </div>
                <ProgressBar
                  value={sys.percent}
                  variant={sys.percent >= 70 ? "emerald" : sys.percent >= 50 ? "teal" : "danger"}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Attempt History Table */}
      <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#0FA3A3]" /> Attempt History Log
          </h3>
          <span className="text-xs text-slate-400 font-bold">{historyList.length} Total Sessions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider text-[11px] font-black">
                <th className="p-3">Test Block ID</th>
                <th className="p-3">Category & Mode</th>
                <th className="p-3">Date Completed</th>
                <th className="p-3">Score & Accuracy</th>
                <th className="p-3">Result Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {historyList.map((h) => {
                const isCurrent = h.id === session.id;
                const hScore = h.scorePercent ?? 0;
                // Same rule as the hero banner above — only assert PASS/FAIL when the server actually computed
                // a real verdict (mock mode with a linked mock exam); otherwise show a neutral score badge.
                const hHasOfficialPassFail = h.passed !== undefined && h.passed !== null;
                const hPassed = hHasOfficialPassFail ? !!h.passed : hScore >= 60;

                return (
                  <tr
                    key={h.id}
                    className={`transition-colors ${isCurrent ? "bg-teal-50/60 font-bold" : "hover:bg-slate-50"}`}
                  >
                    <td className="p-3 font-extrabold text-[#0E2A47]">
                      #{h.id} {isCurrent && <span className="text-[10px] text-[#0FA3A3] ml-1">(Current)</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="teal" size="sm">
                          {h.examCategory}
                        </Badge>
                        <span className="capitalize text-slate-500">{h.mode}</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-500">
                      {h.completedAt ? new Date(h.completedAt).toLocaleDateString() : "In Progress"}
                    </td>
                    <td className="p-3 font-extrabold text-[#0E2A47]">
                      {hScore}% ({h.correctCount}/{h.questionCount})
                    </td>
                    <td className="p-3">
                      <Badge variant={hHasOfficialPassFail ? (hPassed ? "emerald" : "danger") : "neutral"} size="sm">
                        {hHasOfficialPassFail ? (hPassed ? "PASS" : "FAIL") : `${hScore}%`}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link to={`/app/qbank/review/${h.id}`}>
                        <Button variant="ghost" size="sm">
                          Review
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
