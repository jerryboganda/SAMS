import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileQuestion,
  Plus,
  Edit2,
  Trash2,
  Upload,
  Tags,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sparkles,
  HelpCircle,
  Layers,
} from "lucide-react";
import { Card, Button, Input, Table, Badge, Modal, Toast } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { Question, QuestionOption, Subject, BodySystem } from "../../types";
import { useAdminSearch } from "../../context/AdminSearchContext";

// Monotonic counter for generating stable, purely-local React keys for
// question options that don't (yet) have a real server-assigned id — see
// the `options` state comment below for why this must be kept separate
// from `id`.
let localOptionKeySeq = 0;
const nextLocalOptionKey = (): string => `opt-local-${++localOptionKeySeq}`;

export const QBankManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [systems, setSystems] = useState<BodySystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [stem, setStem] = useState("");
  const [explanation, setExplanation] = useState("");
  const [subjectName, setSubjectName] = useState("Anatomy");
  const [systemName, setSystemName] = useState("Cardiovascular System");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  // Local editor-only option shape. `id` mirrors the REAL server-assigned
  // `question_options.id` when this option already exists on the server,
  // and is intentionally left unset (undefined) for options that don't —
  // a brand-new question, or a row added via "+ Add Option" — so the save
  // payload never fabricates one (see handleSaveQuestion). `uiKey` is a
  // separate, purely-local identifier used only for React list keys and
  // for targeting the right row in the handlers below; it must NOT be
  // derived from `id`, because several id-less new options can coexist in
  // the editor at once and still need distinct identities.
  const [options, setOptions] = useState<{ uiKey: string; id?: number; text: string; isCorrect: boolean }[]>([
    { uiKey: nextLocalOptionKey(), text: "", isCorrect: true },
    { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
    { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
    { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
  ]);
  const [tags, setTags] = useState("nre1, high-yield");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // Soft Delete Modal State
  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [qData, taxData] = await Promise.all([adminApi.getQuestions(), adminApi.getTaxonomy()]);
      setQuestions(qData);
      setSubjects(taxData.subjects);
      setSystems(taxData.systems);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEditor = (q?: Question) => {
    if (q) {
      setEditingQuestion(q);
      setStem(q.stem);
      setExplanation(q.explanation || "");
      setSubjectName(q.subjectName || "Anatomy");
      setSystemName(q.systemName || "Cardiovascular System");
      setDifficulty(q.difficulty);
      if (q.options && q.options.length > 0) {
        setOptions(
          q.options.map((opt) => ({
            // Preserve the REAL server-assigned option id — overwriting it
            // with a fabricated sequential id here is exactly the bug this
            // fix addresses (see handleSaveQuestion).
            uiKey: `opt-server-${opt.id}`,
            id: opt.id,
            text: opt.optionText,
            isCorrect: !!opt.isCorrect,
          }))
        );
      } else {
        setOptions([
          { uiKey: nextLocalOptionKey(), text: "Option A", isCorrect: true },
          { uiKey: nextLocalOptionKey(), text: "Option B", isCorrect: false },
          { uiKey: nextLocalOptionKey(), text: "Option C", isCorrect: false },
          { uiKey: nextLocalOptionKey(), text: "Option D", isCorrect: false },
        ]);
      }
    } else {
      setEditingQuestion(null);
      setStem("");
      setExplanation("");
      setSubjectName(subjects[0]?.name || "Anatomy");
      setSystemName(systems[0]?.name || "Cardiovascular System");
      setDifficulty("medium");
      // Brand-new question: none of these options exist on the server yet,
      // so none get an `id`.
      setOptions([
        { uiKey: nextLocalOptionKey(), text: "", isCorrect: true },
        { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
        { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
        { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
      ]);
    }
    setActiveTab("edit");
    setIsEditorOpen(true);
  };

  const handleOptionTextChange = (uiKey: string, text: string) => {
    setOptions(options.map((o) => (o.uiKey === uiKey ? { ...o, text } : o)));
  };

  const handleSetCorrectOption = (uiKey: string) => {
    setOptions(options.map((o) => ({ ...o, isCorrect: o.uiKey === uiKey })));
  };

  const handleAddOptionRow = () => {
    if (options.length >= 6) return;
    // New row has no real server id yet — leave `id` unset (not a
    // fabricated one) so the save payload tells the backend "insert a new
    // question_options row" instead of "update row #<fake id>".
    setOptions([...options, { uiKey: nextLocalOptionKey(), text: "", isCorrect: false }]);
  };

  const handleRemoveOptionRow = (uiKey: string) => {
    if (options.length <= 2) return;
    const filtered = options.filter((o) => o.uiKey !== uiKey);
    if (!filtered.some((o) => o.isCorrect)) {
      filtered[0].isCorrect = true;
    }
    setOptions(filtered);
  };

  const handleSaveQuestion = async (andNew: boolean = false) => {
    if (!stem.trim()) {
      alert("Clinical Vignette Stem is required.");
      return;
    }
    if (options.some((o) => !o.text.trim())) {
      alert("All option choices must have text.");
      return;
    }

    // Preserve each option's REAL server id where it has one (an edit to an
    // existing option) and omit `id` entirely where it doesn't (a brand-new
    // option) — never fabricate one. This lets the backend tell "update in
    // place" apart from "insert a new row", which matters because a past
    // exam attempt's `selected_option_id` may still point at an existing
    // row (docs/04_API_SPEC.md §7: "edit creates new option rows safely").
    // Note: `QuestionOption` (client/src/types/index.ts) intentionally
    // still requires `id`/`questionId`/`sortOrder` for the server-response
    // shape used elsewhere (student exam/review screens always get
    // fully-populated options back from the server) — the save-payload
    // shape below legitimately differs (optional `id`, no `questionId`,
    // since the backend derives that from the parent question), so it's
    // cast at the two call sites below rather than widening that shared
    // read-path type.
    const payloadOptions: { id?: number; optionText: string; isCorrect: boolean; sortOrder: number }[] = options.map(
      (o, idx) => ({
        ...(o.id != null ? { id: o.id } : {}),
        optionText: o.text,
        isCorrect: o.isCorrect,
        sortOrder: idx + 1,
      })
    );

    try {
      if (editingQuestion) {
        const updated = await adminApi.updateQuestion(editingQuestion.id, {
          stem,
          explanation,
          subjectName,
          systemName,
          difficulty,
          options: payloadOptions as unknown as QuestionOption[],
        });
        setQuestions(questions.map((q) => (q.id === updated.id ? updated : q)));
        setToastMessage(`Question #${updated.id} updated successfully.`);
      } else {
        const created = await adminApi.createQuestion({
          examCategory: "NRE1",
          subjectId: subjects.find((s) => s.name === subjectName)?.id || 1,
          subjectName,
          systemId: systems.find((sys) => sys.name === systemName)?.id || 1,
          systemName,
          stem,
          options: payloadOptions as unknown as QuestionOption[],
          explanation,
          difficulty,
          isActive: true,
        });
        setQuestions([created, ...questions]);
        setToastMessage(`New Question #${created.id} added to QBank!`);
      }

      if (andNew) {
        setEditingQuestion(null);
        setStem("");
        setExplanation("");
        setOptions([
          { uiKey: nextLocalOptionKey(), text: "", isCorrect: true },
          { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
          { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
          { uiKey: nextLocalOptionKey(), text: "", isCorrect: false },
        ]);
        setActiveTab("edit");
      } else {
        setIsEditorOpen(false);
      }
    } catch (err) {
      console.error(err);
      // Surface the backend's message verbatim — this is the only place
      // that reports a failed save, including the 409 the backend raises
      // when a removed option was actually selected in a past exam attempt
      // (e.g. `Cannot remove option "..." — it has been selected in N past
      // attempt(s)`). Uses alert() rather than the page-level Toast banner:
      // the Editor Modal (`fixed inset-0 z-50`) renders on top of that
      // Toast and would hide it, and the modal deliberately stays open on
      // failure so the admin can read the reason and fix the form.
      alert(err instanceof Error ? err.message : "Failed to save question. Please try again.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingQuestionId) return;
    try {
      await adminApi.deleteQuestion(deletingQuestionId);
      setQuestions(questions.filter((q) => q.id !== deletingQuestionId));
      setToastMessage(`Question #${deletingQuestionId} deleted.`);
      setDeletingQuestionId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Filter Logic
  const filteredQuestions = questions.filter((q) => {
    if (selectedSubject !== "all" && q.subjectName !== selectedSubject) return false;
    if (selectedSystem !== "all" && q.systemName !== selectedSystem) return false;
    if (selectedDifficulty !== "all" && q.difficulty !== selectedDifficulty) return false;
    const effectiveSearch = (globalSearch || searchQuery).trim().toLowerCase();
    if (effectiveSearch) {
      const qText = `${q.stem} ${q.explanation} ${q.id} ${q.subjectName} ${q.systemName}`.toLowerCase();
      if (!qText.includes(effectiveSearch)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Header Bar */}
      <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">QBank Clinical Vignettes</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage 60+ high-yield medical case scenarios, option distractor rationale, and taxonomy tagging.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/qbank/import">
            <Button variant="outline" size="sm" icon={<Upload className="w-4 h-4 text-[#0FA3A3]" />}>
              CSV Bulk Import
            </Button>
          </Link>
          <Link to="/admin/qbank/taxonomy">
            <Button variant="outline" size="sm" icon={<Tags className="w-4 h-4 text-amber-600" />}>
              Taxonomy Manager
            </Button>
          </Link>
          <Button variant="teal" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => handleOpenEditor()}>
            Add New Question
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 border-slate-200 bg-white space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Subject</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
            >
              <option value="all">All Subjects ({questions.length})</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.name}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Body System</label>
            <select
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
              className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
            >
              <option value="all">All Body Systems</option>
              {systems.map((sys) => (
                <option key={sys.id} value={sys.name}>
                  {sys.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Difficulty</label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Search Keywords</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search stem, diagnosis, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Questions Data Table */}
      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "QID",
              accessor: (q) => <span className="font-mono text-xs font-bold text-slate-500">#{q.id}</span>,
            },
            {
              header: "Subject / System",
              accessor: (q) => (
                <div className="space-y-1">
                  <Badge variant="teal" size="sm">
                    {q.subjectName || "Anatomy"}
                  </Badge>
                  <span className="block text-[10px] font-medium text-slate-400">{q.systemName || "Cardiovascular"}</span>
                </div>
              ),
            },
            {
              header: "Clinical Vignette Stem",
              accessor: (q) => (
                <div className="max-w-md">
                  <p className="text-xs font-medium text-[#0E2A47] line-clamp-2 leading-relaxed">{q.stem}</p>
                </div>
              ),
            },
            {
              header: "Difficulty",
              accessor: (q) => (
                <Badge
                  variant={q.difficulty === "hard" ? "danger" : q.difficulty === "easy" ? "success" : "warning"}
                  size="sm"
                  className="capitalize"
                >
                  {q.difficulty}
                </Badge>
              ),
            },
            {
              header: "Actions",
              accessor: (q) => (
                <div className="flex items-center gap-1.5">
                  <Button size="xs" variant="ghost" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => handleOpenEditor(q)}>
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="danger"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => setDeletingQuestionId(q.id)}
                  >
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredQuestions}
          isLoading={isLoading}
        />
      </Card>

      {/* Editor Modal with Live Preview */}
      <Modal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={editingQuestion ? `Edit Vignette Question #${editingQuestion.id}` : "Create New Clinical Case Vignette"}
        size="lg"
      >
        <div className="space-y-5">
          {/* Editor Mode Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("edit")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "edit" ? "bg-[#0E2A47] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Question Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "preview" ? "bg-[#0FA3A3] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Student Exam Preview
            </button>
          </div>

          {activeTab === "edit" ? (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Taxonomy Selects */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
                  <select
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.name}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Body System</label>
                  <select
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                  >
                    {systems.map((sys) => (
                      <option key={sys.id} value={sys.name}>
                        {sys.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Difficulty Level</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                  >
                    <option value="easy">Easy (60%+ pass)</option>
                    <option value="medium">Medium (40–60% pass)</option>
                    <option value="hard">Hard (&lt;40% pass)</option>
                  </select>
                </div>
              </div>

              {/* Vignette Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Case Vignette Stem</label>
                <textarea
                  rows={5}
                  value={stem}
                  onChange={(e) => setStem(e.target.value)}
                  className="w-full p-3 text-sm border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3] leading-relaxed"
                  placeholder="e.g. A 45-year-old male presents to the emergency room with severe retrosternal chest pain radiating to the left jaw..."
                />
              </div>

              {/* Option Choices */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">Answer Options (Mark 1 Correct Radio)</label>
                  <button
                    type="button"
                    onClick={handleAddOptionRow}
                    className="text-xs text-[#0FA3A3] font-bold hover:underline"
                  >
                    + Add Option
                  </button>
                </div>

                <div className="space-y-2">
                  {options.map((opt, idx) => (
                    <div key={opt.uiKey} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correctRadioGroup"
                        checked={opt.isCorrect}
                        onChange={() => handleSetCorrectOption(opt.uiKey)}
                        className="w-4 h-4 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                        title="Mark as Correct Answer"
                      />
                      <span className="w-6 text-xs font-bold text-slate-500">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => handleOptionTextChange(opt.uiKey, e.target.value)}
                        placeholder={`Choice ${String.fromCharCode(65 + idx)} option text...`}
                        className="flex-1 h-9 px-3 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOptionRow(opt.uiKey)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rationale Explanation */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  High-Yield Rationale & Explanation
                </label>
                <textarea
                  rows={4}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="w-full p-3 text-xs border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0FA3A3] leading-relaxed"
                  placeholder="Explain why the correct answer is right and why the other distractors are incorrect..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="teal" fullWidth onClick={() => handleSaveQuestion(false)}>
                  Save Question
                </Button>
                {!editingQuestion && (
                  <Button variant="outline" fullWidth onClick={() => handleSaveQuestion(true)}>
                    Save & Add New
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* Student Live Preview Card */
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="teal" size="sm">{subjectName}</Badge>
                  <Badge variant="neutral" size="sm">{systemName}</Badge>
                </div>
                <span className="text-xs font-semibold text-slate-400 uppercase">Interactive Preview</span>
              </div>

              <p className="text-sm font-medium text-[#0E2A47] leading-relaxed">
                {stem || <span className="italic text-slate-400">Vignette stem preview will appear here...</span>}
              </p>

              <div className="space-y-2 pt-2">
                {options.map((opt, idx) => (
                  <div
                    key={opt.uiKey}
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                      opt.isCorrect
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                        : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    <span>
                      <strong className="mr-2">{String.fromCharCode(65 + idx)}.</strong>
                      {opt.text || `Option choice ${String.fromCharCode(65 + idx)}`}
                    </span>
                    {opt.isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                ))}
              </div>

              {explanation && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                  <span className="font-bold block">Correct Rationale:</span>
                  <p className="leading-relaxed text-amber-800">{explanation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Soft Delete Confirm Modal */}
      <Modal
        isOpen={!!deletingQuestionId}
        onClose={() => setDeletingQuestionId(null)}
        title="Delete Question Vignette?"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to remove Question <strong>#{deletingQuestionId}</strong> from the active QBank?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeletingQuestionId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
