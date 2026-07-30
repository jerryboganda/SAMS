import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Zap,
  Clock,
  Layers,
  CheckCircle2,
  Sliders,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Bookmark,
  FileQuestion,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { Card, Button, Badge, Modal, ToastSystem } from "../../components/ui";
import { qbankApi, CreateTestRequest } from "../../api/endpoints/qbank";
import { MOCK_QUESTIONS, MOCK_SUBJECTS, MOCK_SYSTEMS } from "../../mock-data";
import { ExamCategory, TestMode, TestPool } from "../../types";

export const CreateTestPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Initial URL parameters (e.g., /app/qbank/new?pool=incorrect&category=NRE1&mode=practice)
  const initialPool = (searchParams.get("pool") as TestPool) || "all";
  const initialCategory = (searchParams.get("category") as ExamCategory) || "NRE1";
  const initialMode = (searchParams.get("mode") as TestMode) || "practice";

  // Wizard Step State (1: Mode & Time, 2: Pool & Taxonomy, 3: Count & Summary)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [examCategory, setExamCategory] = useState<ExamCategory>(initialCategory);
  const [mode, setMode] = useState<TestMode>(initialMode);
  const [pool, setPool] = useState<TestPool>(initialPool);

  // Subjects & Systems selection (default all selected)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>(() =>
    MOCK_SUBJECTS.map((s) => s.id)
  );
  const [selectedSystemIds, setSelectedSystemIds] = useState<number[]>(() =>
    MOCK_SYSTEMS.map((s) => s.id)
  );

  // Timing
  const [timed, setTimed] = useState<boolean>(true);
  const [customMinutes, setCustomMinutes] = useState<number>(48);

  // Question Count
  const [questionCount, setQuestionCount] = useState<number>(40);

  // Loading & Conflict Modal State
  const [isCreating, setIsCreating] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictTestId, setConflictTestId] = useState<number | null>(null);

  // Filter matching questions based on pool + subjects + systems
  const matchingQuestions = useMemo(() => {
    return MOCK_QUESTIONS.filter((q) => {
      // Pool filter
      if (pool === "bookmarked" && !q.isBookmarked) return false;
      if (pool === "unused" && q.id <= 15) return false;
      if (pool === "incorrect" && (q.id > 15 || q.id % 2 === 0)) return false;

      // Subject filter
      if (selectedSubjectIds.length > 0 && !selectedSubjectIds.includes(q.subjectId)) {
        return false;
      }

      // System filter
      if (selectedSystemIds.length > 0 && !selectedSystemIds.includes(q.systemId)) {
        return false;
      }

      return true;
    });
  }, [pool, selectedSubjectIds, selectedSystemIds]);

  const maxAvailableCount = Math.max(1, matchingQuestions.length);

  // Auto-clamp question count whenever maxAvailableCount changes
  useEffect(() => {
    if (questionCount > maxAvailableCount) {
      setQuestionCount(Math.max(5, Math.min(maxAvailableCount, questionCount)));
    }
  }, [maxAvailableCount]);

  // Update auto-suggested minutes when question count or timing changes
  useEffect(() => {
    setCustomMinutes(Math.round(questionCount * 1.2));
  }, [questionCount]);

  // Subject question count map for live chip counts
  const subjectQuestionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    MOCK_SUBJECTS.forEach((s) => {
      counts[s.id] = MOCK_QUESTIONS.filter((q) => {
        if (q.subjectId !== s.id) return false;
        if (pool === "bookmarked" && !q.isBookmarked) return false;
        if (pool === "unused" && q.id <= 15) return false;
        if (pool === "incorrect" && (q.id > 15 || q.id % 2 === 0)) return false;
        if (selectedSystemIds.length > 0 && !selectedSystemIds.includes(q.systemId)) return false;
        return true;
      }).length;
    });
    return counts;
  }, [pool, selectedSystemIds]);

  // System question count map for live chip counts
  const systemQuestionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    MOCK_SYSTEMS.forEach((sys) => {
      counts[sys.id] = MOCK_QUESTIONS.filter((q) => {
        if (q.systemId !== sys.id) return false;
        if (pool === "bookmarked" && !q.isBookmarked) return false;
        if (pool === "unused" && q.id <= 15) return false;
        if (pool === "incorrect" && (q.id > 15 || q.id % 2 === 0)) return false;
        if (selectedSubjectIds.length > 0 && !selectedSubjectIds.includes(q.subjectId)) return false;
        return true;
      }).length;
    });
    return counts;
  }, [pool, selectedSubjectIds]);

  // Select/Deselect All Handlers
  const toggleAllSubjects = () => {
    if (selectedSubjectIds.length === MOCK_SUBJECTS.length) {
      setSelectedSubjectIds([]);
    } else {
      setSelectedSubjectIds(MOCK_SUBJECTS.map((s) => s.id));
    }
  };

  const toggleAllSystems = () => {
    if (selectedSystemIds.length === MOCK_SYSTEMS.length) {
      setSelectedSystemIds([]);
    } else {
      setSelectedSystemIds(MOCK_SYSTEMS.map((sys) => sys.id));
    }
  };

  const toggleSubject = (id: number) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const toggleSystem = (id: number) => {
    setSelectedSystemIds((prev) =>
      prev.includes(id) ? prev.filter((sysId) => sysId !== id) : [...prev, id]
    );
  };

  // Submit Handler
  const handleStartTest = async (forceNew = false) => {
    setIsCreating(true);
    try {
      const payload: CreateTestRequest = {
        examCategory,
        mode,
        pool,
        count: Math.min(questionCount, maxAvailableCount),
        timed,
        timeLimitSeconds: timed ? customMinutes * 60 : undefined,
        subjectIds: selectedSubjectIds.length < MOCK_SUBJECTS.length ? selectedSubjectIds : undefined,
        systemIds: selectedSystemIds.length < MOCK_SYSTEMS.length ? selectedSystemIds : undefined,
        forceNew,
      };

      const session = await qbankApi.createTest(payload);
      setConflictModalOpen(false);
      navigate(`/app/qbank/session/${session.id}`);
    } catch (err: any) {
      if (err.code === "ACTIVE_TEST_EXISTS" || err.status === 409) {
        setConflictTestId(err.details?.testId || 101);
        setConflictModalOpen(true);
      } else {
        alert(err.message || "Failed to create test block.");
      }
    } finally {
      setIsCreating(false);
    }
  };

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
          Exam Target: PMDC NRE Step 1
        </Badge>
      </div>

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
                <Zap className="w-5 h-5 text-[#0FA3A3]" /> Step 1: Select Test Mode
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Choose how answer feedback and time constraints are handled during the test block.
              </p>
            </div>

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
                    <span className="text-xs font-bold text-slate-700">Allocated Time:</span>
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(Number(e.target.value))}
                      className="w-20 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-[#0E2A47] focus:ring-2 focus:ring-[#0FA3A3]"
                    />
                    <span className="text-xs font-semibold text-slate-500">
                      Minutes ({Math.round((customMinutes * 60) / questionCount)} sec / Q)
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
                {[
                  { id: "all", label: "All Questions", count: 64 },
                  { id: "unused", label: "Unused Questions", count: 45 },
                  { id: "incorrect", label: "Incorrect Pool", count: 12 },
                  { id: "bookmarked", label: "Bookmarked", count: 13 },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPool(p.id as TestPool)}
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
                  Live Filter Matches: <span className="text-[#0FA3A3] text-sm font-black">{matchingQuestions.length}</span> questions available
                </span>
              </div>
              <Badge variant="teal" size="sm">
                Live Calculated
              </Badge>
            </div>

            {/* Subjects Filter Chip Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-extrabold text-[#0E2A47]">
                  Medical Basic & Clinical Sciences ({selectedSubjectIds.length}/{MOCK_SUBJECTS.length})
                </span>
                <button
                  type="button"
                  onClick={toggleAllSubjects}
                  className="text-[11px] font-bold text-[#0FA3A3] hover:underline"
                >
                  {selectedSubjectIds.length === MOCK_SUBJECTS.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {MOCK_SUBJECTS.map((s) => {
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
                  Organ Systems ({selectedSystemIds.length}/{MOCK_SYSTEMS.length})
                </span>
                <button
                  type="button"
                  onClick={toggleAllSystems}
                  className="text-[11px] font-bold text-[#0FA3A3] hover:underline"
                >
                  {selectedSystemIds.length === MOCK_SYSTEMS.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {MOCK_SYSTEMS.map((sys) => {
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
                disabled={matchingQuestions.length === 0}
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

            {/* Slider Controls Container */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#0E2A47]">Question Block Size</span>
                <span className="text-lg font-black text-[#0FA3A3]">
                  {questionCount} <span className="text-xs font-semibold text-slate-500">Questions</span>
                </span>
              </div>

              {/* Range Input Slider (Clamped) */}
              <input
                type="range"
                min={Math.min(5, maxAvailableCount)}
                max={Math.min(200, maxAvailableCount)}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full h-2 accent-[#0FA3A3] bg-slate-200 rounded-lg cursor-pointer"
              />

              {/* Slider Presets */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-400 font-semibold">
                  Max Available: {maxAvailableCount} Q
                </span>

                <div className="flex items-center gap-1.5">
                  {[10, 20, 40, maxAvailableCount].map((preset) => {
                    if (preset > maxAvailableCount) return null;
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
                  <span className="font-extrabold text-[#0E2A47]">NRE Step 1</span>
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
                    {selectedSubjectIds.length}/{MOCK_SUBJECTS.length} Subjects
                  </span>
                </div>

                <div>
                  <span className="text-slate-600 font-semibold block">Systems Filter</span>
                  <span className="font-extrabold text-[#0E2A47]">
                    {selectedSystemIds.length}/{MOCK_SYSTEMS.length} Systems
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
              You already have an active test block (Session #{conflictTestId || 101}) in progress. In compliance with medical candidate testing policies, only one active test block can exist at a time.
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
              onClick={() => navigate(`/app/qbank/session/${conflictTestId || 101}`)}
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
