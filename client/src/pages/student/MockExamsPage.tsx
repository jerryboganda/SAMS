import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Award,
  Clock,
  FileQuestion,
  Play,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { Card, Button, Badge, Modal } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { MockExam, TestSession } from "../../types";

export const MockExamsPage: React.FC = () => {
  const navigate = useNavigate();

  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [historyList, setHistoryList] = useState<TestSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [selectedMockForModal, setSelectedMockForModal] = useState<MockExam | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Accordion State for Expanded History per Mock Exam ID
  const [expandedExamIds, setExpandedExamIds] = useState<number[]>([]);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [mocks, history] = await Promise.all([
          qbankApi.getMockExams(),
          qbankApi.getTestHistory(),
        ]);
        setMockExams(mocks);
        setHistoryList(history);
      } catch (err) {
        console.error("Failed to load mock exams data", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const toggleExpandHistory = (examId: number) => {
    setExpandedExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  };

  // Open Instructions Modal
  const handleOpenInstructions = (mock: MockExam) => {
    setSelectedMockForModal(mock);
  };

  // Confirm & Start Mock Exam
  const handleConfirmStart = async () => {
    if (!selectedMockForModal) return;
    setIsStarting(true);

    try {
      const session = await qbankApi.createTest({
        examCategory: selectedMockForModal.examCategory,
        mode: "mock",
        pool: "all",
        count: selectedMockForModal.questionsCount,
        timed: true,
        timeLimitSeconds: selectedMockForModal.durationMinutes * 60,
      });

      setSelectedMockForModal(null);
      navigate(`/app/qbank/test/${session.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to start mock exam session.");
    } finally {
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center space-y-3 max-w-xl mx-auto">
        <div className="w-10 h-10 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-500">Loading National Grand Mock Exam Papers...</p>
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

      {/* List of Mock Papers */}
      <div className="space-y-6">
        {mockExams.map((mock) => {
          // Filter history attempts matching this mock paper category or mode="mock"
          const mockAttempts = historyList.filter(
            (h) => h.mode === "mock" || h.examCategory === mock.examCategory
          );
          const attemptsCount = mockAttempts.length || mock.attemptsCount || 0;

          // Best Score calculation
          const scores = mockAttempts
            .map((h) => h.scorePercent ?? 0)
            .concat(mock.bestScore ? [mock.bestScore] : []);
          const bestScore = scores.length > 0 ? Math.max(...scores) : 0;

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
    </div>
  );
};
