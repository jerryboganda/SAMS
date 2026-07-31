// client/src/components/qbank/testRunnerLogic.ts
//
// Pure, side-effect-free logic extracted out of TestSessionPage.tsx (and
// shared with TestReviewPage.tsx's option highlighting) so it can be unit
// tested without mounting a component, faking timers, or mocking the network
// (see testRunnerLogic.test.ts). Mirrors the established
// client/src/components/player/playerLogic.ts pattern
// (docs/07_EXECUTION_PLAN.md 5.4's "vitest logic" precedent) — reused here to
// satisfy 7.5's explicit "vitest runner reducer" AC.
//
// Every function here is deterministic given its inputs. TestSessionPage.tsx
// owns all the actual scheduling (setInterval/setTimeout) and network side
// effects; this module only computes state transitions / derived values from
// plain data, including the real backend contract's answer-secrecy shape
// (server/src/services/qbankService.js's serializeQuestionOption /
// serializeAttemptQuestion — `isCorrect` is genuinely ABSENT, i.e.
// `undefined`, not `null`/`false`, for a not-yet-revealed question).

import { TestAttemptQuestion, TestSession } from "../../types";

// ---------------------------------------------------------------------------
// Server-authoritative timer resync
// ---------------------------------------------------------------------------

/**
 * How often the runner re-fetches GET /qbank/tests/:id purely to resync the
 * countdown against the server's own authoritative `timeRemainingSeconds`
 * (computeRemainingSeconds in qbankService.js) — and to notice a server-side
 * lazy auto-finalize that happened with no answer call in between (e.g. the
 * student left the tab idle past the deadline). The local 1-second ticker
 * between resyncs is purely cosmetic; this interval is what keeps the
 * displayed time from drifting into "counting down from a client-only start
 * timestamp" territory.
 */
export const TIMER_RESYNC_INTERVAL_MS = 20_000;
export const TIMER_TICK_INTERVAL_MS = 1_000;

export type TimerSeverity = "normal" | "amber" | "red";

/**
 * Local countdown display value between resyncs: the last server-reported
 * `timeRemainingSeconds` at the moment it was captured (`syncedAtMs`), ticked
 * down locally — never allowed below 0, and never allowed to run past what
 * the server said without a fresh sync correcting it.
 */
export function computeDisplayRemainingSeconds(
  serverRemainingAtSyncSeconds: number,
  syncedAtMs: number,
  nowMs: number
): number {
  if (!Number.isFinite(serverRemainingAtSyncSeconds)) return 0;
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000));
  return Math.max(0, serverRemainingAtSyncSeconds - elapsedSeconds);
}

export function getTimerSeverity(remainingSeconds: number): TimerSeverity {
  if (remainingSeconds <= 60) return "red";
  if (remainingSeconds <= 300) return "amber";
  return "normal";
}

/**
 * Merges a fresh GET /qbank/tests/:id resync response into the locally-held
 * session — deliberately only the timer/status/score fields, NOT
 * `questions`. A wholesale `questions` overwrite mid-session would clobber an
 * in-flight optimistic local answer/flag edit that hasn't round-tripped yet
 * (see applyOptimisticAnswer/applyFlagUpdate below), causing visible
 * flicker/regression for no benefit — the periodic resync only needs to (a)
 * correct timer drift and (b) notice the session flipped out of
 * `in_progress` server-side.
 */
export function mergeSessionTimerSync(local: TestSession, fresh: TestSession): TestSession {
  return {
    ...local,
    status: fresh.status,
    completedAt: fresh.completedAt,
    timeRemainingSeconds: fresh.timeRemainingSeconds,
    correctCount: fresh.correctCount,
    incorrectCount: fresh.incorrectCount,
    skippedCount: fresh.skippedCount,
    scorePercent: fresh.scorePercent,
    passed: fresh.passed,
  };
}

// ---------------------------------------------------------------------------
// Per-question time tracking (server accumulates timeSpentSeconds — see
// qbankService.js#answerQuestion's "Accumulated, not overwritten" comment —
// so the client must send a real elapsed-time DELTA per action, not a fixed
// magic number every time).
// ---------------------------------------------------------------------------

