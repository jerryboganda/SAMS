import { CONFIG } from "../../config";
import { apiFetch, mockLatency, ApiError } from "../client";
import { Question, Subject, BodySystem, TestSession, TestAttemptQuestion, TestMode, TestPool, ExamCategory, MockExam } from "../../types";
import { MOCK_QUESTIONS, MOCK_SUBJECTS, MOCK_SYSTEMS, MOCK_TEST_SESSIONS } from "../../mock-data";

export interface CreateTestRequest {
  examCategory: ExamCategory;
  subjectIds?: number[];
  systemIds?: number[];
  count: number;
  mode: TestMode;
  timed: boolean;
  timeLimitSeconds?: number;
  pool: TestPool;
  forceNew?: boolean;
}

/** `GET /qbank/meta` response — see server/src/services/qbankService.js#getQbankMeta. */
export interface QbankFilterCount {
  examCategory: ExamCategory;
  subjectId: number;
  systemId: number;
  count: number;
}

export interface QbankMetaResponse {
  categories: ExamCategory[];
  subjects: Subject[];
  systems: BodySystem[];
  countsByCategory: { examCategory: ExamCategory; count: number }[];
  /** One row per (examCategory, subjectId, systemId) combination with at least one active question — the
   * exact real counts the create-test wizard uses instead of fabricating numbers client-side. */
  filterCounts: QbankFilterCount[];
  poolsCount: { all: number; unused: number; incorrect: number; bookmarked: number };
}

/** `PATCH /qbank/tests/:id/answer` response — practice mode includes the reveal fields immediately;
 * exam/mock mode is just `{ success: true }` (server/src/services/qbankService.js#answerQuestion). */
export interface AnswerQuestionResponse {
  success?: boolean;
  isCorrect?: boolean;
  correctOptionId?: number;
  explanation?: string;
  referenceText?: string;
}

/** `GET /qbank/analytics?range=` — see server/src/services/analyticsService.js. Default 'daily'; the
 * server rejects (422) any value outside this union, so the client never sends anything else. */
export type AnalyticsRange = "daily" | "weekly" | "monthly";

export interface AnalyticsDailyTrendPoint {
  /** `YYYY-MM-DD` for daily/weekly buckets, `YYYY-MM` for monthly — see analyticsService.js#buildSeries. */
  date: string;
  questions: number;
  correct: number;
  qbankSeconds?: number;
}

export interface AnalyticsOverall {
  totalAttempted: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalSkipped: number;
  overallPercent: number;
  avgTimePerQuestionSeconds: number;
}

export interface AnalyticsNamedScore {
  name: string;
  score: number;
}

export interface AnalyticsGroupPerformance {
  name: string;
  total: number;
  correct: number;
  percent: number;
  subjectId?: number;
  systemId?: number;
}

/** `GET /qbank/analytics` response shape — see server/src/services/analyticsService.js#getAnalytics.
 * `strengths`/`weaknesses`/`subjectPerformance`/`systemPerformance` are honestly EMPTY arrays (never
 * fabricated placeholders) for a student with no graded QBank history yet; `dailyTrend` is always a full,
 * zero-filled array covering the whole window (never empty) so a trend chart always has a real, gap-free
 * x-axis to render — see docs/07_EXECUTION_PLAN.md 8.2's "empty-state for new user" AC. */
export interface AnalyticsResponse {
  overall: AnalyticsOverall;
  strengths: AnalyticsNamedScore[];
  weaknesses: AnalyticsNamedScore[];
  subjectPerformance: AnalyticsGroupPerformance[];
  systemPerformance: AnalyticsGroupPerformance[];
  dailyTrend: AnalyticsDailyTrendPoint[];
  range: AnalyticsRange;
}

