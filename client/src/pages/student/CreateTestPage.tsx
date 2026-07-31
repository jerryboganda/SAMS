import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Zap,
  Clock,
  Layers,
  CheckCircle2,
  Sliders,
  AlertTriangle,
  AlertCircle,
  Play,
  Sparkles,
  XCircle,
  BookOpen,
} from "lucide-react";
import { Card, Button, Badge, Modal, Skeleton, EmptyState } from "../../components/ui";
import { qbankApi, CreateTestRequest, QbankMetaResponse } from "../../api/endpoints/qbank";
import { ApiError } from "../../api/client";
import { ExamCategory, TestMode, TestPool } from "../../types";

type LoadState = "loading" | "error" | "data";

const CATEGORY_LABELS: Record<string, string> = {
  NRE1: "NRE Step 1",
  USMLE1: "USMLE Step 1",
  USMLE2CK: "USMLE Step 2 CK",
  SMLE: "SMLE",
  DHA: "DHA",
  PROMETRIC: "Prometric",
  MBBS: "MBBS",
  OTHER: "Other",
};

export const CreateTestPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialPool = (searchParams.get("pool") as TestPool) || "all";
  const initialMode = (searchParams.get("mode") as TestMode) || "practice";
  const urlCategory = searchParams.get("category") as ExamCategory | null;

  // --- Meta (real accessible categories / taxonomy / live counts) ---------
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");
  const [meta, setMeta] = useState<QbankMetaResponse | null>(null);

  const loadMeta = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const data = await qbankApi.getMeta();
      setMeta(data);
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load QBank meta for create-test wizard", err);
      setLoadErrorMsg(err?.message || "Failed to load question bank filters.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Wizard Step State (1: Mode & Time, 2: Pool & Taxonomy, 3: Count & Summary)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [examCategory, setExamCategory] = useState<ExamCategory>(urlCategory || "NRE1");
  const [mode, setMode] = useState<TestMode>(initialMode);
  const [pool, setPool] = useState<TestPool>(initialPool);

  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [selectedSystemIds, setSelectedSystemIds] = useState<number[]>([]);

  const [timed, setTimed] = useState<boolean>(true);
  const [customMinutes, setCustomMinutes] = useState<number>(48);
  const [questionCount, setQuestionCount] = useState<number>(40);

  const [isCreating, setIsCreating] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictTestId, setConflictTestId] = useState<number | null>(null);
  const [insufficientInfo, setInsufficientInfo] = useState<{ available: number; requested: number } | null>(null);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);

  // Once meta loads: default the exam category to the URL param (if accessible) or the
  // student's first accessible category, and default subject/system filters to "all selected".
  // `filtersInitialized` gates the question-count clamp effect below — without it, that effect would see a
  // transient `maxAvailableCount===1` placeholder (computed from the still-empty `selectedSubjectIds`/
  // `selectedSystemIds` arrays on the very first render, before this effect has had a chance to populate them)
  // and permanently clamp the question count down to 1 before real data ever arrives.
  const [filtersInitialized, setFiltersInitialized] = useState(false);

  useEffect(() => {
    if (!meta) return;
    if (urlCategory && meta.categories.includes(urlCategory)) {
      setExamCategory(urlCategory);
    } else if (meta.categories.length > 0 && !meta.categories.includes(examCategory)) {
      setExamCategory(meta.categories[0]);
    }
    setSelectedSubjectIds(meta.subjects.map((s) => s.id));
    setSelectedSystemIds(meta.systems.map((s) => s.id));
    setFiltersInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  // --- Real, live-calculated counts from GET /qbank/meta's filterCounts ---
  // (never fabricated — see docs/07_EXECUTION_PLAN.md 7.5's explicit AC).

  const subjectSystemMatchCount = useMemo(() => {
    if (!meta) return 0;
    const subjectSet = new Set(selectedSubjectIds);
    const systemSet = new Set(selectedSystemIds);
    return meta.filterCounts
      .filter((f) => f.examCategory === examCategory && subjectSet.has(f.subjectId) && systemSet.has(f.systemId))
      .reduce((sum, f) => sum + f.count, 0);
  }, [meta, examCategory, selectedSubjectIds, selectedSystemIds]);

  // Pool counts (unused/incorrect/bookmarked) are only tracked totals cross-taxonomy on the server (no
  // per-subject/system breakdown endpoint) — so once a non-"all" pool AND a narrower subject/system filter are
  // both active, the true intersection can't be computed client-side. We take the tighter of the two known
  // bounds (never overstating) and label the number as an estimate whenever it isn't an exact figure; the
  // create call itself is always the authoritative check (422 INSUFFICIENT_QUESTIONS otherwise).
  const isExactCount = pool === "all";
  const estimatedAvailable = useMemo(() => {
    if (!meta) return 0;
    if (pool === "all") return subjectSystemMatchCount;
    return Math.min(subjectSystemMatchCount, meta.poolsCount[pool] ?? 0);
  }, [meta, pool, subjectSystemMatchCount]);

  const maxAvailableCount = Math.max(1, estimatedAvailable);

  useEffect(() => {
    if (!filtersInitialized) return; // don't clamp against the pre-meta placeholder max
    if (questionCount > maxAvailableCount) {
      setQuestionCount(Math.max(Math.min(5, maxAvailableCount), Math.min(maxAvailableCount, questionCount)));
    }
  }, [filtersInitialized, maxAvailableCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCustomMinutes(Math.max(5, Math.round(questionCount * 1.2)));
  }, [questionCount]);

  // Per-subject / per-system live chip counts, scoped to the selected exam category + the OTHER axis's
  // current selection (pool="all" basis — the exact figure GET /qbank/meta can give us per taxonomy row).
  const subjectQuestionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    if (!meta) return counts;
    const systemSet = new Set(selectedSystemIds);
    meta.subjects.forEach((s) => (counts[s.id] = 0));
    meta.filterCounts.forEach((f) => {
      if (f.examCategory !== examCategory || !systemSet.has(f.systemId)) return;
      counts[f.subjectId] = (counts[f.subjectId] || 0) + f.count;
    });
    return counts;
  }, [meta, examCategory, selectedSystemIds]);

  const systemQuestionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    if (!meta) return counts;
    const subjectSet = new Set(selectedSubjectIds);
    meta.systems.forEach((s) => (counts[s.id] = 0));
    meta.filterCounts.forEach((f) => {
      if (f.examCategory !== examCategory || !subjectSet.has(f.subjectId)) return;
      counts[f.systemId] = (counts[f.systemId] || 0) + f.count;
    });
    return counts;
  }, [meta, examCategory, selectedSubjectIds]);

  const toggleAllSubjects = () => {
    if (!meta) return;
    setSelectedSubjectIds((prev) => (prev.length === meta.subjects.length ? [] : meta.subjects.map((s) => s.id)));
  };
  const toggleAllSystems = () => {
    if (!meta) return;
    setSelectedSystemIds((prev) => (prev.length === meta.systems.length ? [] : meta.systems.map((s) => s.id)));
  };
  const toggleSubject = (id: number) => {
    setSelectedSubjectIds((prev) => (prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]));
  };
  const toggleSystem = (id: number) => {
    setSelectedSystemIds((prev) => (prev.includes(id) ? prev.filter((sysId) => sysId !== id) : [...prev, id]));
  };

  const handleStartTest = async (forceNew = false) => {
    if (!meta) return;
    setIsCreating(true);
    setInsufficientInfo(null);
    setSubmitErrorMsg(null);
    try {
      const payload: CreateTestRequest = {
        examCategory,
        mode,
        pool,
        count: Math.min(Math.max(5, questionCount), 200, maxAvailableCount),
        timed,
        timeLimitSeconds: timed ? customMinutes * 60 : undefined,
        subjectIds: selectedSubjectIds.length < meta.subjects.length ? selectedSubjectIds : undefined,
        systemIds: selectedSystemIds.length < meta.systems.length ? selectedSystemIds : undefined,
        forceNew,
      };

      const session = await qbankApi.createTest(payload);
      setConflictModalOpen(false);
      navigate(`/app/qbank/session/${session.id}`);
    } catch (err: any) {
      const apiErr = err as ApiError;
      if (apiErr.code === "ACTIVE_TEST_EXISTS" || apiErr.status === 409) {
        setConflictTestId(apiErr.details?.testId ?? null);
        setConflictModalOpen(true);
      } else if (apiErr.code === "INSUFFICIENT_QUESTIONS") {
        setInsufficientInfo({
          available: apiErr.details?.available ?? 0,
          requested: apiErr.details?.requested ?? questionCount,
        });
        setCurrentStep(3);
      } else {
        setSubmitErrorMsg(apiErr.message || "Failed to create test block. Please try again.");
      }
    } finally {
      setIsCreating(false);
    }
  };

  // --- Loading / error / empty states --------------------------------------

  if (loadState === "loading") {
    return (
      <div className="space-y-6 pb-12 max-w-4xl mx-auto">
        <Skeleton variant="text" className="h-8 w-64" />
        <Skeleton variant="card" className="h-14 rounded-2xl" />
        <Skeleton variant="card" className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (loadState === "error" || !meta) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<AlertCircle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load the test-block wizard"
          description={loadErrorMsg || "Something went wrong loading question bank filters."}
          actionLabel="Retry"
          onAction={loadMeta}
        />
      </div>
    );
  }

  if (meta.categories.length === 0) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<BookOpen className="w-10 h-10 text-slate-400" />}
          title="No QBank-enabled enrollment found"
          description="You aren't currently enrolled in a course that includes QBank access. Browse courses to get started."
          actionLabel="Browse Courses"
          onAction={() => navigate("/courses")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link
            to="/app/qbank"
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-500 hover:text-[#0E2A47] transition-colors mb-1"
          >
            <ArrowLeft className="w-4 h-4 text-[#0FA3A3]" /> Back to QBank Hub
          </Link>
          <h1 className="text-2xl font-black text-[#0E2A47]">Create Test Block</h1>
          <p className="text-xs text-slate-500">
            Customize question pool, modes, taxonomy filters, and timing options.
          </p>
        </div>

        <Badge variant="teal" size="md">
          Exam Target: {CATEGORY_LABELS[examCategory] || examCategory}
        </Badge>
      </div>

      {submitErrorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitErrorMsg}</span>
        </div>
      )}

      {/* 3-Step Wizard Progress Bar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center select-none">
        {[
          { step: 1, title: "1. Mode & Timing", icon: Zap },
          { step: 2, title: "2. Pool & Taxonomy", icon: Layers },
          { step: 3, title: "3. Count & Summary", icon: Sliders },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = currentStep === item.step;
          const isDone = currentStep > item.step;

          return (
            <button
              key={item.step}
              type="button"
              onClick={() => setCurrentStep(item.step)}
              className={`p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                isActive
                  ? "border-[#0FA3A3] bg-[#0FA3A3]/10 text-[#0E2A47] shadow-xs"
                  : isDone
                  ? "border-emerald-200 bg-emerald-50/50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${
                  isActive
                    ? "bg-[#0FA3A3] text-white"
                    : isDone
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : item.step}
              </div>
              <span className="hidden sm:inline truncate">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Wizard Form Card */}
      <Card className="p-6 border-slate-200 space-y-6 bg-white rounded-2xl shadow-sm">
        {/* STEP 1: MODE & TIMING */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-black text-[#0E2A47] flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#0FA3A3]" /> Step 1: Select Exam Target & Mode
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Choose your accessible exam category and how answer feedback / time constraints are handled.
              </p>
            </div>

            {meta.categories.length > 1 && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#0E2A47]" htmlFor="exam-category-select">
                  Exam Category
                </label>
                <select
                  id="exam-category-select"
                  value={examCategory}
                  onChange={(e) => setExamCategory(e.target.value as ExamCategory)}
                  className="w-full sm:w-64 px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-[#0E2A47] focus:ring-2 focus:ring-[#0FA3A3] focus:border-[#0FA3A3]"
                >
                  {meta.categories.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] || c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Mode Option Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`p-5 rounded-2xl text-left border-2 transition-all space-y-2 ${
                  mode === "practice"
                    ? "border-[#0FA3A3] bg-[#0FA3A3]/5 text-[#0E2A47] shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#0E2A47]">Practice Mode</span>
                  <Badge variant={mode === "practice" ? "teal" : "neutral"} size="sm">
                    Recommended for Learning
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  Immediate answer validation, correct options, and detailed medical explanations are shown after answering each vignette.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("exam")}
                className={`p-5 rounded-2xl text-left border-2 transition-all space-y-2 ${
                  mode === "exam"
                    ? "border-[#0FA3A3] bg-[#0FA3A3]/5 text-[#0E2A47] shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#0E2A47]">Exam Simulation Mode</span>
                  <Badge variant={mode === "exam" ? "teal" : "neutral"} size="sm">
                    Timed Test
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  Simulates real exam conditions. Answers and explanations remain hidden until you finish and submit the entire test block.
                </p>
              </button>
            </div>

            {/* Timing Controls */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <h3 className="text-sm font-extrabold text-[#0E2A47] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#0FA3A3]" /> Block Timing Settings
              </h3>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={timed}
                    onChange={(e) => setTimed(e.target.checked)}
                    className="w-4 h-4 text-[#0FA3A3] accent-[#0FA3A3] rounded cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-extrabold text-[#0E2A47] block">
                      Enforce Timed Test Block
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Standard exam pace is 1.2 minutes (72 seconds) per question.
                    </span>
                  </div>
                </label>

                {timed && (
                  <div className="pl-7 pt-2 flex flex-wrap items-center gap-3 border-t border-slate-200/60">
                    <label htmlFor="allocated-minutes" className="text-xs font-bold text-slate-700">
                      Allocated Time:
                    </label>
                    <input
                      id="allocated-minutes"
                      type="number"
                      min={5}
                      max={300}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(Number(e.target.value))}
                      className="w-20 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-[#0E2A47] focus:ring-2 focus:ring-[#0FA3A3]"
                    />
                    <span className="text-xs font-semibold text-slate-500">
                      Minutes ({Math.round((customMinutes * 60) / Math.max(1, questionCount))} sec / Q)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Step 1 Actions */}
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button variant="teal" size="md" onClick={() => setCurrentStep(2)}>
                Next: Select Question Pool & Taxonomy &rarr;
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: POOL & TAXONOMY */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-black text-[#0E2A47] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#0FA3A3]" /> Step 2: Question Pool & Taxonomy Filters
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Filter questions by historical performance pool, medical subjects, and body systems.
              </p>
            </div>

            {/* Question Pool Selection Grid */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#0E2A47]">Question Pool Source</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(
                  [
                    { id: "all", label: "All Questions", count: meta.poolsCount.all },
                    { id: "unused", label: "Unused Questions", count: meta.poolsCount.unused },
                    { id: "incorrect", label: "Incorrect Pool", count: meta.poolsCount.incorrect },
                    { id: "bookmarked", label: "Bookmarked", count: meta.poolsCount.bookmarked },
                  ] as { id: TestPool; label: string; count: number }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPool(p.id)}
                    className={`p-3 rounded-xl border text-xs text-left transition-all ${
                      pool === p.id
                        ? "border-[#0FA3A3] bg-[#0FA3A3]/10 font-extrabold text-[#0E2A47] shadow-xs"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold">{p.label}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{p.count} in pool</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Matching Questions Counter Banner */}
            <div className="p-3 bg-gradient-to-r from-slate-900 to-[#0E2A47] text-white rounded-xl flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Sparkles className="w-4 h-4 text-[#0FA3A3]" />
                <span>
                  {isExactCount ? "Live Filter Matches" : "Estimated Available"}:{" "}
                  <span className="text-[#0FA3A3] text-sm font-black">{estimatedAvailable}</span> questions
                </span>
              </div>
              <Badge variant="teal" size="sm">
                {isExactCount ? "Server-Verified" : "Confirmed at Creation"}
              </Badge>
            </div>

            {/* Subjects Filter Chip Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-extrabold text-[#0E2A47]">
                  Medical Basic & Clinical Sciences ({selectedSubjectIds.length}/{meta.subjects.length})
                </span>
                <button
                  type="button"
                  onClick={toggleAllSubjects}
                  className="text-[11px] font-bold text-[#0FA3A3] hover:underline"
                >
                  {selectedSubjectIds.length === meta.subjects.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {meta.subjects.map((s) => {
                  const isChecked = selectedSubjectIds.includes(s.id);
                  const count = subjectQuestionCounts[s.id] || 0;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      className={`p-2.5 rounded-xl border text-xs text-left flex items-center justify-between gap-2 transition-all ${
                        isChecked
                          ? "border-[#0FA3A3] bg-[#0FA3A3]/10 font-bold text-[#0E2A47]"
                          : "border-slate-200 bg-slate-50 text-slate-500 opacity-70"
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 shrink-0">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body Systems Filter Chip Grid */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-extrabold text-[#0E2A47]">
                  Organ Systems ({selectedSystemIds.length}/{meta.systems.length})
                </span>
                <button
                  type="button"
                  onClick={toggleAllSystems}
                  className="text-[11px] font-bold text-[#0FA3A3] hover:underline"
                >
                  {selectedSystemIds.length === meta.systems.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {meta.systems.map((sys) => {
                  const isChecked = selectedSystemIds.includes(sys.id);
                  const count = systemQuestionCounts[sys.id] || 0;

                  return (
                    <button
                      key={sys.id}
                      type="button"
                      onClick={() => toggleSystem(sys.id)}
                      className={`p-2.5 rounded-xl border text-xs text-left flex items-center justify-between gap-2 transition-all ${
                        isChecked
                          ? "border-[#0FA3A3] bg-[#0FA3A3]/10 font-bold text-[#0E2A47]"
                          : "border-slate-200 bg-slate-50 text-slate-500 opacity-70"
                      }`}
                    >
                      <span className="truncate">{sys.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 shrink-0">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button variant="outline" size="md" onClick={() => setCurrentStep(1)}>
                &larr; Back
              </Button>
              <Button
                variant="teal"
                size="md"
                disabled={estimatedAvailable === 0}
                onClick={() => setCurrentStep(3)}
              >
                Next: Set Count & Review &rarr;
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: COUNT & SUMMARY */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-black text-[#0E2A47] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#0FA3A3]" /> Step 3: Question Count & Block Summary
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Set question block size (clamped to live available matches) and verify settings.
              </p>
            </div>

            {insufficientInfo && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-2">
                <div className="flex items-center gap-2 font-black">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Only {insufficientInfo.available} question{insufficientInfo.available === 1 ? "" : "s"} actually
                    match your filters (you requested {insufficientInfo.requested}).
                  </span>
                </div>
                <p className="font-medium">
                  Widen your subject/system filters, choose a different pool, or use the corrected count below.
                </p>
                {insufficientInfo.available >= 5 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuestionCount(insufficientInfo.available);
                      setInsufficientInfo(null);
                    }}
                  >
                    Use {insufficientInfo.available} Questions Instead
                  </Button>
                )}
              </div>
            )}

            {/* Slider Controls Container */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#0E2A47]">Question Block Size</span>
                <span className="text-lg font-black text-[#0FA3A3]">
                  {questionCount} <span className="text-xs font-semibold text-slate-500">Questions</span>
                </span>
              </div>

              {/* Range Input Slider (Clamped to [5,200] and the live/estimated max) */}
              <input
                type="range"
                aria-label="Question block size"
                min={Math.min(5, maxAvailableCount)}
                max={Math.min(200, maxAvailableCount)}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full h-2 accent-[#0FA3A3] bg-slate-200 rounded-lg cursor-pointer"
              />

              {/* Slider Presets */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-400 font-semibold">
                  Max Available: {maxAvailableCount} Q {!isExactCount && "(est.)"}
                </span>

                <div className="flex items-center gap-1.5">
                  {[10, 20, 40, maxAvailableCount].map((preset) => {
                    if (preset > maxAvailableCount || preset < 5) return null;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuestionCount(preset)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          questionCount === preset
                            ? "bg-[#0FA3A3] text-white shadow-xs"
                            : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {preset === maxAvailableCount ? `Max (${preset})` : `${preset} Q`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Final Summary Card Panel */}
            <div className="p-5 border-2 border-[#0FA3A3]/30 bg-[#0FA3A3]/5 rounded-2xl space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#0FA3A3] border-b border-[#0FA3A3]/20 pb-2">
                Test Block Specifications Summary
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-600 font-semibold block">Target Exam</span>
                  <span className="font-extrabold text-[#0E2A47]">{CATEGORY_LABELS[examCategory] || examCategory}</span>
                </div>

                <div>
                  <span className="text-slate-600 font-semibold block">Test Mode</span>
                  <span className="font-extrabold text-[#0E2A47] capitalize">{mode} Mode</span>
                </div>

                <div>
                  <span className="text-slate-600 font-semibold block">Question Pool</span>
                  <span className="font-extrabold text-[#0E2A47] capitalize">{pool} Pool</span>
                </div>

                <div>
                  <span className="text-slate-600 font-semibold block">Subjects Filter</span>
                  <span className="font-extrabold text-[#0E2A47]">
                    {selectedSubjectIds.length}/{meta.subjects.length} Subjects
                  </span>
                </div>

                <div>
                  <span className="text-slate-600 font-semibold block">Systems Filter</span>
                  <span className="font-extrabold text-[#0E2A47]">
                    {selectedSystemIds.length}/{meta.systems.length} Systems
                  </span>
                </div>

                <div>
                  <span className="text-slate-600 font-semibold block">Allocated Time</span>
                  <span className="font-extrabold text-[#0E2A47]">
                    {timed ? `${customMinutes} Minutes` : "Untimed"}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Row */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button variant="outline" size="md" onClick={() => setCurrentStep(2)}>
                &larr; Back
              </Button>

              <Button
                variant="teal"
                size="lg"
                isLoading={isCreating}
                disabled={estimatedAvailable === 0}
                icon={<Play className="w-5 h-5 fill-current" />}
                onClick={() => handleStartTest(false)}
              >
                Generate & Start Test Block
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 409 ACTIVE_TEST_EXISTS Conflict Modal */}
      <Modal
        isOpen={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        title="Active Test Block in Progress"
        size="md"
      >
        <div className="space-y-5 p-1 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-[#0E2A47]">
              Unfinished Test Session Detected
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
              You already have an active test block{conflictTestId ? ` (Session #${conflictTestId})` : ""} in
              progress. Only one active test block can exist at a time.
            </p>
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-semibold text-left">
            What would you like to do with your active session?
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Button
              variant="teal"
              size="md"
              fullWidth
              disabled={!conflictTestId}
              onClick={() => conflictTestId && navigate(`/app/qbank/session/${conflictTestId}`)}
              icon={<Play className="w-4 h-4 fill-current" />}
            >
              Resume Active Test
            </Button>

            <Button
              variant="outline"
              size="md"
              fullWidth
              isLoading={isCreating}
              onClick={() => handleStartTest(true)}
              icon={<XCircle className="w-4 h-4 text-rose-500" />}
            >
              Abandon & Start New Block
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
