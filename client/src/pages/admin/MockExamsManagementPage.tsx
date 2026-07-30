import React, { useState, useEffect } from "react";
import {
  Award,
  Plus,
  Edit2,
  Trash2,
  Clock,
  CheckCircle2,
  ListOrdered,
  Search,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Eye,
} from "lucide-react";
import { Card, Button, Input, Table, Badge, Modal, Toast } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { MockExam, Question } from "../../types";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const MockExamsManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [exams, setExams] = useState<MockExam[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Builder Modal State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<MockExam | null>(null);
  const [activeTab, setActiveTab] = useState<"settings" | "picker" | "preview">("settings");

  // Form State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<any>("NRE1");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [passPercent, setPassPercent] = useState("60");
  const [isPublished, setIsPublished] = useState(true);

  // Question Picker State
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSubject, setPickerSubject] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [eData, qData] = await Promise.all([adminApi.getMockExams(), adminApi.getQuestions()]);
      setExams(eData);
      setAllQuestions(qData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenBuilder = (exam?: MockExam) => {
    if (exam) {
      setEditingExam(exam);
      setTitle(exam.title);
      setCategory(exam.examCategory);
      setDurationMinutes(String(exam.durationMinutes));
      setPassPercent(String(exam.passPercent));
      setIsPublished(exam.isPublished);
      // Pick first N questions as selected for demo
      setSelectedQuestionIds(allQuestions.slice(0, exam.questionsCount || 10).map((q) => q.id));
    } else {
      setEditingExam(null);
      setTitle("");
      setCategory("NRE1");
      setDurationMinutes("60");
      setPassPercent("60");
      setIsPublished(true);
      // Preselect first 5 questions
      setSelectedQuestionIds(allQuestions.slice(0, 5).map((q) => q.id));
    }
    setActiveTab("settings");
    setIsBuilderOpen(true);
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

  const handleSaveMockExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      if (editingExam) {
        const updated: MockExam = {
          ...editingExam,
          title,
          examCategory: category,
          durationMinutes: Number(durationMinutes),
          passPercent: Number(passPercent),
          isPublished,
          questionsCount: selectedQuestionIds.length,
        };
        setExams(exams.map((e) => (e.id === updated.id ? updated : e)));
        setToastMessage(`Grand Mock Exam "${updated.title}" updated.`);
      } else {
        const created = await adminApi.createMockExam({
          title,
          examCategory: category,
          durationMinutes: Number(durationMinutes),
          passPercent: Number(passPercent),
          isPublished,
          questionsCount: selectedQuestionIds.length,
        });
        setExams([created, ...exams]);
        setToastMessage(`New Grand Mock Exam paper "${created.title}" created.`);
      }
      setIsBuilderOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteExam = (id: number) => {
    setExams(exams.filter((e) => e.id !== id));
    setToastMessage(`Mock exam paper deleted.`);
  };

  // Filter Pool
  const filteredPoolQuestions = allQuestions.filter((q) => {
    if (pickerSubject !== "all" && q.subjectName !== pickerSubject) return false;
    if (pickerSearch.trim()) {
      const qText = `${q.stem} ${q.id}`.toLowerCase();
      if (!qText.includes(pickerSearch.toLowerCase())) return false;
    }
    return true;
  });

  const selectedQuestions = selectedQuestionIds
    .map((id) => allQuestions.find((q) => q.id === id))
    .filter(Boolean) as Question[];

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
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

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
              accessor: (e) => <span className="font-bold text-xs text-slate-700">{e.questionsCount} Questions</span>,
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
                <Badge variant={e.isPublished ? "success" : "neutral"} size="sm">
                  {e.isPublished ? "Published (Live)" : "Draft"}
                </Badge>
              ),
            },
            {
              header: "Actions",
              accessor: (e) => (
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="outline" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => handleOpenBuilder(e)}>
                    Builder & Sequence
                  </Button>
                  <Button size="xs" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => handleDeleteExam(e.id)}>
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
                    onChange={(e) => setCategory(e.target.value as any)}
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
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />

                <Input
                  label="Passing Standard (%)"
                  type="number"
                  required
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Available QBank Pool */}
                <div className="space-y-3 border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <span className="font-extrabold text-xs text-[#0E2A47] block">Available QBank Pool</span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search stem or QID..."
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                    />
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {filteredPoolQuestions.map((q) => {
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
                    {selectedQuestions.map((q, idx) => (
                      <div key={q.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#0E2A47] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-mono text-[10px] text-slate-400">#{q.id}</span>
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

              <Button variant="teal" fullWidth onClick={handleSaveMockExam}>
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
                {selectedQuestions.map((q, idx) => (
                  <div key={q.id} className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-2">
                    <span className="font-bold text-[#0E2A47]">
                      Question {idx + 1} of {selectedQuestions.length} (QID #{q.id})
                    </span>
                    <p className="text-slate-700 leading-relaxed">{q.stem}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
