import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Award,
  Clock,
  FileQuestion,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  Eye,
  ShieldCheck,
} from "lucide-react";
import { Card, Button, Badge, Modal, Skeleton, EmptyState } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { mockExamsApi } from "../../api/endpoints/mock-exams";
import { ApiError } from "../../api/client";
import { MockExam, TestSession } from "../../types";

type LoadState = "loading" | "error" | "data";

export const MockExamsPage: React.FC = () => {
  const navigate = useNavigate();

  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [historyList, setHistoryList] = useState<TestSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");

  // Modal State
  const [selectedMockForModal, setSelectedMockForModal] = useState<MockExam | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startErrorMsg, setStartErrorMsg] = useState<string | null>(null);

  // 409 ACTIVE_TEST_EXISTS conflict — same "resume or go elsewhere" pattern as CreateTestPage.tsx.
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictTestId, setConflictTestId] = useState<number | null>(null);

  // Accordion State for Expanded History per Mock Exam ID
  const [expandedExamIds, setExpandedExamIds] = useState<number[]>([]);

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      // Real, top-level `GET /mock-exams` (mockExamsApi) — not qbankApi.getMockExams()'s identical-URL
      // duplicate — per this task's explicit brief to use mock-exams.ts's own client. History is a
      // separate real call used only to render each paper's individual past-attempt rows below (the
      // per-exam aggregates themselves — bestScore/attemptsCount — come straight off `mocks`, server-computed).
      const [mocks, history] = await Promise.all([
        mockExamsApi.getMockExams(),
        qbankApi.getTestHistory(),
      ]);
      setMockExams(mocks);
      setHistoryList(history);
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load mock exams data", err);
      setLoadErrorMsg(err?.message || "Failed to load the national mock exam papers.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpandHistory = (examId: number) => {
    setExpandedExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  };

  // Open Instructions Modal
  const handleOpenInstructions = (mock: MockExam) => {
    setSelectedMockForModal(mock);
  };

  // Confirm & Start Mock Exam — the FIXED, admin-configured question paper (server/src/services/
  // mockExamService.js#startMockExam), never the wizard's random-pool createTest() this page used to
  // (mis)use as a workaround before this endpoint existed.
  const handleConfirmStart = async () => {
    if (!selectedMockForModal) return;
    setIsStarting(true);
    setStartErrorMsg(null);

    try {
      const session = await mockExamsApi.startMockExam(selectedMockForModal.id);
      setSelectedMockForModal(null);
      navigate(`/app/qbank/test/${session.id}`);
    } catch (err: any) {
      const apiErr = err as ApiError;
      if (apiErr.code === "ACTIVE_TEST_EXISTS" || apiErr.status === 409) {
        setConflictTestId(apiErr.details?.testId ?? null);
        setSelectedMockForModal(null);
        setConflictModalOpen(true);
      } else if (apiErr.code === "NOT_ENROLLED") {
        setStartErrorMsg("You are not enrolled in a QBank-enabled course for this exam's category.");
      } else if (apiErr.code === "CONFLICT") {
        setStartErrorMsg("This exam paper has no questions configured yet — please check back later.");
      } else {
        setStartErrorMsg(apiErr.message || "Failed to start mock exam session.");
      }
    } finally {
      setIsStarting(false);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="space-y-8 pb-12 max-w-5xl mx-auto">
        <Skeleton variant="text" className="h-8 w-80" />
        <Skeleton variant="card" className="h-56 rounded-2xl" />
        <Skeleton variant="card" className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<AlertCircle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load mock exams"
          description={loadErrorMsg}
          actionLabel="Retry"
          onAction={loadData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">National Grand Mock Examinations</h1>
          <p className="text-xs text-slate-500 mt-1">
            Standardized full-length timed trial papers matching PMDC NRE Step 1, USMLE, SMLE & DHA blueprints.
          </p>
        </div>

        <Badge variant="teal" size="lg" className="font-extrabold uppercase">
          Official Licensing Standards
        </Badge>
      </div>

      {startErrorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {startErrorMsg}
        </div>
      )}

      {mockExams.length === 0 && (
        <EmptyState
          icon={<Award className="w-10 h-10 text-slate-400" />}
          title="No mock exam papers available yet"
          description="Published national grand mock papers for your enrolled QBank-enabled courses will appear here."
        />
      )}

      {/* List of Mock Papers */}
      <div className="space-y-6">
        {mockExams.map((mock) => {
          // Exact match on `mockExamId` — the real session field the server always sets for a
          // mock-mode attempt started via startMockExam (server/src/services/mockExamService.js). Matching
          // on category/mode alone (as this page used to) would double-count attempts across different
          // papers that happen to share an exam category.
          const mockAttempts = historyList.filter((h) => h.mockExamId === mock.id);
          // Server-computed aggregates (mockExamsApi.getMockExams()) are authoritative — never
          // recomputed client-side, matching docs/07_EXECUTION_PLAN.md 7.6's "numbers match server
          // response exactly" precedent.
          const attemptsCount = mock.attemptsCount ?? 0;
          const bestScore = mock.bestScore ?? 0;

          const isExpanded = expandedExamIds.includes(mock.id);

          return (
            <Card key={mock.id} className="p-6 border-slate-200 bg-white rounded-2xl shadow-sm space-y-6">
              {/* Paper Card Top Bar */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="teal" size="sm" className="font-black uppercase">
                      {mock.examCategory} PAPER
                    </Badge>
                    <Badge variant="emerald" size="sm" className="font-bold">
                      STANDARD BLUEPRINT
                    </Badge>
                  </div>
                  <h3 className="text-lg font-black text-[#0E2A47]">{mock.title}</h3>
                  <p className="text-xs text-slate-500 max-w-2xl">
                    Standardized examination block designed to evaluate comprehensive clinical diagnostic readiness under strict timed conditions.
                  </p>
                </div>

                <div className="shrink-0 flex items-center sm:flex-col sm:items-end gap-2">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Exam Length</span>
                  <span className="text-base font-black text-[#0FA3A3] font-mono">
                    {mock.questionsCount} Vignettes
                  </span>
                </div>
              </div>

              {/* Paper Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#0FA3A3]" /> Duration
                  </span>
                  <span className="font-extrabold text-[#0E2A47] text-sm">{mock.durationMinutes} Minutes</span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-emerald-600" /> Pass Threshold
                  </span>
                  <span className="font-extrabold text-emerald-600 text-sm">{mock.passPercent}% Score</span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <FileQuestion className="w-3.5 h-3.5 text-indigo-600" /> Attempts Used
                  </span>
                  <span className="font-extrabold text-indigo-700 text-sm">{attemptsCount} Recorded</span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0FA3A3]" /> Personal Best
                  </span>
                  <span className="font-extrabold text-[#0E2A47] text-sm">
                    {bestScore > 0 ? `${bestScore}%` : "Not Attempted"}
                  </span>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleExpandHistory(mock.id)}
                  icon={isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                >
                  {isExpanded ? "Hide Attempt History" : `View Attempt History (${mockAttempts.length})`}
                </Button>

                <Button
                  variant="teal"
                  size="md"
                  onClick={() => handleOpenInstructions(mock)}
                  icon={<Play className="w-4 h-4" />}
                >
                  Start Timed Mock Paper
                </Button>
              </div>

              {/* Collapsible Attempt History Table */}
              {isExpanded && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="text-xs font-black text-[#0E2A47] uppercase tracking-wider">
                    Past Attempt Logs for {mock.title}
                  </div>

                  {mockAttempts.length === 0 ? (
                    <div className="p-4 bg-slate-50 text-slate-500 text-xs text-center rounded-xl">
                      No previous attempt records found for this mock paper. Click <strong>Start Timed Mock Paper</strong> to take your first trial.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider text-[10px] font-black">
                            <th className="p-3">Session ID</th>
                            <th className="p-3">Completed Date</th>
                            <th className="p-3">Accuracy & Score</th>
                            <th className="p-3">Result</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {mockAttempts.map((att) => {
                            const attScore = att.scorePercent ?? 0;
                            const attPassed = att.passed !== undefined ? att.passed : attScore >= mock.passPercent;

                            return (
                              <tr key={att.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-black text-[#0E2A47]">#{att.id}</td>
                                <td className="p-3 text-slate-500">
                                  {att.completedAt ? new Date(att.completedAt).toLocaleDateString() : "In Progress"}
                                </td>
                                <td className="p-3 font-extrabold text-slate-900">
                                  {attScore}% ({att.correctCount}/{att.questionCount})
                                </td>
                                <td className="p-3">
                                  <Badge variant={attPassed ? "emerald" : "danger"} size="sm">
                                    {attPassed ? "PASS" : "FAIL"}
                                  </Badge>
                                </td>
                                <td className="p-3 text-right">
                                  <Link to={`/app/qbank/review/${att.id}`}>
                                    <Button variant="ghost" size="sm" icon={<Eye className="w-3.5 h-3.5" />}>
                                      Review Answers
                                    </Button>
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Instructions & Rules Modal */}
      <Modal
        isOpen={selectedMockForModal !== null}
        onClose={() => setSelectedMockForModal(null)}
        title="Mock Exam Rules & Instructions"
        size="md"
      >
        {selectedMockForModal && (
          <div className="space-y-6 text-xs text-slate-700">
            {/* Modal Subtitle Header */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[10px] font-black uppercase text-[#0FA3A3]">
                {selectedMockForModal.examCategory} Standardized Examination
              </span>
              <h4 className="text-sm font-black text-[#0E2A47]">{selectedMockForModal.title}</h4>
            </div>

            {/* Rules Checklist */}
            <div className="space-y-3">
              <span className="text-[11px] font-black uppercase text-slate-400 block tracking-wider">
                Examination Conditions & Policy
              </span>

              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <Clock className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-slate-900 block">
                      Strict Timed Window ({selectedMockForModal.durationMinutes} Minutes)
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      The countdown timer begins immediately upon starting. Unanswered questions at 00:00 will be marked as skipped.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-slate-900 block">End-of-Exam Clinical Explanations</span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Correct options and diagnostic rationales are strictly hidden during the exam run and unlocked upon submission.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <Award className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-slate-900 block">
                      National Passing Mark: {selectedMockForModal.passPercent}%
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      A score of at least {selectedMockForModal.passPercent}% is required to earn a PASS mark on your diagnostic report.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block">Single Active Window Session</span>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      Do not open secondary windows or refresh repeatedly. Your progress is continuously synchronized.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" size="md" onClick={() => setSelectedMockForModal(null)}>
                Cancel
              </Button>

              <Button
                variant="teal"
                size="md"
                isLoading={isStarting}
                onClick={handleConfirmStart}
                icon={<Play className="w-4 h-4" />}
              >
                I Understand, Start Mock
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 409 ACTIVE_TEST_EXISTS Conflict Modal — mirrors CreateTestPage.tsx's identical real-endpoint case */}
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
            <h3 className="text-lg font-black text-[#0E2A47]">Unfinished Test Session Detected</h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
              You already have an active test block{conflictTestId ? ` (Session #${conflictTestId})` : ""} in
              progress. Only one active test block can exist at a time — finish or abandon it before starting
              this mock exam.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Button
              variant="teal"
              size="md"
              fullWidth
              disabled={!conflictTestId}
              onClick={() => conflictTestId && navigate(`/app/qbank/session/${conflictTestId}`)}
              icon={<Play className="w-4 h-4 fill-current" />}
            >
              Resume Active Test
            </Button>
            <Button variant="ghost" size="md" fullWidth onClick={() => setConflictModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
