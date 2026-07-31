import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileQuestion,
  HelpCircle,
  TrendingUp,
  Clock,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, Button, Badge, Skeleton, EmptyState } from "../../components/ui";
import { publicApi } from "../../api/endpoints/public";
import { Question } from "../../types";

export const QBankMarketingPage: React.FC = () => {
  const navigate = useNavigate();

  const [sampleQuestions, setSampleQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await publicApi.getSampleQuestions();
      setSampleQuestions(data);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load the sample QBank demo. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // Interactive Demo State
  const [currentIdx, setCurrentIdx] = useState(0);
  // NOTE: the real `/public/sample-questions` endpoint deliberately never
  // sends `isCorrect` on any option (server/src/services/publicService.js
  // #serializeQuestionPublic — public marketing content must never leak
  // answers pre-submit, docs/04_API_SPEC.md §8). The original AI-Studio
  // demo revealed the correct option and a live score the moment a student
  // picked an answer; that can't be faked client-side without inventing
  // data, so this demo now only tracks *which* option was picked, not
  // whether it was right — see DECISIONS.md 2026-07-31 (Phase 3.2-3.4).
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentQ = sampleQuestions[currentIdx];
  const userChoice = currentQ ? selectedAnswers[currentQ.id] : undefined;
  const answeredCount = Object.keys(selectedAnswers).length;

  const handleSelectOption = (optId: number) => {
    if (!currentQ) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: optId,
    }));
  };

  return (
    <div className="space-y-12 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Hero Banner */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-14 rounded-3xl text-center space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-96 h-96 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0FA3A3]/20 text-[#0FA3A3] text-xs font-bold border border-[#0FA3A3]/40">
            <Sparkles className="w-4 h-4" />
            <span>Interactive Medical QBank Engine</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            NRE Step 1 & Gulf Exam Style <span className="text-[#0FA3A3]">QBank</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            Master 3,000+ single-best-answer clinical vignettes with step-by-step explanations, high-yield organ pathology mechanisms, and real-time exam analytics.
          </p>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0E2A47] text-[#0FA3A3] flex items-center justify-center">
            <FileQuestion className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">3,000+ Vignettes</h3>
          <p className="text-xs text-slate-600">
            Strictly modeled on PMDC NRE Step 1, SMLE, USMLE, and Gulf licensing blueprints.
          </p>
        </Card>

        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0FA3A3] text-white flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">Practice & Exam Modes</h3>
          <p className="text-xs text-slate-600">
            Choose instant feedback mode or timed exam simulations with palette navigation.
          </p>
        </Card>

        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0E2A47] text-[#0FA3A3] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">Performance Analytics</h3>
          <p className="text-xs text-slate-600">
            Identify weak organ systems and track your accuracy and time per question.
          </p>
        </Card>

        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0FA3A3] text-white flex items-center justify-center">
            <RotateCcw className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">Incorrect Pools</h3>
          <p className="text-xs text-slate-600">
            One-click retest incorrect and bookmarked questions to ensure complete mastery.
          </p>
        </Card>
      </div>

      {/* INTERACTIVE SAMPLE QUESTION DEMO SECTION */}
      {isLoading && (
        <Card className="p-6 sm:p-8 border-[#0FA3A3]/30 shadow-lg bg-white space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </Card>
      )}

      {!isLoading && loadError && (
        <Card className="p-12 text-center border-rose-200 bg-rose-50/40">
          <EmptyState
            icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
            title="Couldn't Load Sample Questions"
            description={loadError}
            actionText="Try Again"
            onAction={loadQuestions}
          />
        </Card>
      )}

      {!isLoading && !loadError && sampleQuestions.length === 0 && (
        <Card className="p-12 text-center border-slate-200">
          <EmptyState
            icon={<FileQuestion className="w-10 h-10 text-slate-400" />}
            title="Demo Questions Coming Soon"
            description="Our sample QBank demo is being prepared. Check back soon."
          />
        </Card>
      )}

      {!isLoading && !loadError && currentQ && (
        <Card className="p-6 sm:p-8 border-[#0FA3A3]/30 shadow-lg bg-white space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="teal">TRY IT NOW</Badge>
                <span className="text-xs text-slate-500 font-bold">Interactive Sample Demo</span>
              </div>
              <h2 className="text-xl font-extrabold text-[#0E2A47] mt-1">
                Sample Clinical Vignette Practice ({currentIdx + 1} of {sampleQuestions.length})
              </h2>
            </div>

            {/* Question Stepper */}
            <div className="flex items-center gap-2">
              {sampleQuestions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    currentIdx === idx
                      ? "bg-[#0E2A47] text-white shadow-xs"
                      : selectedAnswers[q.id]
                      ? "bg-[#0FA3A3]/15 text-[#0FA3A3]"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Current Question Stem Card */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0FA3A3]">
              <span>{currentQ.subjectName || "General Medicine"}</span> &bull; <span>{currentQ.systemName || "Mixed Systems"}</span>
            </div>

            <p className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
              {currentQ.stem}
            </p>

            {/* Options List — real backend never sends isCorrect for this
                public endpoint, so a selected option is only ever styled as
                "selected", never as right/wrong. */}
            <div className="space-y-2.5">
              {currentQ.options.map((opt) => {
                const isSelected = userChoice === opt.id;

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectOption(opt.id)}
                    className={`w-full p-3.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "border-[#0FA3A3] bg-[#0FA3A3]/10 text-[#0E2A47] font-bold"
                        : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <span className="leading-snug">{opt.optionText}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-[#0FA3A3] shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Explanation Box (shows immediately upon selecting an answer —
                explanation text is real backend content, unlike a fabricated
                correct/incorrect indicator). */}
            {userChoice && currentQ.explanation && (
              <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2 text-xs animate-fadeIn">
                <div className="flex items-center gap-2 text-[#0FA3A3] font-bold uppercase tracking-wider text-[10px]">
                  <HelpCircle className="w-4 h-4" /> Explanation & Clinical Pearl
                </div>
                <p className="text-slate-300 leading-relaxed font-normal">{currentQ.explanation}</p>
                <p className="text-slate-500 text-[10px] pt-1">
                  Sign up and unlock the full QBank to see instant correct/incorrect grading, references, and analytics.
                </p>
              </div>
            )}
          </div>

          {/* Runner Navigation Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
            >
              Previous
            </Button>

            {currentIdx < sampleQuestions.length - 1 ? (
              <Button
                size="sm"
                variant="teal"
                onClick={() => setCurrentIdx((prev) => Math.min(sampleQuestions.length - 1, prev + 1))}
              >
                Next Question
              </Button>
            ) : (
              <Button
                size="sm"
                variant="teal"
                onClick={() => setIsSubmitted(true)}
              >
                Finish Demo
              </Button>
            )}
          </div>

          {/* Final Demo Completion Card — no fabricated score, since the
              public endpoint never tells the client which options are
              correct. */}
          {isSubmitted && (
            <div className="p-6 bg-slate-900 text-white rounded-2xl space-y-4 text-center">
              <Badge variant="teal">Demo Completed!</Badge>
              <h3 className="text-xl font-extrabold text-white">
                You answered {answeredCount} / {sampleQuestions.length} sample questions
              </h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                Create a free account to unlock the complete 3,000+ question bank with instant grading, explanations, references, and full subject &amp; body system analytics.
              </p>
              <div className="flex flex-wrap gap-3 justify-center pt-2">
                <Button variant="teal" onClick={() => navigate("/register")}>
                  Create Free Account
                </Button>
                <Button variant="outline" onClick={() => navigate("/courses")} className="text-white border-white/40">
                  Explore Courses
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
