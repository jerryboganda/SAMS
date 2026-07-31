import { describe, it, expect } from "vitest";
import {
  computeDisplayRemainingSeconds,
  getTimerSeverity,
  mergeSessionTimerSync,
  computeElapsedSeconds,
  filterPaletteQuestions,
  filterReviewQuestions,
  computeSessionCounts,
  resolveKeyboardAction,
  resolveOptionVisualState,
  shouldRevealPracticeFeedback,
  shouldRevealForTerminalSession,
  applyOptimisticAnswer,
  applyFlagUpdate,
  applyBookmarkUpdate,
  applyPracticeAnswerReveal,
  answerQueueReducer,
  initialAnswerQueueState,
  isTerminalAnswerErrorCode,
  computeAnswerRetryDelayMs,
  findActiveSession,
  isQuestionAnswered,
  ANSWER_RETRY_BASE_DELAY_MS,
  ANSWER_RETRY_MAX_DELAY_MS,
} from "./testRunnerLogic";
import { TestAttemptQuestion, TestSession } from "../../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<TestAttemptQuestion["question"]> = {}) {
  return {
    id: 1,
    examCategory: "NRE1" as const,
    subjectId: 1,
    systemId: 1,
    stem: "A patient presents with...",
    options: [
      { id: 11, questionId: 1, optionText: "A", sortOrder: 1 },
      { id: 12, questionId: 1, optionText: "B", sortOrder: 2 },
      { id: 13, questionId: 1, optionText: "C", sortOrder: 3 },
    ],
    difficulty: "medium" as const,
    isActive: true,
    ...overrides,
  };
}

