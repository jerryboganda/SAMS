import React, { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, Play, Trash2, CheckCircle2, Info, AlertCircle, AlertTriangle } from "lucide-react";
import { Card, Button, Badge, Drawer, Skeleton, EmptyState } from "../../components/ui";
import { qbankApi, scanEncounteredQuestions } from "../../api/endpoints/qbank";
import { ApiError } from "../../api/client";
import { Question, ExamCategory } from "../../types";

type LoadState = "loading" | "error" | "data";

export const BookmarksPage: React.FC = () => {
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");
  const [bookmarkedList, setBookmarkedList] = useState<Question[]>([]);
  const [scanTruncated, setScanTruncated] = useState(false);
  const [authoritativeCount, setAuthoritativeCount] = useState<number | null>(null);

  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const [isStartingPractice, setIsStartingPractice] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [conflictTestId, setConflictTestId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const [meta, scan] = await Promise.all([qbankApi.getMeta(), scanEncounteredQuestions("bookmarked")]);
      setAuthoritativeCount(meta.poolsCount.bookmarked);
      setBookmarkedList(scan.questions);
      setScanTruncated(scan.truncated);
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load bookmarks", err);
      setLoadErrorMsg(err?.message || "Failed to load your bookmarked questions.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInspectQuestion = (question: Question) => {
    setSelectedQuestion(question);
    setIsDrawerOpen(true);
  };

  const handleRemoveBookmark = async (questionId: number) => {
    setRemovingId(questionId);
    try {
      await qbankApi.setQuestionBookmark(questionId, false);
      setBookmarkedList((prev) => prev.filter((q) => q.id !== questionId));
      setAuthoritativeCount((prev) => (prev != null ? Math.max(0, prev - 1) : prev));
      if (selectedQuestion?.id === questionId) {
        setIsDrawerOpen(false);
        setSelectedQuestion(null);
      }
    } catch (err) {
      console.error("Failed to remove bookmark", err);
    } finally {
      setRemovingId(null);
    }
  };

  // "One-click" practice: only truly one-click when every recovered bookmark shares a single exam category
  // (createTest requires exactly one) — otherwise falls back to the wizard, pre-filtered, for the student to
  // pick a category themselves rather than guessing wrong.
  const handlePracticeBookmarks = async () => {
    setPracticeError(null);
    setConflictTestId(null);
    const distinctCategories = Array.from(new Set(bookmarkedList.map((q) => q.examCategory)));
    if (distinctCategories.length !== 1) {
      navigate("/app/qbank/new?pool=bookmarked");
      return;
    }
    const examCategory = distinctCategories[0] as ExamCategory;
    const count = Math.min(200, bookmarkedList.length);
    if (count < 5) {
      navigate("/app/qbank/new?pool=bookmarked");
      return;
    }

    setIsStartingPractice(true);
    try {
      const session = await qbankApi.createTest({
        examCategory,
        pool: "bookmarked",
        mode: "practice",
        timed: false,
        count,
      });
      navigate(`/app/qbank/session/${session.id}`);
    } catch (err: any) {
      const apiErr = err as ApiError;
      if (apiErr.code === "ACTIVE_TEST_EXISTS" || apiErr.status === 409) {
        setConflictTestId(apiErr.details?.testId ?? null);
        setPracticeError("You already have an active test block in progress.");
      } else if (apiErr.code === "INSUFFICIENT_QUESTIONS") {
        // The live server count moved since this page loaded (e.g. a bookmark was removed elsewhere) — send
        // the student to the wizard instead of guessing at a smaller number ourselves.
        navigate("/app/qbank/new?pool=bookmarked");
      } else {
        setPracticeError(apiErr.message || "Failed to start a practice block from your bookmarks.");
      }
    } finally {
      setIsStartingPractice(false);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="space-y-8 pb-12 max-w-6xl mx-auto">
        <Skeleton variant="text" className="h-8 w-80" />
        <Skeleton variant="card" className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <EmptyState
          icon={<AlertCircle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load your bookmarks"
          description={loadErrorMsg}
          actionLabel="Retry"
          onAction={loadData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">Saved Vignettes & Bookmarks</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review clinical vignettes saved during practice sessions for rapid pre-exam revision.
          </p>
        </div>

        <Button
          variant="teal"
          size="md"
          disabled={bookmarkedList.length === 0 || isStartingPractice}
          isLoading={isStartingPractice}
          onClick={handlePracticeBookmarks}
          icon={<Play className="w-4 h-4" />}
        >
          Practice Bookmarks ({authoritativeCount ?? bookmarkedList.length})
        </Button>
      </div>

      {practiceError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {practiceError}
          </span>
          {conflictTestId && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/app/qbank/session/${conflictTestId}`)}>
              Resume Active Test
            </Button>
          )}
        </div>
      )}

      {/* Gap disclosure: no dedicated bookmarks-listing endpoint exists yet (see DECISIONS.md) — this list is
          reconstructed from the student's own completed/abandoned test history + review responses. */}
      <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-[11px] text-teal-900 font-semibold flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#0FA3A3]" />
        <span>
          Showing bookmarks recovered from your completed/abandoned test history{scanTruncated ? " (most recent sessions only)" : ""}.
          Bookmarks made during a test still in progress will appear here once that test is completed. The authoritative
          count above ({authoritativeCount ?? "—"}) always reflects the server's real total, even if the list below can't
          show every one of them yet.
        </span>
      </div>

      {/* Empty State */}
      {bookmarkedList.length === 0 ? (
        <Card className="p-12 text-center space-y-4 border-slate-200 bg-white rounded-2xl shadow-xs">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Bookmark className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-[#0E2A47]">No Bookmarked Questions Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Flag or bookmark challenging questions during QBank tests to revisit their clinical explanations here.
            </p>
          </div>
          <Link to="/app/qbank/new">
            <Button variant="outline" size="sm" className="mt-2">
              Start a New Test Block
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="border-slate-200 overflow-hidden bg-white rounded-2xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider text-[11px] font-black">
                  <th className="p-4">Clinical Vignette Preview</th>
                  <th className="p-4">Subject & System</th>
                  <th className="p-4">Difficulty</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {bookmarkedList.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 max-w-md">
                      <p className="font-semibold text-slate-900 line-clamp-2 leading-relaxed">{q.stem}</p>
                    </td>
                    <td className="p-4">
                      <div className="space-y-1">
                        <Badge variant="teal" size="sm" className="font-extrabold">
                          {q.subjectName}
                        </Badge>
                        <div className="text-[11px] text-slate-500">{q.systemName}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={q.difficulty === "easy" ? "emerald" : q.difficulty === "hard" ? "danger" : "warning"} size="sm">
                        {q.difficulty.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleInspectQuestion(q)}>
                        View Vignette
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        isLoading={removingId === q.id}
                        onClick={() => handleRemoveBookmark(q.id)}
                        icon={<Trash2 className="w-4 h-4" />}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Side-Peek Drawer showing Full Question + Explanation */}
      <Drawer isOpen={isDrawerOpen && selectedQuestion !== null} onClose={() => setIsDrawerOpen(false)} title="Bookmarked Vignette Inspector" position="right">
        {selectedQuestion && (
          <div className="space-y-6 text-xs p-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Badge variant="teal" size="md">
                  {selectedQuestion.subjectName}
                </Badge>
                <span className="font-bold text-slate-600">{selectedQuestion.systemName}</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:bg-rose-50"
                isLoading={removingId === selectedQuestion.id}
                onClick={() => handleRemoveBookmark(selectedQuestion.id)}
                icon={<Trash2 className="w-4 h-4" />}
              >
                Remove
              </Button>
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Vignette Stem</span>
              <p className="text-sm font-medium text-slate-800 leading-relaxed font-sans">{selectedQuestion.stem}</p>
              {selectedQuestion.imageUrl && (
                <img src={selectedQuestion.imageUrl} alt="Clinical Specimen" className="rounded-xl border border-slate-200 max-h-52 object-cover shadow-xs" />
              )}
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Options & Correct Choice</span>
              {selectedQuestion.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                return (
                  <div
                    key={opt.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                      opt.isCorrect ? "bg-emerald-50 border-emerald-500 font-extrabold text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-600 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center shrink-0 border ${
                          opt.isCorrect ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-200 text-slate-600 border-slate-300"
                        }`}
                      >
                        {letter}
                      </div>
                      <span>{opt.optionText}</span>
                    </div>
                    {opt.isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-extrabold text-[#0E2A47] text-xs">Clinical Rationale</div>
              <p className="text-slate-700 leading-relaxed font-normal">{selectedQuestion.explanation || "No explanation provided."}</p>
              {selectedQuestion.referenceText && (
                <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-200">Ref: {selectedQuestion.referenceText}</p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