export const qbankApi = {
  async getMeta(): Promise<QbankMetaResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const categories: ExamCategory[] = ["NRE1", "USMLE1", "USMLE2CK", "SMLE", "DHA", "PROMETRIC", "MBBS"];
      const filterCounts: QbankFilterCount[] = MOCK_QUESTIONS.map((q) => ({
        examCategory: q.examCategory,
        subjectId: q.subjectId,
        systemId: q.systemId,
        count: 1,
      }));
      return {
        categories,
        subjects: MOCK_SUBJECTS,
        systems: MOCK_SYSTEMS,
        countsByCategory: categories.map((c) => ({ examCategory: c, count: MOCK_QUESTIONS.length })),
        filterCounts,
        poolsCount: {
          all: MOCK_QUESTIONS.length,
          unused: 45,
          incorrect: 12,
          bookmarked: 8,
        },
      };
    }
    return apiFetch<QbankMetaResponse>("/qbank/meta");
  },

  async createTest(req: CreateTestRequest): Promise<TestSession> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 450);

      // Check if an active in-progress test exists and forceNew is not set
      if (!req.forceNew) {
        const existingJson = localStorage.getItem("sams_mock_active_test");
        if (existingJson) {
          try {
            const existing: TestSession = JSON.parse(existingJson);
            if (existing && existing.status === "in_progress") {
              throw new ApiError(
                "An active test session is already in progress.",
                "ACTIVE_TEST_EXISTS",
                409,
                { testId: existing.id }
              );
            }
          } catch (e: any) {
            if (e.code === "ACTIVE_TEST_EXISTS") throw e;
          }
        }
      }

      // Select subset of questions
      let poolQuestions = [...MOCK_QUESTIONS];
      if (req.subjectIds && req.subjectIds.length > 0) {
        poolQuestions = poolQuestions.filter((q) => req.subjectIds!.includes(q.subjectId));
      }
      if (req.systemIds && req.systemIds.length > 0) {
        poolQuestions = poolQuestions.filter((q) => req.systemIds!.includes(q.systemId));
      }
      if (req.pool === "bookmarked") {
        poolQuestions = poolQuestions.filter((q) => q.isBookmarked);
      }

      if (poolQuestions.length === 0) {
        poolQuestions = MOCK_QUESTIONS.slice(0, req.count);
      }

      const selected = poolQuestions.slice(0, Math.min(req.count, poolQuestions.length));

      const newId = Date.now() % 100000;
      const attemptQuestions: TestAttemptQuestion[] = selected.map((q, idx) => ({
        id: idx + 1,
        testSessionId: newId,
        questionId: q.id,
        sortOrder: idx + 1,
        question: q,
        isFlagged: false,
        timeSpentSeconds: 0,
      }));

      const testSession: TestSession = {
        id: newId,
        userId: 1,
        mode: req.mode,
        examCategory: req.examCategory,
        questionCount: selected.length,
        timeLimitSeconds: req.timed ? (req.timeLimitSeconds || Math.round(selected.length * 72)) : undefined,
        status: "in_progress",
        startedAt: new Date().toISOString(),
        correctCount: 0,
        incorrectCount: 0,
        skippedCount: selected.length,
        questions: attemptQuestions,
        timeRemainingSeconds: req.timed ? (req.timeLimitSeconds || Math.round(selected.length * 72)) : undefined,
      };

      localStorage.setItem("sams_mock_active_test", JSON.stringify(testSession));

      // Append to history
      const historyJson = localStorage.getItem("sams_mock_test_history");
      const history: TestSession[] = historyJson ? JSON.parse(historyJson) : [...MOCK_TEST_SESSIONS];
      const updatedHistory = [testSession, ...history.filter(t => t.id !== testSession.id)];
      localStorage.setItem("sams_mock_test_history", JSON.stringify(updatedHistory));

      return testSession;
    }
    return apiFetch<TestSession>("/qbank/tests", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  async getTestHistory(): Promise<TestSession[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const historyJson = localStorage.getItem("sams_mock_test_history");
      if (historyJson) {
        try {
          return JSON.parse(historyJson);
        } catch {
          return MOCK_TEST_SESSIONS;
        }
      }
      return MOCK_TEST_SESSIONS;
    }
    return apiFetch<TestSession[]>("/qbank/tests");
  },

  async abandonTest(testId: number): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const activeTestJson = localStorage.getItem("sams_mock_active_test");
      if (activeTestJson) {
        const test: TestSession = JSON.parse(activeTestJson);
        if (test.id === testId) {
          test.status = "abandoned";
          localStorage.setItem("sams_mock_active_test", JSON.stringify(test));
        }
      }

      const historyJson = localStorage.getItem("sams_mock_test_history");
      const history: TestSession[] = historyJson ? JSON.parse(historyJson) : [...MOCK_TEST_SESSIONS];
      const updated = history.map((t) => (t.id === testId ? { ...t, status: "abandoned" as const } : t));
      localStorage.setItem("sams_mock_test_history", JSON.stringify(updated));

      return { success: true };
    }
    return apiFetch<any>(`/qbank/tests/${testId}/abandon`, { method: "POST" });
  },

  async getTestSession(testId: number): Promise<TestSession> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);

      // Check active test in localStorage
      const activeTestJson = localStorage.getItem("sams_mock_active_test");
      if (activeTestJson) {
        const activeSession: TestSession = JSON.parse(activeTestJson);
        if (activeSession.id === testId) {
          return activeSession;
        }
      }

      // Check test history in localStorage
      const historyJson = localStorage.getItem("sams_mock_test_history");
      const history: TestSession[] = historyJson ? JSON.parse(historyJson) : MOCK_TEST_SESSIONS;
      const found = history.find((t) => t.id === testId) || MOCK_TEST_SESSIONS.find((t) => t.id === testId);

      const targetSession: TestSession = found
        ? { ...found }
        : {
            id: testId,
            userId: 1,
            mode: "practice",
            examCategory: "NRE1",
            questionCount: 20,
            status: "completed",
            startedAt: new Date(Date.now() - 3600000).toISOString(),
            completedAt: new Date().toISOString(),
            correctCount: 15,
            incorrectCount: 3,
            skippedCount: 2,
            scorePercent: 75,
            passed: true,
          };

      // Ensure questions array is populated with full questions
      if (!targetSession.questions || targetSession.questions.length === 0) {
        const total = targetSession.questionCount || 20;
        const availableQuestions = MOCK_QUESTIONS;

        targetSession.questions = Array.from({ length: total }).map((_, idx) => {
          const rawQ = availableQuestions[idx % availableQuestions.length];
          const correctOpt = rawQ.options.find((o) => o.isCorrect);
          const incorrectOpt = rawQ.options.find((o) => !o.isCorrect);

          let selectedOptionId: number | undefined = undefined;
          let isCorrect: boolean | undefined = undefined;

          if (targetSession.status === "completed") {
            const correctLimit = targetSession.correctCount ?? 15;
            const incorrectLimit = (targetSession.incorrectCount ?? 3) + correctLimit;

            if (idx < correctLimit) {
              selectedOptionId = correctOpt?.id;
              isCorrect = true;
            } else if (idx < incorrectLimit) {
              selectedOptionId = incorrectOpt?.id;
              isCorrect = false;
            } else {
              selectedOptionId = undefined;
              isCorrect = undefined;
            }
          }

          return {
            id: idx + 1,
            testSessionId: testId,
            questionId: rawQ.id,
            sortOrder: idx + 1,
            question: rawQ,
            selectedOptionId,
            isCorrect,
            isFlagged: idx % 5 === 0,
            timeSpentSeconds: 28 + (idx * 7) % 35,
          };
        });
      }

      return targetSession;
    }
    return apiFetch<TestSession>(`/qbank/tests/${testId}`);
  },

  /** `GET /qbank/tests/:id/review` — 403s if the session isn't completed/abandoned yet
   * (server/src/services/qbankService.js#getTestReview). Distinct from getTestSession because it's the
   * semantically-correct, server-authoritative endpoint for the post-completion Review page. */
  async getTestReview(testId: number): Promise<TestSession> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const session = await this.getTestSession(testId);
      if (session.status === "in_progress") {
        throw new ApiError("This test must be completed or abandoned before it can be reviewed.", "FORBIDDEN", 403);
      }
      return session;
    }
    return apiFetch<TestSession>(`/qbank/tests/${testId}/review`);
  },

  async answerQuestion(
    testId: number,
    data: { questionId: number; optionId?: number | null; timeSpent: number; flagged?: boolean; skipSimulatedFailure?: boolean }
  ): Promise<AnswerQuestionResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);

      // Simulate 5% random network glitch to verify autosave retry queue behavior
      if (!data.skipSimulatedFailure && Math.random() < 0.05) {
        throw new ApiError(
          "Simulated transient network glitch (5% test rate)",
          "NETWORK_TIMEOUT",
          503
        );
      }

      const activeTestJson = localStorage.getItem("sams_mock_active_test");
      if (activeTestJson) {
        const test: TestSession = JSON.parse(activeTestJson);
        const qItem = test.questions?.find((q) => q.questionId === data.questionId);
        if (qItem) {
          qItem.selectedOptionId = data.optionId ?? undefined;
          if (data.flagged !== undefined) qItem.isFlagged = data.flagged;
          qItem.timeSpentSeconds += data.timeSpent;

          // Check correctness
          if (data.optionId) {
            const correctOpt = qItem.question.options.find((o) => o.isCorrect);
            qItem.isCorrect = correctOpt ? correctOpt.id === data.optionId : false;
          }
        }
        localStorage.setItem("sams_mock_active_test", JSON.stringify(test));

        if (qItem && test.mode === "practice") {
          const correctOpt = qItem.question.options.find((o) => o.isCorrect);
          return {
            isCorrect: qItem.isCorrect,
            correctOptionId: correctOpt?.id,
            explanation: qItem.question.explanation,
            referenceText: qItem.question.referenceText,
          };
        }
      }

      return { success: true };
    }
    return apiFetch<AnswerQuestionResponse>(`/qbank/tests/${testId}/answer`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async submitTest(testId: number): Promise<TestSession> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);

      const activeTestJson = localStorage.getItem("sams_mock_active_test");
      let test: TestSession;
      if (activeTestJson) {
        test = JSON.parse(activeTestJson);
      } else {
        test = await this.getTestSession(testId);
      }

      let correct = 0;
      let incorrect = 0;
      let skipped = 0;

      test.questions?.forEach((q) => {
        if (!q.selectedOptionId) {
          skipped++;
        } else if (q.isCorrect) {
          correct++;
        } else {
          incorrect++;
        }
      });

      test.status = "completed";
      test.completedAt = new Date().toISOString();
      test.correctCount = correct;
      test.incorrectCount = incorrect;
      test.skippedCount = skipped;
      test.scorePercent = Math.round((correct / test.questionCount) * 100);
      test.passed = test.scorePercent >= 60;

      localStorage.setItem("sams_mock_active_test", JSON.stringify(test));

      // Update in sams_mock_test_history as well
      const historyJson = localStorage.getItem("sams_mock_test_history");
      const history: TestSession[] = historyJson ? JSON.parse(historyJson) : [...MOCK_TEST_SESSIONS];
      const updatedHistory = history.map((t) => (t.id === test.id ? test : t));
      if (!updatedHistory.some((t) => t.id === test.id)) {
        updatedHistory.unshift(test);
      }
      localStorage.setItem("sams_mock_test_history", JSON.stringify(updatedHistory));

      return test;
    }
    return apiFetch<TestSession>(`/qbank/tests/${testId}/submit`, { method: "POST" });
  },

  /**
   * `POST` (bookmarked=true) / `DELETE` (bookmarked=false) `/qbank/questions/:id/bookmark` — the real API is a
   * toggle expressed as two distinct verbs (server/src/routes/v1/qbank.js), not a single idempotent toggle
   * endpoint, so the caller must pass the INTENDED next state rather than "just flip whatever it currently is".
   * 403 if the question was never encountered in one of the user's own tests
   * (server/src/services/qbankService.js#assertQuestionSeenByUser) — not expected from normal UI flow since
   * bookmark buttons only ever render on a question the student is actively viewing.
   */
  async setQuestionBookmark(questionId: number, bookmarked: boolean): Promise<{ isBookmarked: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 150);
      return { isBookmarked: bookmarked };
    }
    return apiFetch<{ isBookmarked: boolean }>(`/qbank/questions/${questionId}/bookmark`, {
      method: bookmarked ? "POST" : "DELETE",
    });
  },

  async getAnalytics(range: AnalyticsRange = "daily"): Promise<AnalyticsResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      return {
        range,
        overall: {
          totalAttempted: 420,
          totalCorrect: 321,
          totalIncorrect: 84,
          totalSkipped: 15,
          overallPercent: 76.4,
          avgTimePerQuestionSeconds: 42,
        },
        strengths: [
          { name: "Pathology", score: 88 },
          { name: "Pharmacology", score: 84 },
          { name: "Cardiovascular System", score: 82 },
        ],
        weaknesses: [
          { name: "Biochemistry", score: 58 },
          { name: "Genetics", score: 62 },
          { name: "Biostatistics", score: 64 },
        ],
        subjectPerformance: MOCK_SUBJECTS.map((s, idx) => ({
          subjectId: s.id,
          name: s.name,
          total: 50,
          correct: 30 + (idx * 3) % 18,
          percent: Math.round(((30 + (idx * 3) % 18) / 50) * 100),
        })),
        systemPerformance: MOCK_SYSTEMS.map((sys, idx) => ({
          systemId: sys.id,
          name: sys.name,
          total: 40,
          correct: 24 + (idx * 2) % 14,
          percent: Math.round(((24 + (idx * 2) % 14) / 40) * 100),
        })),
        dailyTrend: [
          { date: "Mon", questions: 30, correct: 24 },
          { date: "Tue", questions: 45, correct: 35 },
          { date: "Wed", questions: 20, correct: 16 },
          { date: "Thu", questions: 50, correct: 39 },
          { date: "Fri", questions: 60, correct: 48 },
          { date: "Sat", questions: 40, correct: 32 },
          { date: "Sun", questions: 35, correct: 28 },
        ],
      };
    }
    return apiFetch<AnalyticsResponse>(`/qbank/analytics?range=${range}`);
  },

  async getMockExams(): Promise<MockExam[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      return [
        {
          id: 1,
          title: "NRE Step 1 National Comprehensive Grand Mock Exam 2026",
          examCategory: "NRE1",
          durationMinutes: 60,
          passPercent: 60,
          questionsCount: 50,
          isPublished: true,
          bestScore: 78,
          attemptsCount: 2,
        },
        {
          id: 2,
          title: "USMLE Step 1 Comprehensive Basic Sciences Simulation",
          examCategory: "USMLE1",
          durationMinutes: 60,
          passPercent: 65,
          questionsCount: 50,
          isPublished: true,
          bestScore: 72,
          attemptsCount: 1,
        },
        {
          id: 3,
          title: "SMLE Saudi Medical Licensing Grand Trial Paper",
          examCategory: "SMLE",
          durationMinutes: 45,
          passPercent: 60,
          questionsCount: 40,
          isPublished: true,
          bestScore: 0,
          attemptsCount: 0,
        },
        {
          id: 4,
          title: "DHA Dubai Health Authority Practice Grand Mock",
          examCategory: "DHA",
          durationMinutes: 45,
          passPercent: 60,
          questionsCount: 40,
          isPublished: true,
          bestScore: 0,
          attemptsCount: 0,
        },
      ];
    }
    return apiFetch<MockExam[]>("/mock-exams");
  },
};

