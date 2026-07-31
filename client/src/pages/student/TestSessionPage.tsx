import React, { useEffect, useState, useRef, useReducer } from "react";
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
  Sparkles,
  Info,
  Maximize2,
  RefreshCw,
  AlertTriangle,
  FileQuestion,
} from "lucide-react";
import { Card, Button, Badge, Modal, Skeleton, EmptyState } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { ApiError } from "../../api/client";
import { TestSession, TestAttemptQuestion } from "../../types";
import { formatDuration } from "../../utils/formatters";
import {
  TIMER_RESYNC_INTERVAL_MS,
  TIMER_TICK_INTERVAL_MS,
  computeDisplayRemainingSeconds,
  getTimerSeverity,
  mergeSessionTimerSync,
  computeElapsedSeconds,
  filterPaletteQuestions,
  computeSessionCounts,
  resolveKeyboardAction,
  resolveOptionVisualState,
  applyOptimisticAnswer,
  applyFlagUpdate,
  applyBookmarkUpdate,
  applyPracticeAnswerReveal,
  answerQueueReducer,
  initialAnswerQueueState,
  computeAnswerRetryDelayMs,
  PaletteFilter,
} from "../../components/qbank/testRunnerLogic";

type LoadState = "loading" | "error" | "data";

export const TestSessionPage: React.FC = () => {
  const params = useParams<{ testId?: string; id?: string }>();
  const testIdParam = params.testId || params.id || "";
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");
  const [session, setSession] = useState<TestSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Server-authoritative timer resync (docs/07_EXECUTION_PLAN.md 7.5 — never a client-only countdown).
  const [serverRemainingAtSync, setServerRemainingAtSync] = useState<number | null>(null);
  const [syncedAtMs, setSyncedAtMs] = useState<number>(Date.now());
  const [displayRemaining, setDisplayRemaining] = useState<number>(0);
  const autoFinalizeTriggeredRef = useRef(false);

  // Modals & Lightbox
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Palette Filter State
  const [paletteFilter, setPaletteFilter] = useState<PaletteFilter>("all");

  // Autosave retry-queue reducer (docs/07_EXECUTION_PLAN.md 7.5's explicit "vitest runner reducer" AC).
  const [queueState, dispatchQueue] = useReducer(answerQueueReducer, initialAnswerQueueState);
  const isProcessingRef = useRef(false);
  const lastCheckpointRef = useRef<number>(Date.now());

  const [terminalNotice, setTerminalNotice] = useState<string | null>(null);

  const sessionId = session?.id;
  const sessionMode = session?.mode;
  const sessionStatus = session?.status;
  const sessionTimeLimit = session?.timeLimitSeconds;

  // --- Load / reload the session --------------------------------------------

  const loadSession = async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const data = await qbankApi.getTestSession(Number(testIdParam));
      if (data.status !== "in_progress") {
        // Already completed/abandoned (e.g. a stale link, or a resync elsewhere already finalized it) —
        // the runner has nothing to do here; the results page is the correct destination.
        navigate(`/app/qbank/results/${data.id}`, { replace: true });
        return;
      }
      setSession(data);
      setCurrentIndex(0);
      lastCheckpointRef.current = Date.now();
      autoFinalizeTriggeredRef.current = false;
      if (data.timeLimitSeconds) {
        setServerRemainingAtSync(data.timeRemainingSeconds ?? 0);
        setSyncedAtMs(Date.now());
        setDisplayRemaining(data.timeRemainingSeconds ?? 0);
      } else {
        setServerRemainingAtSync(null);
      }
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load test session:", err);
      setLoadErrorMsg(err?.message || "Failed to load your test session.");
      setLoadState("error");
    }
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testIdParam]);

  // Reset per-question elapsed-time checkpoint whenever the question changes.
  useEffect(() => {
    lastCheckpointRef.current = Date.now();
  }, [currentIndex]);

  // --- Local 1s ticker between server resyncs --------------------------------

  useEffect(() => {
    if (sessionStatus !== "in_progress" || serverRemainingAtSync == null) return;
    const tick = () => {
      const remaining = computeDisplayRemainingSeconds(serverRemainingAtSync, syncedAtMs, Date.now());
      setDisplayRemaining(remaining);
      if (remaining <= 0 && !autoFinalizeTriggeredRef.current && sessionId) {
        autoFinalizeTriggeredRef.current = true;
        setTerminalNotice("Time expired! Automatically submitting your test block...");
        qbankApi
          .submitTest(sessionId) // idempotent server-side — safe even if a resync already finalized it
          .catch((err) => console.error("Auto-submit-on-expiry failed:", err))
          .finally(() => setTimeout(() => navigate(`/app/qbank/results/${sessionId}`), 1200));
      }
    };
    tick();
    const id = setInterval(tick, TIMER_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sessionStatus, serverRemainingAtSync, syncedAtMs, sessionId, navigate]);

  // --- Periodic server resync (corrects drift; catches a server-side auto-finalize with no answer call) --

  useEffect(() => {
    if (sessionStatus !== "in_progress" || !sessionTimeLimit || !sessionId) return;
    const id = setInterval(async () => {
      try {
        const fresh = await qbankApi.getTestSession(sessionId);
        setSyncedAtMs(Date.now());
        setServerRemainingAtSync(fresh.timeRemainingSeconds ?? 0);
        setSession((prev) => (prev ? mergeSessionTimerSync(prev, fresh) : prev));
        if (fresh.status !== "in_progress" && !autoFinalizeTriggeredRef.current) {
          autoFinalizeTriggeredRef.current = true;
          setTerminalNotice("Time expired! Your test block was automatically submitted.");
          setTimeout(() => navigate(`/app/qbank/results/${sessionId}`), 1200);
        }
      } catch (err) {
        console.warn("Timer resync failed (will retry next interval):", err);
      }
    }, TIMER_RESYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sessionStatus, sessionTimeLimit, sessionId, navigate]);

  // --- Autosave retry-queue processor -----------------------------------------

  useEffect(() => {
    if (!sessionId) return;

    if (queueState.status === "expired") {
      if (!autoFinalizeTriggeredRef.current) {
        autoFinalizeTriggeredRef.current = true;
        setTerminalNotice(
          queueState.lastError?.code === "TEST_EXPIRED"
            ? "Time expired! Your test block was automatically submitted."
            : "This test is no longer in progress."
        );
        setTimeout(() => navigate(`/app/qbank/results/${sessionId}`), 1200);
      }
      return;
    }

    if (queueState.queue.length === 0 || isProcessingRef.current) return;

    const head = queueState.queue[0];
    const delayMs = head.retryCount > 0 ? computeAnswerRetryDelayMs(head.retryCount) : 0;

    const timeoutId = setTimeout(async () => {
      isProcessingRef.current = true;
      try {
        const response = await qbankApi.answerQuestion(sessionId, {
          questionId: head.questionId,
          optionId: head.optionId,
          timeSpent: head.timeSpent,
          flagged: head.flagged,
        });
        dispatchQueue({ type: "ATTEMPT_SUCCESS" });
        if (sessionMode === "practice" && response && response.isCorrect !== undefined) {
          setSession((prev) => (prev ? applyPracticeAnswerReveal(prev, head.questionId, response) : prev));
        }
      } catch (err: any) {
        const apiErr = err as ApiError;
        dispatchQueue({
          type: "ATTEMPT_FAILURE",
          error: { status: apiErr.status, code: apiErr.code, message: apiErr.message },
        });
      } finally {
        isProcessingRef.current = false;
      }
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [queueState, sessionId, sessionMode, navigate]);

  // --- Answer / flag / bookmark actions ---------------------------------------

  const handleSelectOption = (optionId: number) => {
    if (!session || !session.questions || session.status !== "in_progress" || queueState.status === "expired") return;
    const currentItem = session.questions[currentIndex];
    // Practice mode: once this question's answer has been revealed, lock further changes.
    if (session.mode === "practice" && currentItem.isCorrect !== undefined) return;

    setSession((prev) => (prev ? applyOptimisticAnswer(prev, currentItem.questionId, optionId) : prev));
    const elapsed = computeElapsedSeconds(Date.now(), lastCheckpointRef.current);
    lastCheckpointRef.current = Date.now();
    dispatchQueue({
      type: "ENQUEUE",
      payload: { questionId: currentItem.questionId, optionId, timeSpent: elapsed, flagged: currentItem.isFlagged },
    });
  };

  const handleToggleFlag = () => {
    if (!session || !session.questions || session.status !== "in_progress" || queueState.status === "expired") return;
    const currentItem = session.questions[currentIndex];
    const nextFlagged = !currentItem.isFlagged;
    setSession((prev) => (prev ? applyFlagUpdate(prev, currentItem.questionId, nextFlagged) : prev));
    const elapsed = computeElapsedSeconds(Date.now(), lastCheckpointRef.current);
    lastCheckpointRef.current = Date.now();
    dispatchQueue({
      type: "ENQUEUE",
      payload: {
        questionId: currentItem.questionId,
        optionId: currentItem.selectedOptionId ?? null,
        timeSpent: elapsed,
        flagged: nextFlagged,
      },
    });
  };

  const handleToggleBookmark = async () => {
    if (!session || !session.questions) return;
    const currentItem = session.questions[currentIndex];
    const next = !currentItem.question.isBookmarked;
    setSession((prev) => (prev ? applyBookmarkUpdate(prev, currentItem.questionId, next) : prev));
    try {
      await qbankApi.setQuestionBookmark(currentItem.questionId, next);
    } catch (err) {
      console.error("Failed to update bookmark:", err);
      setSession((prev) => (prev ? applyBookmarkUpdate(prev, currentItem.questionId, !next) : prev)); // revert
    }
  };

  const handleSubmitTest = async () => {
    if (!session) return;
    setIsSubmitting(true);
    setSubmitErrorMsg(null);
    try {
      await qbankApi.submitTest(session.id);
      setIsConfirmSubmitOpen(false);
      navigate(`/app/qbank/results/${session.id}`);
    } catch (err: any) {
      setSubmitErrorMsg(err?.message || "Failed to submit test.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Keyboard shortcuts -------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        isConfirmSubmitOpen ||
        lightboxImageUrl !== null ||
        ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        return;
      }
      if (!session || !session.questions || session.questions.length === 0) return;

      const currentItem = session.questions[currentIndex];
      const action = resolveKeyboardAction(
        e.key,
        currentItem.question.options.length,
        currentIndex > 0,
        currentIndex < session.questions.length - 1
      );
      if (!action) return;

      if (action.type === "selectOption") {
        const opt = currentItem.question.options[action.optionIndex];
        if (opt) handleSelectOption(opt.id);
      } else if (action.type === "toggleFlag") {
        handleToggleFlag();
      } else if (action.type === "previous") {
        setCurrentIndex((prev) => prev - 1);
      } else if (action.type === "next") {
        setCurrentIndex((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, session, isConfirmSubmitOpen, lightboxImageUrl, queueState.status]);

  // --- Loading / error / empty states -------------------------------------------

  if (loadState === "loading") {
    return (
      <div className="space-y-6 pb-12 max-w-7xl mx-auto">
        <Skeleton variant="card" className="h-24 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton variant="card" className="h-96 rounded-2xl lg:col-span-8" />
          <Skeleton variant="card" className="h-96 rounded-2xl lg:col-span-4" />
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<AlertCircle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load your test session"
          description={loadErrorMsg}
          actionLabel="Retry"
          onAction={loadSession}
        />
      </div>
    );
  }

  if (!session || !session.questions || session.questions.length === 0) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<FileQuestion className="w-10 h-10 text-slate-400" />}
          title="No questions in this test block"
          description="This test session has no questions to display."
        />
      </div>
    );
  }

  const currentItem: TestAttemptQuestion = session.questions[currentIndex];
  const question = currentItem.question;
  const revealAnswers = session.mode === "practice" && currentItem.isCorrect !== undefined;

  const { totalCount: totalQuestions, answeredCount, unansweredCount, flaggedCount } = computeSessionCounts(
    session.questions
  );
  const filteredIndices = filterPaletteQuestions(session.questions, paletteFilter);

  const isAmberTime = serverRemainingAtSync != null && getTimerSeverity(displayRemaining) === "amber";
  const isRedTime = serverRemainingAtSync != null && getTimerSeverity(displayRemaining) === "red";
  const formattedTime = serverRemainingAtSync != null ? formatDuration(displayRemaining) : null;

  const autosaveLabel =
    queueState.status === "saving"
      ? "Saving..."
      : queueState.status === "retrying"
      ? "Retrying connection..."
      : "Saved";

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Time Expired / Terminal Notice Toast */}
      {terminalNotice && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 bg-rose-600 text-white rounded-2xl flex items-center justify-between shadow-xl"
        >
          <div className="flex items-center gap-2 font-black text-sm">
            <Clock className="w-5 h-5" />
            <span>{terminalNotice}</span>
          </div>
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      )}

      {submitErrorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitErrorMsg}</span>
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
                Question <strong className="text-white">{currentIndex + 1}</strong> of{" "}
                <strong className="text-white">{totalQuestions}</strong>
              </span>
            </div>
          </div>

          {/* Right Header Controls (Autosave + Timer + Submit) */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            {/* Autosave Status Pill */}
            <div
              aria-live="polite"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] font-bold"
            >
              {queueState.status === "saving" && <RefreshCw className="w-3.5 h-3.5 text-[#0FA3A3] animate-spin" />}
              {queueState.status === "retrying" && <AlertCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />}
              {(queueState.status === "idle" || queueState.status === "expired") && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className={queueState.status === "retrying" ? "text-amber-300" : "text-slate-300"}>
                {autosaveLabel}
              </span>
            </div>

            {/* Countdown Timer */}
            {formattedTime !== null ? (
              <div className="relative group">
                <div
                  aria-label={`Time remaining: ${formattedTime}`}
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
                  <span title="Server-authoritative timer">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                </div>

                <div className="absolute right-0 top-11 w-64 p-3 bg-slate-900 text-slate-200 text-[11px] rounded-xl shadow-2xl border border-slate-700 space-y-1 z-30 hidden group-hover:block pointer-events-none">
                  <div className="font-bold text-[#0FA3A3] flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Server-Authoritative Timer
                  </div>
                  <p className="leading-relaxed">
                    Time limits are continuously synchronized with the backend. Closing or pausing your browser tab
                    will not stop the official test timer.
                  </p>
                </div>
              </div>
            ) : (
              <Badge variant="neutral" size="md">
                Untimed
              </Badge>
            )}

            {/* Submit Block Button */}
            <Button size="sm" variant="danger" onClick={() => setIsConfirmSubmitOpen(true)} className="font-extrabold shadow-sm">
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
                <Badge
                  variant={question.difficulty === "easy" ? "emerald" : question.difficulty === "hard" ? "danger" : "warning"}
                  size="sm"
                >
                  {question.difficulty.toUpperCase()}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={handleToggleFlag}
                  aria-pressed={currentItem.isFlagged}
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
                  aria-pressed={!!question.isBookmarked}
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
              <p className="text-sm sm:text-base font-medium text-slate-800 leading-relaxed font-sans">{question.stem}</p>

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
                    aria-label="Enlarge clinical specimen image"
                    className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-all"
                  >
                    <Maximize2 className="w-3 h-3" /> Enlarge Specimen
                  </button>
                </div>
              )}
            </div>

            {/* Options List */}
            <div className="space-y-3 pt-2" role="radiogroup" aria-label="Answer options">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                Select Single Best Answer
              </span>

              {question.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelected = currentItem.selectedOptionId === opt.id;
                const visualState = resolveOptionVisualState({ isSelected, isCorrect: opt.isCorrect, revealAnswers });

                const optClassMap: Record<string, string> = {
                  correct: "border-emerald-500 bg-emerald-50 text-emerald-900 font-extrabold shadow-xs",
                  incorrectSelected: "border-rose-500 bg-rose-50 text-rose-900 font-extrabold shadow-xs",
                  dimmed: "border-slate-200 bg-slate-50 text-slate-400 opacity-60",
                  selected: "border-[#0FA3A3] bg-[#0FA3A3]/10 font-black text-[#0E2A47] shadow-sm",
                  default: "border-slate-200 bg-white hover:border-[#0FA3A3] text-slate-700 hover:bg-slate-50",
                };
                const badgeClassMap: Record<string, string> = {
                  correct: "bg-emerald-600 text-white border-emerald-600",
                  incorrectSelected: "bg-rose-600 text-white border-rose-600",
                  dimmed: "bg-slate-100 text-slate-600 border-slate-300",
                  selected: "bg-[#0FA3A3] text-white border-[#0FA3A3]",
                  default: "bg-slate-100 text-slate-600 border-slate-300",
                };

                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectOption(opt.id)}
                    disabled={revealAnswers && session.mode === "practice"}
                    className={`w-full text-left p-4 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 transition-all ${optClassMap[visualState]}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center shrink-0 border transition-all ${badgeClassMap[visualState]}`}
                      >
                        {letter}
                      </div>
                      <span className="font-medium leading-snug">{opt.optionText}</span>
                    </div>

                    {visualState === "correct" && <Check className="w-5 h-5 text-emerald-600 shrink-0" />}
                    {visualState === "incorrectSelected" && <X className="w-5 h-5 text-rose-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* PRACTICE MODE: Inline Clinical Rationale Box */}
            {revealAnswers && (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-teal-50/20 border-2 border-[#0FA3A3]/30 space-y-3 mt-6 text-xs animate-fade-in shadow-xs">
                <div className="flex items-center justify-between border-b border-[#0FA3A3]/20 pb-2">
                  <div className="font-extrabold text-[#0E2A47] flex items-center gap-2 text-sm">
                    {currentItem.isCorrect ? (
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

                <p className="text-slate-700 leading-relaxed text-xs font-normal">{question.explanation || "No explanation provided."}</p>

                {question.referenceText && (
                  <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 italic">
                    <strong>Medical Reference:</strong> {question.referenceText}
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

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-500 font-semibold text-center flex flex-wrap items-center justify-center gap-3">
                <span>⚡ Shortcuts:</span>
                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">
                  [1 - {question.options.length}] Select Option
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

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              {(
                [
                  { id: "all", label: `All (${totalQuestions})` },
                  { id: "unanswered", label: `Unanswered (${unansweredCount})` },
                  { id: "flagged", label: `Flagged (${flaggedCount})` },
                ] as { id: PaletteFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPaletteFilter(f.id)}
                  className={`flex-1 py-1 text-center rounded-lg transition-colors ${
                    paletteFilter === f.id ? "bg-[#0E2A47] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto p-1">
              {filteredIndices.map(({ q, idx }) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = !!q.selectedOptionId;
                const isFlagged = q.isFlagged;

                let btnClass = "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200";
                if (isAnswered) btnClass = "bg-[#0E2A47] text-white font-black border-[#0E2A47]";
                if (isFlagged) btnClass += " ring-2 ring-amber-500 border-amber-500 font-extrabold";
                if (isCurrent) btnClass += " border-2 border-[#0FA3A3] ring-2 ring-[#0FA3A3]/40 shadow-sm scale-105";

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    aria-current={isCurrent}
                    aria-label={`Question ${idx + 1}${isAnswered ? ", answered" : ", unanswered"}${isFlagged ? ", flagged" : ""}`}
                    className={`h-9 rounded-xl text-xs font-mono transition-all relative flex items-center justify-center border ${btnClass}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlagged && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400" />}
                  </button>
                );
              })}
            </div>

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
      <Modal isOpen={isConfirmSubmitOpen} onClose={() => setIsConfirmSubmitOpen(false)} title="Submit Test Block" size="md">
        <div className="space-y-5 p-1 text-center">
          <div className="w-14 h-14 rounded-full bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center mx-auto border border-[#0FA3A3]/20">
            <Sparkles className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-[#0E2A47]">Ready to Submit Test Block #{session.id}?</h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
              Submitting will lock your responses and generate your subject & system accuracy breakdown.
            </p>
          </div>

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
            <Button variant="outline" size="md" fullWidth onClick={() => setIsConfirmSubmitOpen(false)}>
              Go Back & Review
            </Button>
            <Button variant="teal" size="md" fullWidth isLoading={isSubmitting} onClick={handleSubmitTest}>
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Image Specimen Lightbox Modal */}
      <Modal isOpen={lightboxImageUrl !== null} onClose={() => setLightboxImageUrl(null)} title="Clinical Specimen Inspector" size="lg">
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
