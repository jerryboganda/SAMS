import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Clock,
  Bookmark,
  Flag,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  HelpCircle,
  Sparkles,
  Info,
  Maximize2,
  RefreshCw,
  AlertTriangle,
  Play,
  FileQuestion,
  RotateCcw,
} from "lucide-react";
import { Card, Button, Badge, Modal } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { TestSession, TestAttemptQuestion } from "../../types";

type AutosaveState = "saved" | "saving" | "retrying" | "error";

interface QueueItem {
  questionId: number;
  optionId?: number;
  timeSpent: number;
  flagged?: boolean;
  retryCount: number;
}

export const TestSessionPage: React.FC = () => {
  const params = useParams<{ testId?: string; id?: string }>();
  const testIdParam = params.testId || params.id || "101";
  const navigate = useNavigate();

  // Primary State
  const [session, setSession] = useState<TestSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOptionId, setSelectedOptionId] = useState<number | undefined>(undefined);

  // Practice Mode Explanation State
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [explanationData, setExplanationData] = useState<{
    isCorrect?: boolean;
    correctOptionId?: number;
    explanation?: string;
    referenceText?: string;
  } | null>(null);

  // Timing
  const [timeRemaining, setTimeRemaining] = useState<number>(3600);
  const [showPauseTooltip, setShowPauseTooltip] = useState<boolean>(false);

  // Modals & Lightbox
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Palette Filter State
  const [paletteFilter, setPaletteFilter] = useState<"all" | "unanswered" | "flagged">("all");

  // Autosave & Retry Queue
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("saved");
  const saveQueueRef = useRef<QueueItem[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  // Auto-submit Toast Notice
  const [timeExpiredNotice, setTimeExpiredNotice] = useState(false);

  // Fetch Test Session Data
  useEffect(() => {
    async function initSession() {
      try {
        const data = await qbankApi.getTestSession(Number(testIdParam) || 101);
        setSession(data);
        if (data.timeRemainingSeconds !== undefined) {
          setTimeRemaining(data.timeRemainingSeconds);
        } else {
          setTimeRemaining(data.questionCount * 72);
        }

        // Initialize selected option if already answered
        if (data.questions && data.questions.length > 0) {
          const firstQ = data.questions[0];
          if (firstQ.selectedOptionId) {
            setSelectedOptionId(firstQ.selectedOptionId);
          }
        }
      } catch (err) {
        console.error("Failed to load test session:", err);
      }
    }
    initSession();
  }, [testIdParam]);

  // Update current selected option when index changes
  useEffect(() => {
    if (session && session.questions && session.questions[currentIndex]) {
      const currentQ = session.questions[currentIndex];
      setSelectedOptionId(currentQ.selectedOptionId);

      // In practice mode, if previously answered, reveal explanation
      if (session.mode === "practice" && currentQ.selectedOptionId) {
        const correctOpt = currentQ.question.options.find((o) => o.isCorrect);
        setExplanationData({
          isCorrect: currentQ.isCorrect,
          correctOptionId: correctOpt?.id,
          explanation: currentQ.question.explanation,
          referenceText: currentQ.question.referenceText,
        });
        setShowExplanation(true);
      } else {
        setShowExplanation(false);
        setExplanationData(null);
      }
    }
  }, [currentIndex, session]);

  // Countdown Timer Effect
  useEffect(() => {
    if (!session || session.status === "completed") return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmitOnExpiry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session]);

  // Handle Timer Expiry
  const handleAutoSubmitOnExpiry = async () => {
    setTimeExpiredNotice(true);
    setIsSubmitting(true);
    try {
      if (session) {
        await qbankApi.submitTest(session.id);
        setTimeout(() => {
          navigate(`/app/qbank/results/${session.id}`);
        }, 1200);
      }
    } catch (err) {
      console.error("Auto submit failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Queue Processor for Autosave & 5% Failure Retry Handling
  const processSaveQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || saveQueueRef.current.length === 0 || !session) {
      return;
    }

    isProcessingQueueRef.current = true;
    const currentTask = saveQueueRef.current[0];

    try {
      setAutosaveState(currentTask.retryCount > 0 ? "retrying" : "saving");

      const response = await qbankApi.answerQuestion(session.id, {
        questionId: currentTask.questionId,
        optionId: currentTask.optionId,
        timeSpent: currentTask.timeSpent,
        flagged: currentTask.flagged,
      });

      // Task succeeded: remove from queue
      saveQueueRef.current.shift();

      if (saveQueueRef.current.length === 0) {
        setAutosaveState("saved");
      }

      // If practice mode response includes explanation, store it
      if (session.mode === "practice" && response?.explanation) {
        setExplanationData(response);
        setShowExplanation(true);
      }
    } catch (err) {
      console.warn("Autosave failed (simulated 5% network glitch), queued for auto-retry:", err);
      currentTask.retryCount += 1;
      setAutosaveState("retrying");

      // Wait 1.2s before retrying
      await new Promise((res) => setTimeout(res, 1200));
    } finally {
      isProcessingQueueRef.current = false;
      if (saveQueueRef.current.length > 0) {
        processSaveQueue();
      }
    }
  }, [session]);

  // Queue an Answer or Flag Change for Autosave
  const queueAutosave = useCallback(
    (questionId: number, optionId?: number, timeSpent = 10, flagged?: boolean) => {
      saveQueueRef.current.push({
        questionId,
        optionId,
        timeSpent,
        flagged,
        retryCount: 0,
      });
      processSaveQueue();
    },
    [processSaveQueue]
  );

  // Handle Selecting an Option
  const handleSelectOption = (optionId: number) => {
    if (!session || !session.questions) return;

    // In practice mode, once answered, lock option choices
    if (session.mode === "practice" && showExplanation && selectedOptionId !== undefined) {
      return;
    }

    setSelectedOptionId(optionId);
    const currentItem = session.questions[currentIndex];
    currentItem.selectedOptionId = optionId;

    // Immediately trigger local calculation for practice mode
    if (session.mode === "practice") {
      const correctOpt = currentItem.question.options.find((o) => o.isCorrect);
      currentItem.isCorrect = correctOpt ? correctOpt.id === optionId : false;
    }

    setSession({ ...session });

    // Queue autosave API call
    queueAutosave(currentItem.question.id, optionId, 10, currentItem.isFlagged);
  };

  // Toggle Flag
  const handleToggleFlag = () => {
    if (!session || !session.questions) return;
    const currentItem = session.questions[currentIndex];
    currentItem.isFlagged = !currentItem.isFlagged;
    setSession({ ...session });

    queueAutosave(currentItem.question.id, currentItem.selectedOptionId, 5, currentItem.isFlagged);
  };

  // Toggle Bookmark
  const handleToggleBookmark = async () => {
    if (!session || !session.questions) return;
    const currentItem = session.questions[currentIndex];
    currentItem.question.isBookmarked = !currentItem.question.isBookmarked;
    setSession({ ...session });

    await qbankApi.toggleQuestionBookmark(currentItem.question.id);
  };

  // Submit Test Handler
  const handleSubmitTest = async () => {
    if (!session) return;
    setIsSubmitting(true);
    try {
      await qbankApi.submitTest(session.id);
      setIsConfirmSubmitOpen(false);
      navigate(`/app/qbank/results/${session.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to submit test.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard Navigation & Shortcuts Effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes if typing inside inputs or modal open
      if (
        isConfirmSubmitOpen ||
        lightboxImageUrl !== null ||
        ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        return;
      }

      if (!session || !session.questions || session.questions.length === 0) return;

      const currentItem = session.questions[currentIndex];

      // Option selection 1-5 (or A-E)
      if (["1", "2", "3", "4", "5"].includes(e.key)) {
        const optionIdx = parseInt(e.key, 10) - 1;
        if (currentItem.question.options[optionIdx]) {
          handleSelectOption(currentItem.question.options[optionIdx].id);
        }
      }

      // Flag toggle (Key 'F' or 'f')
      if (e.key === "f" || e.key === "F") {
        handleToggleFlag();
      }

      // Left Arrow (Previous)
      if (e.key === "ArrowLeft") {
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1);
        }
      }

      // Right Arrow (Next)
      if (e.key === "ArrowRight") {
        if (currentIndex < session.questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, session, isConfirmSubmitOpen, lightboxImageUrl, showExplanation, selectedOptionId]);

  if (!session || !session.questions || session.questions.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#0FA3A3] animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-500">Initializing Exam Session Engine...</p>
      </div>
    );
  }

  const currentItem: TestAttemptQuestion = session.questions[currentIndex];
  const question = currentItem.question;

  // Counts for Palette & Submit Modal
  const totalQuestions = session.questions.length;
  const answeredCount = session.questions.filter((q) => !!q.selectedOptionId).length;
  const unansweredCount = totalQuestions - answeredCount;
  const flaggedCount = session.questions.filter((q) => q.isFlagged).length;

  // Filtered Question Index list for Palette
  const filteredIndices = session.questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      if (paletteFilter === "unanswered") return !q.selectedOptionId;
      if (paletteFilter === "flagged") return q.isFlagged;
      return true;
    });

  // Time Formatting
  const hours = Math.floor(timeRemaining / 3600);
  const minutes = Math.floor((timeRemaining % 3600) / 60);
  const seconds = timeRemaining % 60;

  const formattedTime =
    hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Time Warning States
  const isAmberTime = timeRemaining <= 300 && timeRemaining > 60;
  const isRedTime = timeRemaining <= 60;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Time Expired Notice Toast */}
      {timeExpiredNotice && (
        <div className="p-4 bg-rose-600 text-white rounded-2xl flex items-center justify-between shadow-xl animate-bounce">
          <div className="flex items-center gap-2 font-black text-sm">
            <Clock className="w-5 h-5" />
            <span>Time Expired! Automatically submitting your test block...</span>
          </div>
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      )}

      {/* Top Bar Header */}
      <div className="bg-[#0E2A47] text-white p-4 sm:p-5 rounded-2xl shadow-md space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Test Info */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={session.mode === "practice" ? "teal" : "navy"} size="md" className="font-extrabold uppercase">
              {session.mode} Mode
            </Badge>

            <div className="space-y-0.5">
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                {session.examCategory} Test Block #{session.id}
              </h1>
              <span className="text-xs text-slate-300 font-medium">
                Question <strong className="text-white">{currentIndex + 1}</strong> of <strong className="text-white">{totalQuestions}</strong>
              </span>
            </div>
          </div>

          {/* Right Header Controls (Autosave + Timer + Submit) */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            {/* Autosave Status Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] font-bold">
              {autosaveState === "saved" && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-300">Saved</span>
                </>
              )}
              {autosaveState === "saving" && (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-[#0FA3A3] animate-spin" />
                  <span className="text-slate-300">Saving...</span>
                </>
              )}
              {autosaveState === "retrying" && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span className="text-amber-300">Retrying connection...</span>
                </>
              )}
            </div>

            {/* Countdown Timer with Tooltip */}
            <div className="relative group">
              <div
                className={`flex items-center gap-2 font-mono text-sm px-3 py-1.5 rounded-xl border transition-all select-none ${
                  isRedTime
                    ? "bg-rose-950 text-rose-300 border-rose-500 font-black animate-pulse shadow-lg"
                    : isAmberTime
                    ? "bg-amber-950 text-amber-300 border-amber-500 font-black animate-pulse"
                    : "bg-slate-800 text-[#0FA3A3] border-slate-700 font-bold"
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{formattedTime}</span>
                <button
                  type="button"
                  onClick={() => setShowPauseTooltip(!showPauseTooltip)}
                  className="text-slate-400 hover:text-white transition-colors ml-1"
                  title="Server timer information"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Server Timer Hover Popover */}
              <div className="absolute right-0 top-11 w-64 p-3 bg-slate-900 text-slate-200 text-[11px] rounded-xl shadow-2xl border border-slate-700 space-y-1 z-30 hidden group-hover:block pointer-events-none">
                <div className="font-bold text-[#0FA3A3] flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Server-Authoritative Timer
                </div>
                <p className="leading-relaxed">
                  Time limits are continuously synchronized with the backend. Closing or pausing your browser tab will not stop the official test timer.
                </p>
              </div>
            </div>

            {/* Submit Block Button */}
            <Button
              size="sm"
              variant="danger"
              onClick={() => setIsConfirmSubmitOpen(true)}
              className="font-extrabold shadow-sm"
            >
              End Block & Submit
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Vignette Card (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="p-6 border-slate-200 space-y-6 bg-white rounded-2xl shadow-sm relative overflow-hidden">
            {/* Flagged Top Corner Ribbon */}
            {currentItem.isFlagged && (
              <div className="absolute top-0 right-0 bg-amber-500 text-white font-black text-[10px] uppercase px-3 py-1 rounded-bl-xl shadow-xs flex items-center gap-1">
                <Flag className="w-3 h-3 fill-current" /> Flagged
              </div>
            )}

            {/* Question Header Metadata & Tools */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#0FA3A3]">
                  {question.subjectName} • {question.systemName}
                </span>
                <Badge variant={question.difficulty === "easy" ? "emerald" : question.difficulty === "hard" ? "danger" : "warning"} size="sm">
                  {question.difficulty.toUpperCase()}
                </Badge>
              </div>

              {/* Action Buttons: Flag & Bookmark */}
              <div className="flex items-center gap-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={handleToggleFlag}
                  className={`flex items-center gap-1.5 transition-colors ${
                    currentItem.isFlagged ? "text-amber-600 font-extrabold" : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  <Flag className={`w-4 h-4 ${currentItem.isFlagged ? "fill-amber-500" : ""}`} />
                  <span>{currentItem.isFlagged ? "Flagged" : "Flag"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleBookmark}
                  className={`flex items-center gap-1.5 transition-colors ${
                    question.isBookmarked ? "text-[#0FA3A3] font-extrabold" : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${question.isBookmarked ? "fill-[#0FA3A3]" : ""}`} />
                  <span>{question.isBookmarked ? "Saved" : "Save"}</span>
                </button>
              </div>
            </div>

            {/* Vignette Stem Text */}
            <div className="space-y-4">
              <p className="text-sm sm:text-base font-medium text-slate-800 leading-relaxed font-sans">
                {question.stem}
              </p>

              {/* Clinical Image Specimen Thumbnail */}
              {question.imageUrl && (
                <div className="relative group inline-block max-w-md">
                  <img
                    src={question.imageUrl}
                    alt="Clinical Specimen / ECG"
                    className="rounded-xl border border-slate-300 max-h-64 object-cover shadow-sm cursor-pointer hover:opacity-90 transition-all"
                    onClick={() => setLightboxImageUrl(question.imageUrl || null)}
                  />
                  <button
                    type="button"
                    onClick={() => setLightboxImageUrl(question.imageUrl || null)}
                    className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-all"
                  >
                    <Maximize2 className="w-3 h-3" /> Enlarge Specimen
                  </button>
                </div>
              )}
            </div>

            {/* Options List */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                Select Single Best Answer
              </span>

              {question.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelected = selectedOptionId === opt.id || currentItem.selectedOptionId === opt.id;
                const isCorrect = opt.isCorrect;
                const isPractice = session.mode === "practice" && showExplanation;

                let optClass = "border-slate-200 bg-white hover:border-[#0FA3A3] text-slate-700 hover:bg-slate-50";

                // Practice mode revealed state
                if (isPractice) {
                  if (isCorrect) {
                    optClass = "border-emerald-500 bg-emerald-50 text-emerald-900 font-extrabold shadow-xs";
                  } else if (isSelected && !isCorrect) {
                    optClass = "border-rose-500 bg-rose-50 text-rose-900 font-extrabold shadow-xs";
                  } else {
                    optClass = "border-slate-200 bg-slate-50 text-slate-400 opacity-60";
                  }
                } else if (isSelected) {
                  // Exam mode selected state
                  optClass = "border-[#0FA3A3] bg-[#0FA3A3]/10 font-black text-[#0E2A47] shadow-sm";
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectOption(opt.id)}
                    className={`w-full text-left p-4 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 transition-all ${optClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center shrink-0 border transition-all ${
                          isPractice && isCorrect
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : isPractice && isSelected && !isCorrect
                            ? "bg-rose-600 text-white border-rose-600"
                            : isSelected
                            ? "bg-[#0FA3A3] text-white border-[#0FA3A3]"
                            : "bg-slate-100 text-slate-600 border-slate-300"
                        }`}
                      >
                        {letter}
                      </div>

                      <span className="font-medium leading-snug">{opt.optionText}</span>
                    </div>

                    {/* Indicator Icon */}
                    {isPractice && isCorrect && <Check className="w-5 h-5 text-emerald-600 shrink-0" />}
                    {isPractice && isSelected && !isCorrect && <X className="w-5 h-5 text-rose-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* PRACTICE MODE: Inline Clinical Rationale Box */}
            {session.mode === "practice" && showExplanation && explanationData && (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-teal-50/20 border-2 border-[#0FA3A3]/30 space-y-3 mt-6 text-xs animate-fade-in shadow-xs">
                <div className="flex items-center justify-between border-b border-[#0FA3A3]/20 pb-2">
                  <div className="font-extrabold text-[#0E2A47] flex items-center gap-2 text-sm">
                    {explanationData.isCorrect ? (
                      <Badge variant="emerald" size="md" className="flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Correct Answer
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="md" className="flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" /> Incorrect
                      </Badge>
                    )}
                    <span>Clinical Explanation & Rationale</span>
                  </div>

                  <span className="text-[11px] font-bold text-[#0FA3A3]">
                    {question.subjectName} • {question.systemName}
                  </span>
                </div>

                <p className="text-slate-700 leading-relaxed text-xs font-normal">
                  {explanationData.explanation || question.explanation}
                </p>

                {(explanationData.referenceText || question.referenceText) && (
                  <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 italic">
                    <strong>Medical Reference:</strong> {explanationData.referenceText || question.referenceText}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Question Controls & Shortcuts Banner */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
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
                  disabled={currentIndex === totalQuestions - 1}
                  onClick={() => setCurrentIndex((prev) => prev + 1)}
                >
                  Next Question <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

              {/* Keyboard Shortcuts Hint Bar */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-500 font-semibold text-center flex flex-wrap items-center justify-center gap-3">
                <span>⚡ Shortcuts:</span>
                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">
                  [1 - 5] Select Option
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">
                  [← / →] Navigate
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">
                  [F] Flag
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Question Palette Drawer Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5 border-slate-200 space-y-4 bg-white rounded-2xl shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
                <FileQuestion className="w-4 h-4 text-[#0FA3A3]" /> Question Palette
              </h3>

              <Badge variant="navy" size="sm">
                {answeredCount}/{totalQuestions} Answered
              </Badge>
            </div>

            {/* Palette Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              {[
                { id: "all", label: `All (${totalQuestions})` },
                { id: "unanswered", label: `Unanswered (${unansweredCount})` },
                { id: "flagged", label: `Flagged (${flaggedCount})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPaletteFilter(f.id as any)}
                  className={`flex-1 py-1 text-center rounded-lg transition-colors ${
                    paletteFilter === f.id
                      ? "bg-[#0E2A47] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Question Palette Numbered Grid */}
            <div className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto p-1">
              {filteredIndices.map(({ q, idx }) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = !!q.selectedOptionId;
                const isFlagged = q.isFlagged;

                let btnClass = "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200";

                if (isAnswered) {
                  btnClass = "bg-[#0E2A47] text-white font-black border-[#0E2A47]";
                }

                if (isFlagged) {
                  btnClass += " ring-2 ring-amber-500 border-amber-500 font-extrabold";
                }

                if (isCurrent) {
                  btnClass += " border-2 border-[#0FA3A3] ring-2 ring-[#0FA3A3]/40 shadow-sm scale-105";
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
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Palette Summary Metrics */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 font-semibold text-slate-600">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0E2A47]" /> Answered
                </span>
                <span className="font-bold text-[#0E2A47]">{answeredCount}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Unanswered
                </span>
                <span className="font-bold text-slate-700">{unansweredCount}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Flagged
                </span>
                <span className="font-bold text-amber-600">{flaggedCount}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Submit Block Confirmation Modal */}
      <Modal
        isOpen={isConfirmSubmitOpen}
        onClose={() => setIsConfirmSubmitOpen(false)}
        title="Submit Test Block"
        size="md"
      >
        <div className="space-y-5 p-1 text-center">
          <div className="w-14 h-14 rounded-full bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center mx-auto border border-[#0FA3A3]/20">
            <Sparkles className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-[#0E2A47]">
              Ready to Submit Test Block #{session.id}?
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
              Submitting will lock your responses and generate your subject & system accuracy breakdown.
            </p>
          </div>

          {/* Unanswered / Flagged Breakdown Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 text-left">
            <div className="flex justify-between font-bold text-[#0E2A47]">
              <span>Total Questions:</span>
              <span>{totalQuestions}</span>
            </div>
            <div className="flex justify-between font-bold text-emerald-700">
              <span>Answered Questions:</span>
              <span>{answeredCount}</span>
            </div>
            <div className={`flex justify-between font-bold ${unansweredCount > 0 ? "text-rose-600" : "text-slate-600"}`}>
              <span>Unanswered Questions:</span>
              <span>{unansweredCount}</span>
            </div>
            <div className="flex justify-between font-bold text-amber-600">
              <span>Flagged for Review:</span>
              <span>{flaggedCount}</span>
            </div>

            {unansweredCount > 0 && (
              <div className="pt-2 border-t border-slate-200 text-[11px] text-rose-600 font-extrabold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>You have {unansweredCount} unanswered questions that will be marked as skipped.</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={() => setIsConfirmSubmitOpen(false)}
            >
              Go Back & Review
            </Button>

            <Button
              variant="teal"
              size="md"
              fullWidth
              isLoading={isSubmitting}
              onClick={handleSubmitTest}
            >
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Image Specimen Lightbox Modal */}
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
              alt="Enlarged Clinical Specimen"
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
