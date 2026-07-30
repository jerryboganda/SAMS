import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Flag,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Check,
  X,
  FileQuestion,
  Info,
  Maximize2,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { Card, Button, Badge, Modal } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { TestSession, TestAttemptQuestion } from "../../types";

type ReviewFilter = "all" | "incorrect" | "flagged" | "correct";

export const TestReviewPage: React.FC = () => {
  const params = useParams<{ testId?: string; id?: string }>();
  const testIdParam = params.testId || params.id || "101";
  const navigate = useNavigate();

  const [session, setSession] = useState<TestSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [filterTab, setFilterTab] = useState<ReviewFilter>("all");

  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [guardErrorNotice, setGuardErrorNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch test session for review
  useEffect(() => {
    async function initReview() {
      setIsLoading(true);
      try {
        const data = await qbankApi.getTestSession(Number(testIdParam) || 101);

        // REVIEW GUARD: Block review route if test isn't completed
        if (data.status === "in_progress") {
          setGuardErrorNotice("Test block must be completed before reviewing answers.");
          setTimeout(() => {
            navigate(`/app/qbank/session/${data.id}`, { replace: true });
          }, 1800);
          return;
        }

        setSession(data);
      } catch (err) {
        console.error("Failed to load test review session:", err);
      } finally {
        setIsLoading(false);
      }
    }
    initReview();
  }, [testIdParam, navigate]);

  // Toggle Bookmark
  const handleToggleBookmark = async () => {
    if (!session || !session.questions) return;
    const currentItem = session.questions[currentIndex];
    currentItem.question.isBookmarked = !currentItem.question.isBookmarked;
    setSession({ ...session });

    await qbankApi.toggleQuestionBookmark(currentItem.question.id);
  };

  // Keyboard Navigation Effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!session || !session.questions || session.questions.length === 0) return;

      if (e.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
      if (e.key === "ArrowRight" && currentIndex < session.questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, session]);

  if (guardErrorNotice) {
    return (
      <div className="py-20 max-w-md mx-auto text-center space-y-4">
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-bold flex items-center justify-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{guardErrorNotice}</span>
        </div>
        <p className="text-xs text-slate-500">Redirecting to active test runner session...</p>
      </div>
    );
  }

  if (isLoading || !session || !session.questions || session.questions.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-500">Loading Test Review Session...</p>
      </div>
    );
  }

  const allQuestions = session.questions;

  // Filtered Questions list based on selected tab
  const filteredIndexedQuestions = allQuestions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      if (filterTab === "incorrect") return q.selectedOptionId && !q.isCorrect;
      if (filterTab === "flagged") return q.isFlagged;
      if (filterTab === "correct") return q.isCorrect;
      return true; // 'all'
    });

  const currentItem: TestAttemptQuestion = allQuestions[currentIndex];
  const question = currentItem.question;

  // Answer state determination
  const selectedOptionId = currentItem.selectedOptionId;
  const isSkipped = !selectedOptionId;
  const isCorrect = currentItem.isCorrect;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="bg-[#0E2A47] text-white p-4 sm:p-5 rounded-2xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={`/app/qbank/test/${session.id}/results`}>
            <Button variant="outline" size="sm" className="border-slate-600 text-slate-200 hover:bg-slate-800">
              <ArrowLeft className="w-4 h-4 mr-1" /> Results
            </Button>
          </Link>

          <div>
            <h1 className="text-base font-black text-white flex items-center gap-2">
              Review Test Block #{session.id}
            </h1>
            <span className="text-xs text-slate-300 font-medium">
              Question <strong className="text-white">{currentIndex + 1}</strong> of <strong className="text-white">{allQuestions.length}</strong>
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl text-xs font-bold border border-slate-700">
          {[
            { id: "all", label: `All (${allQuestions.length})` },
            { id: "incorrect", label: `Incorrect (${session.incorrectCount})` },
            { id: "flagged", label: `Flagged (${allQuestions.filter((q) => q.isFlagged).length})` },
            { id: "correct", label: `Correct (${session.correctCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id as ReviewFilter)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filterTab === tab.id
                  ? "bg-[#0FA3A3] text-white shadow-xs"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Question Card (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="p-6 border-slate-200 space-y-6 bg-white rounded-2xl shadow-sm relative overflow-hidden">
            {/* Answer Result Banner Badge */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {isSkipped ? (
                  <Badge variant="navy" size="md" className="flex items-center gap-1 font-black">
                    <HelpCircle className="w-3.5 h-3.5" /> SKIPPED / UNANSWERED
                  </Badge>
                ) : isCorrect ? (
                  <Badge variant="emerald" size="md" className="flex items-center gap-1 font-black">
                    <CheckCircle2 className="w-3.5 h-3.5" /> CORRECT ANSWER
                  </Badge>
                ) : (
                  <Badge variant="danger" size="md" className="flex items-center gap-1 font-black">
                    <XCircle className="w-3.5 h-3.5" /> INCORRECT ANSWER
                  </Badge>
                )}

                <span className="text-xs font-black text-[#0FA3A3]">
                  {question.subjectName} • {question.systemName}
                </span>
              </div>

              {/* Bookmark Action */}
              <button
                type="button"
                onClick={handleToggleBookmark}
                className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
                  question.isBookmarked ? "text-[#0FA3A3]" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                <Bookmark className={`w-4 h-4 ${question.isBookmarked ? "fill-[#0FA3A3]" : ""}`} />
                <span>{question.isBookmarked ? "Bookmarked" : "Save Vignette"}</span>
              </button>
            </div>

            {/* Stem Text */}
            <div className="space-y-4">
              <p className="text-sm sm:text-base font-medium text-slate-800 leading-relaxed font-sans">
                {question.stem}
              </p>

              {/* Specimen Image Lightbox Thumbnail */}
              {question.imageUrl && (
                <div className="relative group inline-block max-w-md">
                  <img
                    src={question.imageUrl}
                    alt="Clinical Specimen"
                    className="rounded-xl border border-slate-300 max-h-64 object-cover shadow-sm cursor-pointer hover:opacity-90"
                    onClick={() => setLightboxImageUrl(question.imageUrl || null)}
                  />
                  <button
                    type="button"
                    onClick={() => setLightboxImageUrl(question.imageUrl || null)}
                    className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1"
                  >
                    <Maximize2 className="w-3 h-3" /> Enlarge
                  </button>
                </div>
              )}
            </div>

            {/* Options List with Review Highlighting */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                Option Comparison
              </span>

              {question.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isCorrectOpt = opt.isCorrect;
                const isSelectedOpt = selectedOptionId === opt.id;

                let optClass = "border-slate-200 bg-slate-50 text-slate-500 opacity-70";

                if (isCorrectOpt) {
                  optClass = "border-emerald-500 bg-emerald-50 text-emerald-900 font-extrabold shadow-xs";
                } else if (isSelectedOpt && !isCorrectOpt) {
                  optClass = "border-rose-500 bg-rose-50 text-rose-900 font-extrabold shadow-xs";
                }

                return (
                  <div
                    key={opt.id}
                    className={`w-full text-left p-4 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 transition-all ${optClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center shrink-0 border ${
                          isCorrectOpt
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : isSelectedOpt && !isCorrectOpt
                            ? "bg-rose-600 text-white border-rose-600"
                            : "bg-slate-200 text-slate-600 border-slate-300"
                        }`}
                      >
                        {letter}
                      </div>

                      <span className="font-medium leading-snug">{opt.optionText}</span>
                    </div>

                    {isCorrectOpt && (
                      <div className="flex items-center gap-1 text-emerald-700 font-black text-xs shrink-0">
                        <Check className="w-4 h-4 text-emerald-600" /> Correct Choice
                      </div>
                    )}
                    {isSelectedOpt && !isCorrectOpt && (
                      <div className="flex items-center gap-1 text-rose-700 font-black text-xs shrink-0">
                        <X className="w-4 h-4 text-rose-600" /> Your Choice
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Clinical Rationale Box */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-teal-50/20 border-2 border-[#0FA3A3]/30 space-y-3 mt-6 text-xs shadow-xs">
              <div className="font-extrabold text-[#0E2A47] text-sm border-b border-[#0FA3A3]/20 pb-2">
                Detailed Clinical Rationale & Explanation
              </div>

              <p className="text-slate-700 leading-relaxed text-xs font-normal">
                {question.explanation}
              </p>

              {question.referenceText && (
                <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 italic">
                  <strong>Medical Reference:</strong> {question.referenceText}
                </div>
              )}
            </div>

            {/* Question Navigation */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <Button
                variant="outline"
                size="md"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => prev - 1)}
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                Previous Question
              </Button>

              <Button
                variant="teal"
                size="md"
                disabled={currentIndex === allQuestions.length - 1}
                onClick={() => setCurrentIndex((prev) => prev + 1)}
              >
                Next Question <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Palette Review Grid (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5 border-slate-200 space-y-4 bg-white rounded-2xl shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
                <FileQuestion className="w-4 h-4 text-[#0FA3A3]" /> Question Review Palette
              </h3>
            </div>

            {/* Color Legend */}
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] space-y-1 font-semibold text-slate-600">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-600" /> Correct ({session.correctCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-rose-600" /> Incorrect ({session.incorrectCount})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-300" /> Skipped ({session.skippedCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-400" /> Flagged
                </span>
              </div>
            </div>

            {/* Question Palette Numbered Grid */}
            <div className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto p-1">
              {filteredIndexedQuestions.map(({ q, idx }) => {
                const isCurrent = idx === currentIndex;
                const isAns = !!q.selectedOptionId;
                const isCorr = q.isCorrect;
                const isFlagged = q.isFlagged;

                let btnClass = "bg-slate-200 text-slate-600 border-slate-300";

                if (isAns && isCorr) {
                  btnClass = "bg-emerald-600 text-white font-black border-emerald-600";
                } else if (isAns && !isCorr) {
                  btnClass = "bg-rose-600 text-white font-black border-rose-600";
                }

                if (isFlagged) {
                  btnClass += " ring-2 ring-amber-400";
                }

                if (isCurrent) {
                  btnClass += " ring-2 ring-[#0FA3A3] scale-105 border-2 border-white shadow-md";
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl text-xs font-mono transition-all relative flex items-center justify-center border ${btnClass}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlagged && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-300" />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Image Lightbox Modal */}
      <Modal
        isOpen={lightboxImageUrl !== null}
        onClose={() => setLightboxImageUrl(null)}
        title="Clinical Specimen Inspector"
        size="lg"
      >
        <div className="space-y-4 p-2 text-center">
          {lightboxImageUrl && (
            <img
              src={lightboxImageUrl}
              alt="Enlarged Specimen"
              className="max-h-[70vh] max-w-full mx-auto rounded-xl border border-slate-200 object-contain shadow-lg"
            />
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setLightboxImageUrl(null)}>
              Close Specimen Inspector
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