// ---------------------------------------------------------------------------
// GAP WORKAROUND: there is no `GET /qbank/bookmarks` (or equivalent "my
// bookmarked/incorrect questions with full content") listing endpoint in the
// real backend — `POST`/`DELETE /qbank/questions/:id/bookmark` are toggle-only,
// and `GET /qbank/meta`'s `poolsCount.bookmarked`/`poolsCount.incorrect` are
// COUNTS only, not lists (server/src/routes/v1/qbank.js has no such route;
// confirmed against server/src/services/qbankService.js). See DECISIONS.md's
// dated Phase 7.5-7.6 entry for the full writeup of this gap.
//
// Rather than fabricating question content client-side (explicitly against
// this phase's brief), this reconstructs a REAL list from data the backend
// already gives us: `GET /qbank/tests` (history) + `GET /qbank/tests/:id/review`
// per completed/abandoned session (review always returns each question's
// CURRENT `isBookmarked` state — a fresh QuestionBookmark lookup on every call,
// never a stale historical snapshot — and that session's own answer
// correctness). Capped to the most recent N sessions to bound network calls;
// this is a workaround, not a substitute for a real listing endpoint (a
// left-over bookmark on a question from session #200 would never surface once
// more than ENCOUNTERED_SCAN_SESSION_CAP newer sessions exist) — flagged
// clearly in the UI copy of BookmarksPage.tsx / IncorrectQuestionsPage.tsx.
// ---------------------------------------------------------------------------