function makeAttemptQuestion(overrides: Partial<TestAttemptQuestion> = {}): TestAttemptQuestion {
  return {
    id: 1,
    testSessionId: 100,
    questionId: 1,
    sortOrder: 1,
    question: makeQuestion(),
    isFlagged: false,
    timeSpentSeconds: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<TestSession> = {}): TestSession {
  return {
    id: 100,
    userId: 1,
    mode: "practice",
    examCategory: "NRE1",
    questionCount: 3,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    correctCount: 0,
    incorrectCount: 0,
    skippedCount: 3,
    questions: [
      makeAttemptQuestion({ id: 1, questionId: 1 }),
      makeAttemptQuestion({ id: 2, questionId: 2, sortOrder: 2 }),
      makeAttemptQuestion({ id: 3, questionId: 3, sortOrder: 3 }),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Timer resync
// ---------------------------------------------------------------------------

describe("computeDisplayRemainingSeconds (server-authoritative countdown)", () => {
  it("ticks down from the last synced server value as time passes", () => {
    const syncedAtMs = 1_000_000;
    expect(computeDisplayRemainingSeconds(120, syncedAtMs, syncedAtMs)).toBe(120);
    expect(computeDisplayRemainingSeconds(120, syncedAtMs, syncedAtMs + 30_000)).toBe(90);
    expect(computeDisplayRemainingSeconds(120, syncedAtMs, syncedAtMs + 119_000)).toBe(1);
  });

  it("never goes below zero even long past the deadline", () => {
    const syncedAtMs = 1_000_000;
    expect(computeDisplayRemainingSeconds(60, syncedAtMs, syncedAtMs + 500_000)).toBe(0);
  });

  it("returns 0 for a non-finite server value defensively", () => {
    expect(computeDisplayRemainingSeconds(NaN, 0, 0)).toBe(0);
  });
});

describe("getTimerSeverity", () => {
  it("is red at/under 60s, amber under 5min, normal otherwise", () => {
    expect(getTimerSeverity(0)).toBe("red");
    expect(getTimerSeverity(60)).toBe("red");
    expect(getTimerSeverity(61)).toBe("amber");
    expect(getTimerSeverity(300)).toBe("amber");
    expect(getTimerSeverity(301)).toBe("normal");
  });
});

describe("mergeSessionTimerSync", () => {
  it("overwrites only timer/status/score fields, preserving local questions", () => {
    const local = makeSession({ timeRemainingSeconds: 500, status: "in_progress" });
    const localQuestionsRef = local.questions;
    const fresh = makeSession({
      timeRemainingSeconds: 470,
      status: "completed",
      completedAt: "2026-07-31T00:00:00.000Z",
      correctCount: 2,
      incorrectCount: 1,
      skippedCount: 0,
      scorePercent: 66.67,
      passed: true,
      questions: [], // resync payload's questions must NOT clobber local's
    });

    const merged = mergeSessionTimerSync(local, fresh);
    expect(merged.status).toBe("completed");
    expect(merged.timeRemainingSeconds).toBe(470);
    expect(merged.correctCount).toBe(2);
    expect(merged.scorePercent).toBe(66.67);
    expect(merged.questions).toBe(localQuestionsRef); // untouched reference — no clobber
  });
});

describe("computeElapsedSeconds (per-question time delta)", () => {
  it("computes a rounded delta in seconds", () => {
    expect(computeElapsedSeconds(10_000, 5_000)).toBe(5);
    expect(computeElapsedSeconds(10_400, 5_000)).toBe(5); // rounds down under .5s
    expect(computeElapsedSeconds(10_600, 5_000)).toBe(6); // rounds up over .5s
  });

  it("clamps to a minimum of 1 second (never sends a zero/negative delta)", () => {
    expect(computeElapsedSeconds(5_000, 5_000)).toBe(1);
    expect(computeElapsedSeconds(4_000, 5_000)).toBe(1); // clock skew / negative guarded
  });

  it("clamps to a defensive maximum for a backgrounded tab", () => {
    expect(computeElapsedSeconds(5_000_000, 0)).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// Palette / review filtering
// ---------------------------------------------------------------------------

describe("filterPaletteQuestions", () => {
  const questions = [
    makeAttemptQuestion({ id: 1, questionId: 1, selectedOptionId: 11, isFlagged: false }),
    makeAttemptQuestion({ id: 2, questionId: 2, selectedOptionId: undefined, isFlagged: true }),
    makeAttemptQuestion({ id: 3, questionId: 3, selectedOptionId: 13, isFlagged: true }),
  ];

  it("'all' returns every question with its original index", () => {
    const result = filterPaletteQuestions(questions, "all");
    expect(result.map((r) => r.idx)).toEqual([0, 1, 2]);
  });

  it("'unanswered' returns only questions with no selectedOptionId", () => {
    const result = filterPaletteQuestions(questions, "unanswered");
    expect(result.map((r) => r.idx)).toEqual([1]);
  });

  it("'flagged' returns only flagged questions", () => {
    const result = filterPaletteQuestions(questions, "flagged");
    expect(result.map((r) => r.idx)).toEqual([1, 2]);
  });
});

describe("filterReviewQuestions", () => {
  const questions = [
    makeAttemptQuestion({ id: 1, questionId: 1, selectedOptionId: 11, isCorrect: true }),
    makeAttemptQuestion({ id: 2, questionId: 2, selectedOptionId: 12, isCorrect: false }),
    makeAttemptQuestion({ id: 3, questionId: 3, selectedOptionId: undefined, isCorrect: undefined }),
    makeAttemptQuestion({ id: 4, questionId: 4, selectedOptionId: 14, isCorrect: false, isFlagged: true }),
  ];

  it("'correct' returns only correctly-answered questions", () => {
    expect(filterReviewQuestions(questions, "correct").map((r) => r.idx)).toEqual([0]);
  });

  it("'incorrect' returns only answered-and-wrong questions (not skipped)", () => {
    expect(filterReviewQuestions(questions, "incorrect").map((r) => r.idx)).toEqual([1, 3]);
  });

  it("'flagged' returns only flagged questions", () => {
    expect(filterReviewQuestions(questions, "flagged").map((r) => r.idx)).toEqual([3]);
  });

  it("'all' returns everything", () => {
    expect(filterReviewQuestions(questions, "all").map((r) => r.idx)).toEqual([0, 1, 2, 3]);
  });
});

describe("computeSessionCounts", () => {
  it("tallies answered/unanswered/flagged accurately", () => {
    const questions = [
      makeAttemptQuestion({ id: 1, questionId: 1, selectedOptionId: 11, isFlagged: true }),
      makeAttemptQuestion({ id: 2, questionId: 2, selectedOptionId: undefined, isFlagged: false }),
      makeAttemptQuestion({ id: 3, questionId: 3, selectedOptionId: 13, isFlagged: false }),
    ];
    expect(computeSessionCounts(questions)).toEqual({
      totalCount: 3,
      answeredCount: 2,
      unansweredCount: 1,
      flaggedCount: 1,
    });
  });

  it("handles an empty question list", () => {
    expect(computeSessionCounts([])).toEqual({ totalCount: 0, answeredCount: 0, unansweredCount: 0, flaggedCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

describe("resolveKeyboardAction", () => {
  it("maps digit keys to option selection, bounded by optionsCount", () => {
    expect(resolveKeyboardAction("1", 4, true, true)).toEqual({ type: "selectOption", optionIndex: 0 });
    expect(resolveKeyboardAction("4", 4, true, true)).toEqual({ type: "selectOption", optionIndex: 3 });
    expect(resolveKeyboardAction("5", 4, true, true)).toBeNull(); // out of range for a 4-option question
  });

  it("maps f/F to toggleFlag", () => {
    expect(resolveKeyboardAction("f", 4, true, true)).toEqual({ type: "toggleFlag" });
    expect(resolveKeyboardAction("F", 4, true, true)).toEqual({ type: "toggleFlag" });
  });

  it("maps arrow keys to navigation, respecting boundaries", () => {
    expect(resolveKeyboardAction("ArrowLeft", 4, true, true)).toEqual({ type: "previous" });
    expect(resolveKeyboardAction("ArrowLeft", 4, false, true)).toBeNull(); // already at first question
    expect(resolveKeyboardAction("ArrowRight", 4, true, true)).toEqual({ type: "next" });
    expect(resolveKeyboardAction("ArrowRight", 4, true, false)).toBeNull(); // already at last question
  });

  it("returns null for unrelated keys", () => {
    expect(resolveKeyboardAction("Tab", 4, true, true)).toBeNull();
    expect(resolveKeyboardAction("0", 4, true, true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Answer-secrecy-safe visual state
// ---------------------------------------------------------------------------

describe("resolveOptionVisualState (answer-secrecy safe)", () => {
  it("never crashes / never reveals when isCorrect is undefined (secrecy, mid-test)", () => {
    expect(
      resolveOptionVisualState({ isSelected: true, isCorrect: undefined, revealAnswers: false })
    ).toBe("selected");
    expect(
      resolveOptionVisualState({ isSelected: false, isCorrect: undefined, revealAnswers: false })
    ).toBe("default");
  });

  it("shows the correct option in green once revealed", () => {
    expect(resolveOptionVisualState({ isSelected: false, isCorrect: true, revealAnswers: true })).toBe("correct");
  });

  it("shows the selected-but-wrong option distinctly once revealed", () => {
    expect(resolveOptionVisualState({ isSelected: true, isCorrect: false, revealAnswers: true })).toBe(
      "incorrectSelected"
    );
  });

  it("dims every other option once revealed", () => {
    expect(resolveOptionVisualState({ isSelected: false, isCorrect: false, revealAnswers: true })).toBe("dimmed");
  });

  it("even with revealAnswers=true, an undefined isCorrect degrades to dimmed rather than crashing", () => {
    expect(resolveOptionVisualState({ isSelected: false, isCorrect: undefined, revealAnswers: true })).toBe("dimmed");
  });
});

describe("shouldRevealPracticeFeedback", () => {
  it("is true only for practice mode + an answered question", () => {
    expect(shouldRevealPracticeFeedback("practice", true)).toBe(true);
    expect(shouldRevealPracticeFeedback("practice", false)).toBe(false);
    expect(shouldRevealPracticeFeedback("exam", true)).toBe(false);
    expect(shouldRevealPracticeFeedback("mock", true)).toBe(false);
  });
});

describe("shouldRevealForTerminalSession", () => {
  it("is true once completed or abandoned, false while in_progress", () => {
    expect(shouldRevealForTerminalSession("completed")).toBe(true);
    expect(shouldRevealForTerminalSession("abandoned")).toBe(true);
    expect(shouldRevealForTerminalSession("in_progress")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Immutable session update helpers
// ---------------------------------------------------------------------------

describe("applyOptimisticAnswer", () => {
  it("updates only the targeted question's selectedOptionId, without mutating the input", () => {
    const session = makeSession();
    const originalQuestions = session.questions!;
    const updated = applyOptimisticAnswer(session, 2, 12);

    expect(originalQuestions[1].selectedOptionId).toBeUndefined(); // input untouched
    expect(updated.questions![1].selectedOptionId).toBe(12);
    expect(updated.questions![0].selectedOptionId).toBeUndefined();
    expect(updated).not.toBe(session);
  });

  it("clearing an answer sets selectedOptionId back to undefined", () => {
    const session = makeSession({ questions: [makeAttemptQuestion({ questionId: 1, selectedOptionId: 11 })] });
    const updated = applyOptimisticAnswer(session, 1, null);
    expect(updated.questions![0].selectedOptionId).toBeUndefined();
  });
});

describe("applyFlagUpdate", () => {
  it("flags only the targeted question", () => {
    const session = makeSession();
    const updated = applyFlagUpdate(session, 2, true);
    expect(updated.questions![1].isFlagged).toBe(true);
    expect(updated.questions![0].isFlagged).toBe(false);
  });
});

describe("applyBookmarkUpdate", () => {
  it("bookmarks only the targeted question's nested question object", () => {
    const session = makeSession();
    const updated = applyBookmarkUpdate(session, 3, true);
    expect(updated.questions![2].question.isBookmarked).toBe(true);
    expect(updated.questions![0].question.isBookmarked).toBeUndefined();
  });
});

describe("applyPracticeAnswerReveal", () => {
  it("writes isCorrect, explanation, referenceText, and marks the correct option — the only place correctness is set client-side", () => {
    const session = makeSession();
    const updated = applyPracticeAnswerReveal(session, 1, {
      isCorrect: false,
      correctOptionId: 12,
      explanation: "Because X causes Y.",
      referenceText: "Robbins Ch. 4",
    });

    const aq = updated.questions!.find((q) => q.questionId === 1)!;
    expect(aq.isCorrect).toBe(false);
    expect(aq.question.explanation).toBe("Because X causes Y.");
    expect(aq.question.referenceText).toBe("Robbins Ch. 4");
    expect(aq.question.options.find((o) => o.id === 12)!.isCorrect).toBe(true);
    expect(aq.question.options.find((o) => o.id === 11)!.isCorrect).toBe(false);
    expect(aq.question.options.find((o) => o.id === 13)!.isCorrect).toBe(false);
  });

  it("leaves other questions completely untouched", () => {
    const session = makeSession();
    const updated = applyPracticeAnswerReveal(session, 1, { isCorrect: true, correctOptionId: 11 });
    const other = updated.questions!.find((q) => q.questionId === 2)!;
    expect(other.isCorrect).toBeUndefined();
    expect(other.question.options.every((o) => o.isCorrect === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Offline retry queue reducer
// ---------------------------------------------------------------------------

describe("answerQueueReducer", () => {
  it("ENQUEUE adds a new item and moves to 'saving'", () => {
    const state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    expect(state.queue).toHaveLength(1);
    expect(state.status).toBe("saving");
  });

  it("ENQUEUE coalesces a repeated edit to the same question (last write wins, one queue slot)", () => {
    let state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    state = answerQueueReducer(state, { type: "ENQUEUE", payload: { questionId: 1, optionId: 12, timeSpent: 3 } });
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].optionId).toBe(12);
  });

  it("ATTEMPT_SUCCESS pops the head of queue and returns to 'idle' when empty", () => {
    let state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    state = answerQueueReducer(state, { type: "ATTEMPT_SUCCESS" });
    expect(state.queue).toHaveLength(0);
    expect(state.status).toBe("idle");
  });

  it("ATTEMPT_SUCCESS with more items queued stays in 'saving'", () => {
    let state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    state = answerQueueReducer(state, { type: "ENQUEUE", payload: { questionId: 2, optionId: 21, timeSpent: 4 } });
    state = answerQueueReducer(state, { type: "ATTEMPT_SUCCESS" });
    expect(state.queue).toHaveLength(1);
    expect(state.status).toBe("saving");
  });

  it("ATTEMPT_FAILURE with a transient error bumps retryCount and moves to 'retrying', keeping the item queued", () => {
    let state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    state = answerQueueReducer(state, { type: "ATTEMPT_FAILURE", error: { status: 503, code: "NETWORK_TIMEOUT" } });
    expect(state.status).toBe("retrying");
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].retryCount).toBe(1);
  });

  it("ATTEMPT_FAILURE with TEST_EXPIRED clears the queue and stops retrying forever — the explicit AC", () => {
    let state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    state = answerQueueReducer(state, {
      type: "ATTEMPT_FAILURE",
      error: { status: 409, code: "TEST_EXPIRED", message: "The time limit for this test has elapsed." },
    });
    expect(state.status).toBe("expired");
    expect(state.queue).toHaveLength(0);
    expect(state.lastError?.code).toBe("TEST_EXPIRED");
  });

  it("ATTEMPT_FAILURE with TEST_NOT_IN_PROGRESS is equally terminal", () => {
    let state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    state = answerQueueReducer(state, {
      type: "ATTEMPT_FAILURE",
      error: { status: 409, code: "TEST_NOT_IN_PROGRESS" },
    });
    expect(state.status).toBe("expired");
    expect(state.queue).toHaveLength(0);
  });

  it("once expired, further ENQUEUE calls are rejected (no zombie saves after the test is over)", () => {
    let state = answerQueueReducer(initialAnswerQueueState, {
      type: "ENQUEUE",
      payload: { questionId: 1, optionId: 11, timeSpent: 5 },
    });
    state = answerQueueReducer(state, { type: "ATTEMPT_FAILURE", error: { code: "TEST_EXPIRED" } });
    const before = state;
    state = answerQueueReducer(state, { type: "ENQUEUE", payload: { questionId: 2, optionId: 21, timeSpent: 2 } });
    expect(state).toBe(before); // untouched — no-op
  });
});

describe("isTerminalAnswerErrorCode", () => {
  it("is true for TEST_EXPIRED and TEST_NOT_IN_PROGRESS only", () => {
    expect(isTerminalAnswerErrorCode("TEST_EXPIRED")).toBe(true);
    expect(isTerminalAnswerErrorCode("TEST_NOT_IN_PROGRESS")).toBe(true);
    expect(isTerminalAnswerErrorCode("NETWORK_TIMEOUT")).toBe(false);
    expect(isTerminalAnswerErrorCode(undefined)).toBe(false);
  });
});

describe("computeAnswerRetryDelayMs", () => {
  it("doubles per retry starting from the base delay", () => {
    expect(computeAnswerRetryDelayMs(0)).toBe(ANSWER_RETRY_BASE_DELAY_MS);
    expect(computeAnswerRetryDelayMs(1)).toBe(ANSWER_RETRY_BASE_DELAY_MS * 2);
    expect(computeAnswerRetryDelayMs(2)).toBe(ANSWER_RETRY_BASE_DELAY_MS * 4);
  });

  it("caps at the max delay", () => {
    expect(computeAnswerRetryDelayMs(10)).toBe(ANSWER_RETRY_MAX_DELAY_MS);
  });

  it("treats invalid retry counts defensively as zero", () => {
    expect(computeAnswerRetryDelayMs(-3)).toBe(ANSWER_RETRY_BASE_DELAY_MS);
    expect(computeAnswerRetryDelayMs(NaN)).toBe(ANSWER_RETRY_BASE_DELAY_MS);
  });
});

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

describe("findActiveSession", () => {
  it("finds the in_progress session in a history list", () => {
    const sessions = [
      makeSession({ id: 1, status: "completed" }),
      makeSession({ id: 2, status: "in_progress" }),
      makeSession({ id: 3, status: "abandoned" }),
    ];
    expect(findActiveSession(sessions)?.id).toBe(2);
  });

  it("returns undefined when there is none", () => {
    const sessions = [makeSession({ id: 1, status: "completed" })];
    expect(findActiveSession(sessions)).toBeUndefined();
  });
});

describe("isQuestionAnswered", () => {
  it("is true only when selectedOptionId is a real id, not 0/undefined confusion", () => {
    expect(isQuestionAnswered(makeAttemptQuestion({ selectedOptionId: 11 }))).toBe(true);
    expect(isQuestionAnswered(makeAttemptQuestion({ selectedOptionId: undefined }))).toBe(false);
  });
});
