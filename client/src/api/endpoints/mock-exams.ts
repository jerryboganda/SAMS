import { CONFIG } from "../../config";
import { apiFetch, mockLatency } from "../client";
import { MockExam, TestSession } from "../../types";
import { MOCK_EXAM_PAPER } from "../../mock-data";
import { qbankApi } from "./qbank";

export const mockExamsApi = {
  async getMockExams(): Promise<MockExam[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return [MOCK_EXAM_PAPER];
    }
    return apiFetch<MockExam[]>("/mock-exams");
  },

  async startMockExam(mockExamId: number): Promise<TestSession> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 450);
      return qbankApi.createTest({
        examCategory: "NRE1",
        count: MOCK_EXAM_PAPER.questionsCount,
        mode: "mock",
        timed: true,
        timeLimitSeconds: MOCK_EXAM_PAPER.durationMinutes * 60,
        pool: "all",
      });
    }
    return apiFetch<TestSession>(`/mock-exams/${mockExamId}/start`, { method: "POST" });
  },
};