export const ENCOUNTERED_SCAN_SESSION_CAP = 20;

export interface EncounteredQuestionsResult {
  questions: Question[];
  scannedSessionsCount: number;
  truncated: boolean;
}

/**
 * `kind: "bookmarked"` — every currently-bookmarked question the user has ever encountered in one of the last
 * `ENCOUNTERED_SCAN_SESSION_CAP` completed/abandoned sessions (any occurrence counts — `isBookmarked` is always
 * live, not historical).
 *
 * `kind: "incorrect"` — questions whose MOST RECENT attempt (across scanned sessions, newest-first) was wrong —
 * approximates the server's own `UserQuestionHistory.lastResult==='incorrect'` semantics (a question missed once
 * then later answered correctly elsewhere should NOT still show here), without a real endpoint to ask directly.
 */
export async function scanEncounteredQuestions(kind: "bookmarked" | "incorrect"): Promise<EncounteredQuestionsResult> {
  const history = await qbankApi.getTestHistory();
  const reviewable = history
    .filter((s) => s.status === "completed" || s.status === "abandoned")
    .slice(0, ENCOUNTERED_SCAN_SESSION_CAP); // history is already startedAt DESC — most recent first

  const reviews = await Promise.all(
    reviewable.map((s) =>
      qbankApi.getTestReview(s.id).catch((err) => {
        console.warn(`scanEncounteredQuestions: failed to load review for session ${s.id}`, err);
        return null;
      })
    )
  );

  // Tracked independently of the "incorrect" determination below — `isBookmarked` is always live/current on
  // every review response, so ANY occurrence is equally valid (no most-recent-wins needed).
  const bookmarked = new Map<number, Question>();
  // Tracked per-question across ALL scanned sessions (not just ones matching `kind`) so the FIRST occurrence
  // encountered (history is newest-first, so this is the MOST RECENT attempt) wins — a question missed once
  // then later answered correctly in a newer session must NOT still surface as "incorrect" here.
  const latestResultByQuestion = new Map<number, { isCorrect: boolean; question: Question }>();

  for (const review of reviews) {
    if (!review || !review.questions) continue;
    for (const aq of review.questions) {
      if (aq.question.isBookmarked && !bookmarked.has(aq.questionId)) {
        bookmarked.set(aq.questionId, aq.question);
      }
      if (aq.selectedOptionId != null && aq.isCorrect != null && !latestResultByQuestion.has(aq.questionId)) {
        latestResultByQuestion.set(aq.questionId, { isCorrect: aq.isCorrect, question: aq.question });
      }
    }
  }

  const questions =
    kind === "bookmarked"
      ? Array.from(bookmarked.values())
      : Array.from(latestResultByQuestion.values())
          .filter((r) => !r.isCorrect)
          .map((r) => r.question);

  return {
    questions,
    scannedSessionsCount: reviewable.length,
    truncated: history.filter((s) => s.status === "completed" || s.status === "abandoned").length > ENCOUNTERED_SCAN_SESSION_CAP,
  };
}
