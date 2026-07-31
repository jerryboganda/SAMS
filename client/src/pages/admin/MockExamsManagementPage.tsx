import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Clock,
  ListOrdered,
  Search,
  ArrowUp,
  ArrowDown,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { Card, Button, Input, Table, Badge, Modal, Toast, ConfirmDialog } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { ApiError } from "../../api/client";
import { MockExam, Question, ExamCategory } from "../../types";
import { useAdminSearch } from "../../context/AdminSearchContext";

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export const MockExamsManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [exams, setExams] = useState<MockExam[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // `GET /admin/questions` is the Phase 11.3 admin Question Bank endpoint — not yet built as of this
  // task (docs/07_EXECUTION_PLAN.md 11.3 is unchecked; confirmed 404 against the real server, no route
  // registered under routes/v1/admin/*). Tracked separately from the mock-exam list load so a missing
  // question browser never takes down mock exam CRUD/publish/delete, which have nothing to do with it.
  const [questionsLoadErrorMsg, setQuestionsLoadErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "danger" | "warning" | "info">("success");

  const showToast = (message: string, type: "success" | "danger" | "warning" | "info" = "success") => {
    setToastType(type);
    setToastMessage(message);
  };

  const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof ApiError) {
      const details = err.details as { missingIds?: number[]; inactiveIds?: number[] } | undefined;
      const parts: string[] = [];
      if (details?.missingIds?.length) parts.push(`unknown: #${details.missingIds.join(", #")}`);
      if (details?.inactiveIds?.length) parts.push(`inactive: #${details.inactiveIds.join(", #")}`);
      return parts.length > 0 ? `${err.message} (${parts.join("; ")})` : err.message || fallback;
    }
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  };

  // Builder Modal State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<MockExam | null>(null);
  const [activeTab, setActiveTab] = useState<"settings" | "picker" | "preview">("settings");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingQuestionIds, setIsLoadingQuestionIds] = useState(false);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExamCategory>("NRE1");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [passPercent, setPassPercent] = useState("60");
  const [isPublished, setIsPublished] = useState(true);

  // Question Picker State
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  // The paper's question set exactly as it was last persisted — lets Save skip the
  // (min-1-required, audit-logged) PUT .../questions call entirely when the admin never touched
  // the sequence, rather than resending an unchanged list on every settings-only edit.
  const [originalQuestionIds, setOriginalQuestionIds] = useState<number[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSubject, setPickerSubject] = useState("all");

  // Delete confirmation
  const [examToDelete, setExamToDelete] = useState<MockExam | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const eData = await adminApi.getMockExams();
      setExams(eData);
    } catch (err) {
      console.error(err);
      showToast(describeError(err, "Failed to load mock exam papers."), "danger");
    } finally {
      setIsLoading(false);
    }

    // Independent try/catch: the QBank question browser being unavailable must never block the mock
    // exam list/CRUD/publish/delete above from working.
    try {
      const qData = await adminApi.getQuestions();
      setAllQuestions(qData);
      setQuestionsLoadErrorMsg(null);
    } catch (err) {
      console.error("Failed to load question bank for the mock exam picker", err);
      setQuestionsLoadErrorMsg(
        describeError(err, "The QBank question browser isn't available yet (Phase 11.3 — admin question bank management — hasn't shipped).")
      );
      setAllQuestions([]);
    }
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenBuilder = async (exam?: MockExam) => {
    setSaveErrorMsg(null);
    if (exam) {
      setEditingExam(exam);
      setTitle(exam.title);
      setCategory(exam.examCategory);
      setDurationMinutes(String(exam.durationMinutes));
      setPassPercent(String(exam.passPercent));
      setIsPublished(exam.isPublished);
      setSelectedQuestionIds([]);
      setOriginalQuestionIds([]);
      setActiveTab("settings");
      setIsBuilderOpen(true);

      // The list row doesn't carry the full ordered question-id sequence — only the single-resource
      // GET does (server/src/services/adminMockExamService.js#getMockExamById) — so fetch it before the
      // picker tab has anything real to show.
      setIsLoadingQuestionIds(true);
      try {
        const detail = await adminApi.getMockExamById(exam.id);
        const ids = detail.questionIds || [];
        setSelectedQuestionIds(ids);
        setOriginalQuestionIds(ids);
      } catch (err) {
        showToast(describeError(err, "Failed to load this paper's question sequence."), "danger");
      } finally {
        setIsLoadingQuestionIds(false);
      }
    } else {
      setEditingExam(null);
      setTitle("");
      setCategory("NRE1");
      setDurationMinutes("60");
      setPassPercent("60");
      setIsPublished(true);
      setSelectedQuestionIds([]);
      setOriginalQuestionIds([]);
      setActiveTab("settings");
      setIsBuilderOpen(true);
    }
  };

  const handleToggleQuestionInPaper = (qId: number) => {
    if (selectedQuestionIds.includes(qId)) {
      setSelectedQuestionIds(selectedQuestionIds.filter((id) => id !== qId));
    } else {
      setSelectedQuestionIds([...selectedQuestionIds, qId]);
    }
  };

  const handleMoveQuestionInPaper = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === selectedQuestionIds.length - 1)) return;
    const newArr = [...selectedQuestionIds];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const temp = newArr[index];
    newArr[index] = newArr[targetIdx];
    newArr[targetIdx] = temp;
    setSelectedQuestionIds(newArr);
  };

  const handleSaveMockExam = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) {
      setSaveErrorMsg("Exam paper title is required.");
      setActiveTab("settings");
      return;
    }

    setIsSaving(true);
    setSaveErrorMsg(null);
    try {
      const payload = {
        title: title.trim(),
        examCategory: category,
        durationMinutes: Number(durationMinutes),
        passPercent: Number(passPercent),
        isPublished,
      };

      let saved: MockExam = editingExam
        ? await adminApi.updateMockExam(editingExam.id, payload)
        : await adminApi.createMockExam(payload);

      // PUT /admin/mock-exams/:id/questions is a full-replace, transactional call that requires >=1
      // question and audit-logs every call — only invoke it when there's something to save AND the
      // sequence actually changed since it was loaded (skips a redundant call/audit row on a
      // settings-only edit).
      const questionsChanged = !editingExam || !arraysEqual(originalQuestionIds, selectedQuestionIds);
      if (selectedQuestionIds.length > 0 && questionsChanged) {
        saved = await adminApi.replaceMockExamQuestions(saved.id, selectedQuestionIds);
      }

      showToast(
        `Grand Mock Exam "${saved.title}" ${editingExam ? "updated" : "created"}${
          selectedQuestionIds.length === 0 ? " — add questions before publishing to students." : "."
        }`,
        "success"
      );
      setIsBuilderOpen(false);
      await loadData();
    } catch (err) {
      setSaveErrorMsg(describeError(err, "Failed to save mock exam paper."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublished = async (exam: MockExam) => {
    const newStatus = !exam.isPublished;
    try {
      const updated = newStatus ? await adminApi.publishMockExam(exam.id) : await adminApi.unpublishMockExam(exam.id);
      setExams((prev) => prev.map((e) => (e.id === exam.id ? updated : e)));
      showToast(`"${exam.title}" is now ${newStatus ? "LIVE (published)" : "a Draft"}.`, "success");
    } catch (err) {
      showToast(describeError(err, "Failed to update publish status."), "danger");
    }
  };

  const handleDeleteExam = async () => {
    if (!examToDelete) return;
    setIsDeleting(true);
    try {
      await adminApi.deleteMockExam(examToDelete.id);
      setExams((prev) => prev.filter((e) => e.id !== examToDelete.id));
      showToast(`Mock exam paper "${examToDelete.title}" deleted.`, "success");
      setExamToDelete(null);
    } catch (err) {
      // 409 CONFLICT (real recorded student attempts exist — unpublish instead) surfaces here; dialog
      // stays open so the admin can read the reason, same convention as CoursesManagementPage's delete.
      showToast(describeError(err, "Failed to delete mock exam paper."), "danger");
    } finally {
      setIsDeleting(false);
    }
  };

  // Only real, ACTIVE questions IN this paper's exam category are offerable — matches what
  // replaceMockExamQuestions will actually accept (inactive ids 422) and keeps a paper coherent to one
  // exam blueprint.
  const filteredPoolQuestions = allQuestions.filter((q) => {
    if (!q.isActive) return false;
    if (q.examCategory !== category) return false;
    if (pickerSubject !== "all" && q.subjectName !== pickerSubject) return false;
    if (pickerSearch.trim()) {
      const qText = `${q.stem} ${q.id}`.toLowerCase();
      if (!qText.includes(pickerSearch.toLowerCase())) return false;
    }
    return true;
  });

  // Falls back to a placeholder stub (never drops the id) when the question bank browser is unavailable
  // or a specific id just isn't in the loaded catalog — `selectedQuestionIds` (not this derived array) is
  // the actual source of truth sent to replaceMockExamQuestions, so a real already-configured sequence
  // must stay fully visible/reorderable/removable even when full question content can't be resolved.
  const selectedQuestions = selectedQuestionIds.map(
    (id) =>
      allQuestions.find((q) => q.id === id) || {
        id,
        examCategory: category,
        subjectId: 0,
        systemId: 0,
        stem: questionsLoadErrorMsg ? "(question details unavailable — QBank browser offline)" : "(unknown question)",
        options: [],
        difficulty: "medium" as const,
        isActive: true,
      }
  );
  const hasInactiveSelected = selectedQuestions.some((q) => !q.isActive);

  // Subject filter options scoped to this paper's category + active-only pool — never a raw taxonomy
  // list that would offer subjects with zero eligible questions to pick from.
  const pickerSubjectOptions = Array.from(
    new Set(
      allQuestions
        .filter((q) => q.isActive && q.examCategory === category && q.subjectName)
        .map((q) => q.subjectName as string)
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredExams = exams.filter((e) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.examCategory.toLowerCase().includes(q) ||
      String(e.id).includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}

      {/* Header Bar */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Grand Mock Exam Papers</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure full timed exam papers, national benchmark tests, passing thresholds, and question sequences.
          </p>
        </div>
        <Button variant="teal" icon={<Plus className="w-4 h-4" />} onClick={() => handleOpenBuilder()}>
          Create Mock Exam Paper
        </Button>
      </div>

      {/* Mock Exams Table */}
      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "Exam Paper Title",
              accessor: (e) => (
                <div>
                  <span className="font-extrabold text-sm text-[#0E2A47] block">{e.title}</span>
                  <span className="text-[10px] text-slate-400">Fixed Sequence Paper • ID: #{e.id}</span>
                </div>
              ),
            },
            {
              header: "Category",
              accessor: (e) => <Badge variant="teal" size="sm">{e.examCategory}</Badge>,
            },
            {
              header: "Questions",
              accessor: (e) => (
                <span className={`font-bold text-xs ${e.questionsCount === 0 ? "text-rose-600" : "text-slate-700"}`}>
                  {e.questionsCount} Question{e.questionsCount === 1 ? "" : "s"}
                  {e.questionsCount === 0 ? " (not ready)" : ""}
                </span>
              ),
            },
            {
              header: "Time Limit",
              accessor: (e) => (
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> {e.durationMinutes} mins
                </span>
              ),
            },
            {
              header: "Passing Standard",
              accessor: (e) => <span className="font-extrabold text-xs text-emerald-600">{e.passPercent}% Score</span>,
            },
            {
              header: "Status",
              accessor: (e) => (
                <button
                  onClick={() => handleTogglePublished(e)}
                  className="flex items-center gap-1.5 focus:outline-none group"
                  title="Click to toggle live/draft"
                >
                  <Badge variant={e.isPublished ? "success" : "neutral"} size="sm">
                    {e.isPublished ? "Published (Live)" : "Draft"}
                  </Badge>
                </button>
              ),
            },
            {
              header: "Actions",
              accessor: (e) => (
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="outline" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => handleOpenBuilder(e)}>
                    Builder & Sequence
                  </Button>
                  <Button size="xs" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setExamToDelete(e)}>
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredExams}
          isLoading={isLoading}
          emptyText="No mock exams match your query."
        />
      </Card>

      {/* Builder Modal */}
      <Modal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        title={editingExam ? `Paper Builder: ${editingExam.title}` : "Configure New Grand Mock Exam Paper"}
        size="lg"
      >
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
          {saveErrorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {saveErrorMsg}
            </div>
          )}

          {/* Builder Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "settings" ? "bg-[#0E2A47] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              1. Paper Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("picker")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "picker" ? "bg-[#0E2A47] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" /> 2. Question Pool & Sequence ({selectedQuestionIds.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "preview" ? "bg-[#0FA3A3] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> 3. Student Paper Preview
            </button>
          </div>

          {/* TAB 1: SETTINGS */}
          {activeTab === "settings" && (
            <form onSubmit={handleSaveMockExam} className="space-y-4">
              <Input
                label="Exam Paper Title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. NRE Step 1 National Grand Mock Test 2026"
              />

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Category</label>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value as ExamCategory);
                      setPickerSubject("all"); // subject options are category-scoped — reset on category change
                    }}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                  >
                    <option value="NRE1">NRE Step 1 (PMDC)</option>
                    <option value="USMLE1">USMLE Step 1</option>
                    <option value="USMLE2CK">USMLE Step 2 CK</option>
                    <option value="SMLE">SMLE (Saudi Medical)</option>
                    <option value="DHA">DHA / HAAD (Dubai)</option>
                    <option value="PROMETRIC">Prometric Gulf</option>
                    <option value="MBBS">MBBS Basic Sciences</option>
                  </select>
                </div>

                <Input
                  label="Time Limit (Minutes)"
                  type="number"
                  required
                  min={1}
                  max={600}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />

                <Input
                  label="Passing Standard (%)"
                  type="number"
                  required
                  min={0}
                  max={100}
                  value={passPercent}
                  onChange={(e) => setPassPercent(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <p className="text-xs font-bold text-[#0E2A47]">Publish Status</p>
                  <p className="text-[11px] text-slate-500">Make this mock exam paper available to enrolled students</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0FA3A3]"></div>
                </label>
              </div>

              <div className="pt-2">
                <Button type="button" variant="teal" fullWidth onClick={() => setActiveTab("picker")}>
                  Next: Select Questions & Sequence
                </Button>
              </div>
            </form>
          )}

          {/* TAB 2: QUESTION PICKER & SEQUENCE BUILDER */}
          {activeTab === "picker" && (
            <div className="space-y-5">
              {/* Running Stats Bar */}
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between text-xs font-bold text-teal-900">
                <span>Selected Questions: {selectedQuestionIds.length} Qs</span>
                <span>Est. Duration: {durationMinutes} Mins</span>
                <span>Pass Threshold: {passPercent}%</span>
              </div>

              {selectedQuestionIds.length === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> A paper needs at least 1 question before students can start it.
                </div>
              )}
              {hasInactiveSelected && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> This sequence includes an inactive question — remove it before saving, or the server will reject the whole save.
                </div>
              )}
              {questionsLoadErrorMsg && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {questionsLoadErrorMsg} You can still reorder/remove an
                  already-configured sequence and save paper settings — adding NEW questions is unavailable until then.
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Available QBank Pool */}
                <div className="space-y-3 border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <span className="font-extrabold text-xs text-[#0E2A47] block">
                    Available QBank Pool ({category}, active only)
                  </span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search stem or QID..."
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      disabled={!!questionsLoadErrorMsg}
                      className="w-full h-8 pl-8 pr-3 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0FA3A3] disabled:bg-slate-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  <select
                    value={pickerSubject}
                    onChange={(e) => setPickerSubject(e.target.value)}
                    disabled={!!questionsLoadErrorMsg}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0FA3A3] disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Subjects</option>
                    {pickerSubjectOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {isLoadingQuestionIds && (
                      <p className="text-xs text-slate-400 text-center py-4">Loading current sequence…</p>
                    )}
                    {!isLoadingQuestionIds && questionsLoadErrorMsg && (
                      <p className="text-xs text-amber-700 text-center py-4">Question browser offline — see notice above.</p>
                    )}
                    {!isLoadingQuestionIds && !questionsLoadErrorMsg && filteredPoolQuestions.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">
                        No active {category} questions match this filter.
                      </p>
                    )}
                    {!isLoadingQuestionIds &&
                      filteredPoolQuestions.map((q) => {
                        const isPicked = selectedQuestionIds.includes(q.id);
                        return (
                          <div
                            key={q.id}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                              isPicked ? "bg-teal-50 border-teal-300" : "bg-white border-slate-200"
                            }`}
                          >
                            <div className="pr-2">
                              <span className="font-mono text-[10px] text-slate-400 block">#{q.id} • {q.subjectName}</span>
                              <p className="font-medium text-slate-800 line-clamp-1">{q.stem}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleQuestionInPaper(q.id)}
                              className={`px-2 py-1 rounded text-[10px] font-bold shrink-0 ${
                                isPicked ? "bg-rose-100 text-rose-700" : "bg-[#0E2A47] text-white"
                              }`}
                            >
                              {isPicked ? "Remove" : "+ Add"}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Selected Sequence Order */}
                <div className="space-y-3 border border-slate-200 rounded-xl p-3 bg-white">
                  <span className="font-extrabold text-xs text-[#0E2A47] block">
                    Paper Sequence Order ({selectedQuestionIds.length})
                  </span>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {isLoadingQuestionIds && (
                      <p className="text-xs text-slate-400 text-center py-4">Loading current sequence…</p>
                    )}
                    {!isLoadingQuestionIds && selectedQuestions.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">No questions selected yet.</p>
                    )}
                    {!isLoadingQuestionIds &&
                      selectedQuestions.map((q, idx) => (
                        <div key={q.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0E2A47] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div>
                              <span className="font-mono text-[10px] text-slate-400">
                                #{q.id}
                                {!q.isActive && <span className="ml-1 text-rose-600 font-bold">INACTIVE</span>}
                              </span>
                              <p className="font-medium text-slate-800 line-clamp-1">{q.stem}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleMoveQuestionInPaper(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5 text-slate-600" />
                            </button>
                            <button
                              onClick={() => handleMoveQuestionInPaper(idx, "down")}
                              disabled={idx === selectedQuestions.length - 1}
                              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
                            </button>
                            <button
                              onClick={() => handleToggleQuestionInPaper(q.id)}
                              className="p-1 hover:text-rose-600 rounded text-slate-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <Button variant="teal" fullWidth isLoading={isSaving} onClick={() => handleSaveMockExam()}>
                Save Mock Exam Paper Sequence
              </Button>
            </div>
          )}

          {/* TAB 3: STUDENT PREVIEW */}
          {activeTab === "preview" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-[#0E2A47]">{title || "Grand Mock Exam Paper"}</h3>
                  <p className="text-xs text-slate-500">
                    Category: {category} • {durationMinutes} Mins • Passing Score: {passPercent}%
                  </p>
                </div>
                <Badge variant="teal">{selectedQuestions.length} Questions</Badge>
              </div>

              <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                {selectedQuestions.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No questions selected yet — add some in the Question Pool & Sequence tab.
                  </p>
                )}
                {selectedQuestions.map((q, idx) => (
                  <div key={q.id} className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-2">
                    <span className="font-bold text-[#0E2A47]">
                      Question {idx + 1} of {selectedQuestions.length} (QID #{q.id})
                    </span>
                    <p className="text-slate-700 leading-relaxed">{q.stem}</p>
                  </div>
                ))}
              </div>

              <Button variant="teal" fullWidth isLoading={isSaving} onClick={() => handleSaveMockExam()}>
                Save Mock Exam Paper
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!examToDelete}
        title="Delete Mock Exam Paper"
        message={
          examToDelete
            ? `Are you sure you want to permanently delete "${examToDelete.title}"? This cannot be undone. Papers with recorded student attempts cannot be deleted — unpublish them instead.`
            : ""
        }
        confirmLabel="Delete Paper"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteExam}
        onCancel={() => setExamToDelete(null)}
      />
    </div>
  );
};
