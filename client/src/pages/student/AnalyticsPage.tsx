import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  TrendingUp,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Target,
  Edit2,
  Calendar,
  Sparkles,
  ArrowRight,
  Award,
  Layers,
  BookOpen,
  X,
  Play,
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
import { Card, Button, Badge, ProgressBar, StatCard, Modal, Input } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";

type DateRange = 7 | 30 | 90;

export const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();

  // Date Range Picker State
  const [dateRange, setDateRange] = useState<DateRange>(30);

  // Weekly Goal State (persisted in localStorage)
  const [weeklyGoal, setWeeklyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("sams_weekly_goal");
    return saved ? parseInt(saved, 10) : 250;
  });
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState<string>(weeklyGoal.toString());

  // Analytics Data from API
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      setIsLoading(true);
      try {
        const data = await qbankApi.getAnalytics();
        setAnalyticsData(data);
      } catch (err) {
        console.error("Failed to load analytics", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadAnalytics();
  }, []);

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

  // Generate trend line data according to date range (7, 30, 90 days)
  const accuracyTrendData = useMemo(() => {
    if (dateRange === 7) {
      return [
        { label: "Day 1", accuracy: 68, questions: 25 },
        { label: "Day 2", accuracy: 72, questions: 30 },
        { label: "Day 3", accuracy: 70, questions: 20 },
        { label: "Day 4", accuracy: 78, questions: 45 },
        { label: "Day 5", accuracy: 75, questions: 35 },
        { label: "Day 6", accuracy: 82, questions: 50 },
        { label: "Day 7", accuracy: 80, questions: 40 },
      ];
    } else if (dateRange === 30) {
      return [
        { label: "Week 1", accuracy: 68, questions: 140 },
        { label: "Week 2", accuracy: 72, questions: 165 },
        { label: "Week 3", accuracy: 76, questions: 180 },
        { label: "Week 4", accuracy: 81, questions: 195 },
      ];
    } else {
      return [
        { label: "Month 1", accuracy: 65, questions: 450 },
        { label: "Month 2", accuracy: 74, questions: 520 },
        { label: "Month 3", accuracy: 82, questions: 610 },
      ];
    }
  }, [dateRange]);

  // Daily Questions Bar Chart Data
  const questionsPerDayData = useMemo(() => {
    return [
      { day: "Mon", questions: 35, target: 30 },
      { day: "Tue", questions: 48, target: 30 },
      { day: "Wed", questions: 22, target: 30 },
      { day: "Thu", questions: 52, target: 30 },
      { day: "Fri", questions: 60, target: 30 },
      { day: "Sat", questions: 40, target: 30 },
      { day: "Sun", questions: 38, target: 30 },
    ];
  }, []);

  // Quick Action navigation for practicing subject
  const handlePracticeSubject = (subjectName: string, isWeakness = false) => {
    const url = isWeakness
      ? `/app/qbank/new?category=NRE1&pool=incorrect&subject=${encodeURIComponent(subjectName)}`
      : `/app/qbank/new?category=NRE1&subject=${encodeURIComponent(subjectName)}`;
    navigate(url);
  };

  if (isLoading || !analyticsData) {
    return (
      <div className="py-20 text-center space-y-3 max-w-xl mx-auto">
        <div className="w-10 h-10 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-500">Processing Medical Diagnostic Analytics...</p>
      </div>
    );
  }

  // Calculate Weekly Goal Progress
  const questionsThisWeek = 195; // sample current week count
  const goalPercent = Math.min(100, Math.round((questionsThisWeek / weeklyGoal) * 100));

  // Top Strengths & Weaknesses
  const strengths = analyticsData.strengths || [
    { name: "Pathology", score: 88 },
    { name: "Pharmacology", score: 84 },
    { name: "Cardiovascular System", score: 82 },
  ];

  const weaknesses = analyticsData.weaknesses || [
    { name: "Biochemistry", score: 58 },
    { name: "Genetics", score: 62 },
    { name: "Biostatistics", score: 64 },
  ];

  // Subject and System Data for Horizontal Bar Charts
  const subjectChartData = (analyticsData.subjectPerformance || []).map((s: any) => ({
    name: s.name,
    accuracy: s.percent,
  }));

  const systemChartData = (analyticsData.systemPerformance || []).map((sys: any) => ({
    name: sys.name,
    accuracy: sys.percent,
  }));

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

        {/* Date-Range Selector Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <Calendar className="w-4 h-4 text-slate-400 ml-2 mr-1" />
          {([7, 30, 90] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                dateRange === r
                  ? "bg-white text-[#0E2A47] shadow-xs border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {r} Days
            </button>
          ))}
        </div>
      </div>

      {/* Top Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Overall Accuracy"
          value={`${analyticsData.overall?.overallPercent || 76.4}%`}
          change="+4.2% vs prior period"
          changeType="positive"
          icon={<TrendingUp className="w-5 h-5 text-[#0FA3A3]" />}
        />

        <StatCard
          title="Questions Completed"
          value={`${analyticsData.overall?.totalAttempted || 540} / 1,200`}
          change="45% of NRE QBank done"
          changeType="positive"
          icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}
        />

        <StatCard
          title="Cumulative Study Time"
          value="28.5 Hours"
          change="Avg 42s per question"
          changeType="positive"
          icon={<Clock className="w-5 h-5 text-emerald-600" />}
        />

        <StatCard
          title="Completed Test Blocks"
          value="18 Blocks"
          change="12 Practice • 6 Exam"
          changeType="positive"
          icon={<BookOpen className="w-5 h-5 text-amber-600" />}
        />
      </div>

      {/* Cumulative Weekly Progress Goal Card (With Ring Indicator & LocalStorage Persistence) */}
      <Card className="p-6 bg-gradient-to-r from-[#0E2A47] to-slate-900 text-white rounded-2xl shadow-md">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Ring Chart & Stats */}
          <div className="flex items-center gap-6">
            {/* SVG Cumulative Progress Ring */}
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

      {/* Main Charts Row 1: Line Chart & Questions/Day Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accuracy Over Time Line Chart */}
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-[#0E2A47]">Accuracy Trend Over Time</h3>
              <p className="text-[11px] text-slate-400">Diagnostic correctness trajectory for past {dateRange} days</p>
            </div>
            <Badge variant="teal" size="sm" className="font-bold">
              {dateRange}D Trend
            </Badge>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11} tickLine={false} unit="%" />
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
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#0FA3A3"
                  strokeWidth={3}
                  dot={{ fill: "#0FA3A3", r: 4 }}
                  activeDot={{ r: 6, fill: "#0E2A47" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Questions Per Day Bar Chart */}
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-[#0E2A47]">Daily Vignettes Solved</h3>
              <p className="text-[11px] text-slate-400">Questions answered per day compared to daily target</p>
            </div>
            <Badge variant="emerald" size="sm" className="font-bold">
              Weekly Activity
            </Badge>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={questionsPerDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  formatter={(val: any) => [`${val} Qs`, "Questions"]}
                  contentStyle={{
                    backgroundColor: "#0E2A47",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                    border: "none",
                  }}
                />
                <Bar dataKey="questions" fill="#0E2A47" radius={[6, 6, 0, 0]}>
                  {questionsPerDayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.questions >= 40 ? "#0FA3A3" : "#0E2A47"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Strengths & Weaknesses Panels with Quick Action Practice Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Strengths Panel (Green) */}
        <Card className="p-6 border-emerald-200 bg-emerald-50/30 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-black text-emerald-950">Top Diagnostic Strengths (Top 3)</h3>
            </div>
            <Badge variant="emerald" size="sm" className="font-extrabold">
              STRONG
            </Badge>
          </div>

          <div className="space-y-3">
            {strengths.map((str: any) => (
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
        </Card>

        {/* Bottom Weaknesses Panel (Red) */}
        <Card className="p-6 border-rose-200 bg-rose-50/30 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-rose-200/60 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="text-sm font-black text-rose-950">Revision Weak Spots (Bottom 3)</h3>
            </div>
            <Badge variant="danger" size="sm" className="font-extrabold">
              NEEDS WORK
            </Badge>
          </div>

          <div className="space-y-3">
            {weaknesses.map((weak: any) => (
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
        </Card>
      </div>

      {/* Main Charts Row 2: Subject-Wise & System-Wise Horizontal Accuracy Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subject-Wise Accuracy Bar Chart */}
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0FA3A3]" /> Subject-Wise Accuracy Breakdown
            </h3>
            <span className="text-xs text-slate-400 font-bold">{subjectChartData.length} Subjects</span>
          </div>

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
                  {subjectChartData.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.accuracy >= 75 ? "#0FA3A3" : entry.accuracy >= 65 ? "#0E2A47" : "#E11D48"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* System-Wise Accuracy Bar Chart */}
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0FA3A3]" /> Body System Accuracy Breakdown
            </h3>
            <span className="text-xs text-slate-400 font-bold">{systemChartData.length} Systems</span>
          </div>

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
                  {systemChartData.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.accuracy >= 75 ? "#0FA3A3" : entry.accuracy >= 65 ? "#0E2A47" : "#E11D48"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
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