const MIN_TIME_SPENT_DELTA_SECONDS = 1;
const MAX_TIME_SPENT_DELTA_SECONDS = 600; // defensive cap — a backgrounded tab shouldn't submit hours in one delta

export function computeElapsedSeconds(nowMs: number, lastCheckpointMs: number): number {
  const rawSeconds = Math.round((nowMs - lastCheckpointMs) / 1000);
  return Math.min(MAX_TIME_SPENT_DELTA_SECONDS, Math.max(MIN_TIME_SPENT_DELTA_SECONDS, rawSeconds));
}

// ---------------------------------------------------------------------------
// Palette filtering + derived counts
// ---------------------------------------------------------------------------

export type PaletteFilter = "all" | "unanswered" | "flagged";
export type ReviewFilter = "all" | "incorrect" | "flagged" | "correct";

export interface IndexedAttemptQuestion {
  q: TestAttemptQuestion;
  idx: number;
}

export function filterPaletteQuestions(questions: TestAttemptQuestion[], filter: PaletteFilter): IndexedAttemptQuestion[] {
  return questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      if (filter === "unanswered") return q.selectedOptionId == null;
      if (filter === "flagged") return !!q.isFlagged;
      return true;
    });
}

export function filterReviewQuestions(questions: TestAttemptQuestion[], filter: ReviewFilter): IndexedAttemptQuestion[] {
  return questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      if (filter === "incorrect") return q.selectedOptionId != null && q.isCorrect === false;
      if (filter === "correct") return q.isCorrect === true;
      if (filter === "flagged") return !!q.isFlagged;
      return true;
    });
}

export interface SessionCounts {
  totalCount: number;
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
}

