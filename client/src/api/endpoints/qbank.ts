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

export const qbankApi = {
  async getMeta() {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return {
        categories: ["NRE1", "USMLE1", "USMLE2CK", "SMLE", "DHA", "PROMETRIC", "MBBS"],
        subjects: MOCK_SUBJECTS,
        systems: MOCK_SYSTEMS,
        poolsCount: {
          all: MOCK_QUESTIONS.length,
          unused: 45,
          incorrect: 12,
          bookmarked: 8,
        },
      };
    }
    return apiFetch<any>("/qbank/meta");
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

  async answerQuestion(testId: number, data: { questionId: number; optionId?: number; timeSpent: number; flagged?: boolean; skipSimulatedFailure?: boolean }) {
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
          qItem.selectedOptionId = data.optionId;
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
    return apiFetch<any>(`/qbank/tests/${testId}/answer`, {
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

  async toggleQuestionBookmark(questionId: number) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 150);
      return { isBookmarked: true };
    }
    return apiFetch<{ isBookmarked: boolean }>(`/qbank/questions/${questionId}/bookmark`, { method: "POST" });
  },

  async getAnalytics() {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      return {
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
    return apiFetch<any>("/qbank/analytics");
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
