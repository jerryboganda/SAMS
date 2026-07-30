import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Play,
  PlusCircle,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileQuestion,
  Bookmark,
  Zap,
  BarChart2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card, Button, Badge, Table, Skeleton } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { TestSession } from "../../types";

export const QBankPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [metaCounts, setMetaCounts] = useState<{
    all: number;
    unused: number;
    incorrect: number;
    bookmarked: number;
  }>({ all: 64, unused: 45, incorrect: 12, bookmarked: 13 });

  const [testHistory, setTestHistory] = useState<TestSession[]>([]);
  const [activeTest, setActiveTest] = useState<TestSession | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "completed" | "in_progress" | "abandoned">("all");

  const loadQBankHubData = async () => {
    setIsLoading(true);
    try {
      const [meta, history] = await Promise.all([
        qbankApi.getMeta(),
        qbankApi.getTestHistory(),
      ]);

      if (meta?.poolsCount) {
        setMetaCounts(meta.poolsCount);
      }

      setTestHistory(history || []);

      // Check active test in progress
      const active = history.find((t) => t.status === "in_progress");
      if (active) {
        setActiveTest(active);
      } else {
        // Also check localStorage fallback
        const localJson = localStorage.getItem("sams_mock_active_test");
        if (localJson) {
          try {
            const localSession: TestSession = JSON.parse(localJson);
            if (localSession && localSession.status === "in_progress") {
              setActiveTest(localSession);
            } else {
              setActiveTest(null);
            }
          } catch {
            setActiveTest(null);
          }
        } else {
          setActiveTest(null);
        }
      }
    } catch (err) {
      console.error("Failed to load QBank Hub data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQBankHubData();
  }, []);

  const handleAbandonActiveTest = async (testId: number) => {
    if (!confirm("Are you sure you want to abandon this test block? Your current responses will be saved to historical statistics.")) {
      return;
    }
    try {
      await qbankApi.abandonTest(testId);
      setActiveTest(null);
      loadQBankHubData();
    } catch (err: any) {
      alert(err.message || "Failed to abandon test block.");
    }
  };

  const filteredHistory = testHistory.filter((t) => {
    if (historyFilter === "all") return true;
    return t.status === historyFilter;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">NRE & Licensing QBank Hub</h1>
          <p className="text-xs text-slate-500 mt-1">
            Access over 3,000 high-yield medical vignettes, configure custom practice blocks, and review performance analytics.
          </p>
        </div>

        {/* Primary CTA Button */}
        <Link to="/app/qbank/new">
          <Button variant="teal" size="lg" icon={<PlusCircle className="w-5 h-5" />}>
            Create New Test Block
          </Button>
        </Link>
      </div>

      {/* Header Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200 bg-white space-y-1.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <FileQuestion className="w-4 h-4 text-[#0FA3A3]" /> Total Answered
          </span>
          <div className="text-2xl font-black text-[#0E2A47]">420</div>
          <span className="text-[10px] text-emerald-600 font-bold">+28 questions this week</span>
        </Card>

        <Card className="p-4 border-slate-200 bg-white space-y-1.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-[#0FA3A3]" /> Overall Accuracy
          </span>
          <div className="text-2xl font-black text-[#0E2A47]">76.4%</div>
          <span className="text-[10px] text-emerald-600 font-bold">Above NRE Step 1 Pass Mark (60%)</span>
        </Card>

        <Card className="p-4 border-slate-200 bg-white space-y-1.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-amber-500" /> Unused Questions
          </span>
          <div className="text-2xl font-black text-[#0E2A47]">{metaCounts.unused}</div>
          <span className="text-[10px] text-slate-400 font-medium">Ready for new practice blocks</span>
        </Card>

        <Card className="p-4 border-slate-200 bg-white space-y-1.5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-[#0FA3A3]" /> Bookmarked
          </span>
          <div className="text-2xl font-black text-[#0E2A47]">{metaCounts.bookmarked}</div>
          <span className="text-[10px] text-[#0FA3A3] font-bold">High-yield saved vignettes</span>
        </Card>
      </div>

      {/* Active In-Progress Test Resume Banner */}
      {activeTest && (
        <Card className="p-5 border-2 border-amber-300 bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-white rounded-2xl shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="warning" size="sm" className="font-extrabold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> TEST IN PROGRESS
                </Badge>
                <span className="text-xs font-mono font-bold text-slate-500">
                  Block #{activeTest.id} • Started {new Date(activeTest.startedAt).toLocaleTimeString()}
                </span>
              </div>

              <h3 className="text-lg font-black text-[#0E2A47]">
                You have an unfinished {activeTest.mode} test block
              </h3>

              <p className="text-xs text-slate-600">
                Exam Category: <strong className="text-[#0E2A47]">{activeTest.examCategory}</strong> | Questions:{" "}
                <strong className="text-[#0E2A47]">{activeTest.questionCount} Questions</strong> | Mode:{" "}
                <strong className="text-[#0E2A47] capitalize">{activeTest.mode}</strong>
              </p>
            </div>

            {/* Resume / Abandon Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="teal"
                size="md"
                onClick={() => navigate(`/app/qbank/session/${activeTest.id}`)}
                icon={<Play className="w-4 h-4 fill-current" />}
              >
                Resume Test Block
              </Button>

              <Button
                variant="outline"
                size="md"
                onClick={() => handleAbandonActiveTest(activeTest.id)}
                icon={<XCircle className="w-4 h-4 text-rose-500" />}
              >
                Abandon
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Launch Shortcuts Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#0E2A47]">Quick Launch Question Pools</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/app/qbank/new?pool=incorrect">
            <Card className="p-4 border-slate-200 hover:border-rose-400 transition-all hover:shadow-md cursor-pointer space-y-2 group bg-white rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                  <XCircle className="w-4 h-4" />
                </div>
                <Badge variant="danger" size="sm">
                  {metaCounts.incorrect} Available
                </Badge>
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-[#0E2A47] group-hover:text-rose-600 transition-colors">
                  Incorrect Questions
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Target & retest previously missed clinical vignettes.
                </p>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-bold text-rose-600 pt-1">
                <span>Start Review Block</span> <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Card>
          </Link>

          <Link to="/app/qbank/new?pool=bookmarked">
            <Card className="p-4 border-slate-200 hover:border-[#0FA3A3] transition-all hover:shadow-md cursor-pointer space-y-2 group bg-white rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center font-bold">
                  <Bookmark className="w-4 h-4" />
                </div>
                <Badge variant="teal" size="sm">
                  {metaCounts.bookmarked} Bookmarked
                </Badge>
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-[#0E2A47] group-hover:text-[#0FA3A3] transition-colors">
                  Bookmarked Vignettes
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review questions flagged during previous practice sessions.
                </p>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-bold text-[#0FA3A3] pt-1">
                <span>Practice Bookmarks</span> <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Card>
          </Link>

          <Link to="/app/qbank/new?pool=unused">
            <Card className="p-4 border-slate-200 hover:border-emerald-400 transition-all hover:shadow-md cursor-pointer space-y-2 group bg-white rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <Badge variant="emerald" size="sm">
                  {metaCounts.unused} Unused
                </Badge>
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-[#0E2A47] group-hover:text-emerald-600 transition-colors">
                  Unused Questions
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fresh high-yield questions you have not answered yet.
                </p>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 pt-1">
                <span>Launch Unused Block</span> <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Card>
          </Link>

          <Link to="/app/qbank/new?pool=all">
            <Card className="p-4 border-slate-200 hover:border-slate-400 transition-all hover:shadow-md cursor-pointer space-y-2 group bg-white rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#0E2A47] flex items-center justify-center font-bold">
                  <Zap className="w-4 h-4 text-[#0FA3A3]" />
                </div>
                <Badge variant="navy" size="sm">
                  {metaCounts.all} Total
                </Badge>
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-[#0E2A47] group-hover:text-[#0FA3A3] transition-colors">
                  Custom Test Block
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure custom parameters across all subjects & systems.
                </p>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-bold text-[#0E2A47] pt-1">
                <span>Configure Custom</span> <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Card>
          </Link>
        </div>
      </div>

      {/* Previous Tests Table Section */}
      <Card className="p-6 border-slate-200 space-y-4 bg-white rounded-2xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-[#0E2A47]">Previous Test Blocks History</h3>

          {/* History Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {[
              { id: "all", label: "All Tests" },
              { id: "completed", label: "Completed" },
              { id: "in_progress", label: "In Progress" },
              { id: "abandoned", label: "Abandoned" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  historyFilter === f.id
                    ? "bg-[#0E2A47] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* History Table */}
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <FileQuestion className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500 font-semibold">No test blocks found for this filter.</p>
            <Link to="/app/qbank/new">
              <Button variant="teal" size="sm" className="mt-2">
                Create Your First Test Block
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider font-extrabold">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Category & Mode</th>
                  <th className="py-3 px-3">Questions</th>
                  <th className="py-3 px-3">Score / Accuracy</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((test) => {
                  const isCompleted = test.status === "completed";
                  const isInProgress = test.status === "in_progress";

                  return (
                    <tr key={test.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-700">
                        {new Date(test.startedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-extrabold text-[#0E2A47]">{test.examCategory}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{test.mode} Mode</div>
                      </td>

                      <td className="py-3 px-3 font-bold text-slate-700">
                        {test.questionCount} Questions
                      </td>

                      <td className="py-3 px-3">
                        {isCompleted && test.scorePercent !== undefined ? (
                          <Badge
                            variant={test.scorePercent >= 60 ? "emerald" : "danger"}
                            size="sm"
                            className="font-bold"
                          >
                            {test.scorePercent}%
                          </Badge>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {isCompleted && <Badge variant="emerald" size="sm">Completed</Badge>}
                        {isInProgress && <Badge variant="warning" size="sm">In Progress</Badge>}
                        {test.status === "abandoned" && <Badge variant="neutral" size="sm">Abandoned</Badge>}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {isCompleted ? (
                          <Link
                            to={`/app/qbank/results/${test.id}`}
                            className="inline-flex items-center gap-1 font-bold text-[#0FA3A3] hover:underline"
                          >
                            Review <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : isInProgress ? (
                          <Link
                            to={`/app/qbank/session/${test.id}`}
                            className="inline-flex items-center gap-1 font-bold text-amber-600 hover:underline"
                          >
                            Resume <Play className="w-3.5 h-3.5 fill-current" />
                          </Link>
                        ) : (
                          <Link
                            to={`/app/qbank/results/${test.id}`}
                            className="inline-flex items-center gap-1 font-semibold text-slate-400 hover:text-slate-600"
                          >
                            View Summary
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