export function computeSessionCounts(questions: TestAttemptQuestion[]): SessionCounts {
  const totalCount = questions.length;
  const answeredCount = questions.filter((q) => q.selectedOptionId != null).length;
  const flaggedCount = questions.filter((q) => !!q.isFlagged).length;
  return { totalCount, answeredCount, unansweredCount: totalCount - answeredCount, flaggedCount };
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

export type KeyboardAction =
  | { type: "selectOption"; optionIndex: number }
  | { type: "toggleFlag" }
  | { type: "previous" }
  | { type: "next" }
  | null;

/**
 * Pure key -> action mapping (TestRunner shortcut set: digit keys select an
 * option, F flags, arrows navigate). `optionsCount` bounds the digit
 * shortcuts so e.g. "9" is a no-op on a 4-option question rather than
 * silently selecting an out-of-range index; `canGoPrev`/`canGoNext` likewise
 * make the boundary a no-op instead of the caller needing to re-check.
 */
export function resolveKeyboardAction(
  key: string,
  optionsCount: number,
  canGoPrev: boolean,
  canGoNext: boolean
): KeyboardAction {
  if (/^[1-9]$/.test(key)) {
    const optionIndex = Number(key) - 1;
    return optionIndex < optionsCount ? { type: "selectOption", optionIndex } : null;
  }
  if (key === "f" || key === "F") return { type: "toggleFlag" };
  if (key === "ArrowLeft") return canGoPrev ? { type: "previous" } : null;
  if (key === "ArrowRight") return canGoNext ? { type: "next" } : null;
  return null;
}

// ---------------------------------------------------------------------------
// Answer-secrecy-safe option / practice-feedback visual state
// ---------------------------------------------------------------------------

export type OptionVisualState = "correct" | "incorrectSelected" | "dimmed" | "selected" | "default";

/**
 * Resolves how a single option should render WITHOUT assuming
 * `option.isCorrect` is present — per docs/10_SECURITY_CHECKLIST.md's
 * answer-secrecy contract it is genuinely `undefined` (key absent from the
 * JSON entirely) for an unanswered-or-still-in-progress question, never
 * `null`/`false`. `revealAnswers` must be computed by the caller using the
 * same rule the server used to decide whether to include it in the first
 * place (see shouldRevealPracticeFeedback / a completed-session's `status`)
 * — this function only renders given that flag, it does not infer it.
 */
export function resolveOptionVisualState(params: {
  isSelected: boolean;
  isCorrect: boolean | undefined;
  revealAnswers: boolean;
}): OptionVisualState {
  const { isSelected, isCorrect, revealAnswers } = params;
  if (revealAnswers) {
    if (isCorrect === true) return "correct";
    // isCorrect is now known to be `false | undefined` (not `true`) — a selected option that isn't the
    // known-correct one is "incorrectSelected" regardless of whether its own flag is false or absent.
    if (isSelected) return "incorrectSelected";
    return "dimmed";
  }
  return isSelected ? "selected" : "default";
}

/**
 * Practice-mode inline feedback is shown for a question once IT has been
 * answered (server only includes `isCorrect`/`explanation` at that point —
 * see `computeIncludeAnswers` in server/src/services/qbankService.js). Exam
 * and mock mode never reveal inline, regardless of answered state — only via
 * the post-completion review endpoint.
 */
export function shouldRevealPracticeFeedback(mode: TestSession["mode"], isAnswered: boolean): boolean {
  return mode === "practice" && isAnswered;
}

/** A terminal session (completed/abandoned) always reveals every answer —
 * matches computeIncludeAnswers's `if (session.status !== 'in_progress') return true;`. */
export function shouldRevealForTerminalSession(status: TestSession["status"]): boolean {
  return status !== "in_progress";
}

// ---------------------------------------------------------------------------
// Immutable session update helpers (replace TestSessionPage's original
// mutate-the-nested-object-then-setSession({...session}) pattern, which
// mutates state that other closures may still be holding a reference to).
// ---------------------------------------------------------------------------

export function applyOptimisticAnswer(session: TestSession, questionId: number, optionId: number | null): TestSession {
  const questions = (session.questions || []).map((aq) =>
    aq.questionId === questionId ? { ...aq, selectedOptionId: optionId ?? undefined } : aq
  );
  return { ...session, questions };
}

export function applyFlagUpdate(session: TestSession, questionId: number, isFlagged: boolean): TestSession {
  const questions = (session.questions || []).map((aq) => (aq.questionId === questionId ? { ...aq, isFlagged } : aq));
  return { ...session, questions };
}

export function applyBookmarkUpdate(session: TestSession, questionId: number, isBookmarked: boolean): TestSession {
  const questions = (session.questions || []).map((aq) =>
    aq.questionId === questionId ? { ...aq, question: { ...aq.question, isBookmarked } } : aq
  );
  return { ...session, questions };
}

/**
 * Applies a practice-mode PATCH /answer response onto the matching attempt
 * question — the ONLY place correctness is written into local state (never
 * guessed client-side pre-response, since the option's real `isCorrect` is
 * secret until the server says otherwise). Marks every option's `isCorrect`
 * from `correctOptionId` (accurate: once revealed, a real GET session refetch
 * would show every option's true flag too — see
 * qbankService.js#serializeQuestionOption), not just the selected one.
 */
export function applyPracticeAnswerReveal(
  session: TestSession,
  questionId: number,
  reveal: { isCorrect?: boolean; correctOptionId?: number; explanation?: string; referenceText?: string }
): TestSession {
  const questions = (session.questions || []).map((aq) => {
    if (aq.questionId !== questionId) return aq;
    return {
      ...aq,
      isCorrect: reveal.isCorrect,
      question: {
        ...aq.question,
        explanation: reveal.explanation ?? aq.question.explanation,
        referenceText: reveal.referenceText ?? aq.question.referenceText,
        options: aq.question.options.map((opt) => ({
          ...opt,
          isCorrect: reveal.correctOptionId != null ? opt.id === reveal.correctOptionId : opt.isCorrect,
        })),
      },
    };
  });
  return { ...session, questions };
}

// ---------------------------------------------------------------------------
// Offline / transient-failure autosave retry queue — a real reducer, per
// docs/07_EXECUTION_PLAN.md 7.5's explicit "vitest runner reducer" AC.
// ---------------------------------------------------------------------------

export interface QueuedAnswer {
  questionId: number;
  optionId?: number | null;
  timeSpent: number;
  flagged?: boolean;
  retryCount: number;
}

export type AutosaveStatus = "idle" | "saving" | "retrying" | "expired";

export interface AnswerQueueState {
  queue: QueuedAnswer[];
  status: AutosaveStatus;
  lastError?: { status?: number; code?: string; message?: string };
}

export const initialAnswerQueueState: AnswerQueueState = { queue: [], status: "idle" };

export type AnswerQueueAction =
  | { type: "ENQUEUE"; payload: { questionId: number; optionId?: number | null; timeSpent: number; flagged?: boolean } }
  | { type: "ATTEMPT_SUCCESS" }
  | { type: "ATTEMPT_FAILURE"; error: { status?: number; code?: string; message?: string } };

/**
 * Terminal answer-endpoint error codes (server/src/services/qbankService.js's
 * `answerQuestion`): `TEST_EXPIRED` (this very PATCH call's side effect just
 * auto-submitted the test — docs/07_EXECUTION_PLAN.md 7.5's explicit "queued
 * answer rejected as expired shouldn't retry forever" requirement) and
 * `TEST_NOT_IN_PROGRESS` (already completed/abandoned some other way, e.g.
 * a manual submit that raced the queue). Both mean "stop retrying, the test
 * is over" — any OTHER failure (network blip, transient 5xx, etc.) is
 * treated as transient and keeps retrying with backoff.
 */
export function isTerminalAnswerErrorCode(code?: string): boolean {
  return code === "TEST_EXPIRED" || code === "TEST_NOT_IN_PROGRESS";
}

export function answerQueueReducer(state: AnswerQueueState, action: AnswerQueueAction): AnswerQueueState {
  switch (action.type) {
    case "ENQUEUE": {
      if (state.status === "expired") return state; // test is over — stop accepting new work
      // Coalesce same-question edits (e.g. rapid re-selects before the first
      // save round-trips) — last write wins, keeps its place in the queue.
      const withoutDup = state.queue.filter((q) => q.questionId !== action.payload.questionId);
      return {
        ...state,
        queue: [...withoutDup, { ...action.payload, retryCount: 0 }],
        status: state.status === "retrying" ? "retrying" : "saving",
      };
    }
    case "ATTEMPT_SUCCESS": {
      const [, ...rest] = state.queue;
      return { queue: rest, status: rest.length > 0 ? "saving" : "idle", lastError: undefined };
    }
    case "ATTEMPT_FAILURE": {
      if (isTerminalAnswerErrorCode(action.error.code)) {
        return { queue: [], status: "expired", lastError: action.error };
      }
      const [first, ...rest] = state.queue;
      if (!first) return { ...state, status: "idle" };
      return {
        ...state,
        queue: [{ ...first, retryCount: first.retryCount + 1 }, ...rest],
        status: "retrying",
        lastError: action.error,
      };
    }
    default:
      return state;
  }
}

/**
 * Exponential backoff before retrying the head-of-queue item — same shape as
 * playerLogic.ts's heartbeat backoff (established precedent), capped so a
 * flaky connection still retries at a sane, bounded cadence rather than
 * hammering the endpoint.
 */
export const ANSWER_RETRY_BASE_DELAY_MS = 1_000;
export const ANSWER_RETRY_MAX_DELAY_MS = 15_000;

export function computeAnswerRetryDelayMs(
  retryCount: number,
  baseMs: number = ANSWER_RETRY_BASE_DELAY_MS,
  maxMs: number = ANSWER_RETRY_MAX_DELAY_MS
): number {
  const safeRetries = Number.isFinite(retryCount) && retryCount > 0 ? Math.floor(retryCount) : 0;
  return Math.min(baseMs * Math.pow(2, safeRetries), maxMs);
}

// ---------------------------------------------------------------------------
// Misc small helpers
// ---------------------------------------------------------------------------

/** Whether the user has a resumable (`in_progress`) test in their history — used for the QBank Hub resume banner. */
export function findActiveSession(sessions: TestSession[]): TestSession | undefined {
  return sessions.find((s) => s.status === "in_progress");
}

export function isQuestionAnswered(aq: TestAttemptQuestion): boolean {
  return aq.selectedOptionId != null;
}
