import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Edit2, Trash2, Check, X, ArrowLeft, Tags, BookOpen, Layers } from "lucide-react";
import { Card, Button, Input, Table, Badge, Toast } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { Subject, BodySystem } from "../../types";

export const TaxonomyManagementPage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [systems, setSystems] = useState<BodySystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Subject Form/Editing state
  const [newSubjectName, setNewSubjectName] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState("");

  // System Form/Editing state
  const [newSystemName, setNewSystemName] = useState("");
  const [editingSystemId, setEditingSystemId] = useState<number | null>(null);
  const [editingSystemName, setEditingSystemName] = useState("");

  useEffect(() => {
    loadTaxonomy();
  }, []);

  const loadTaxonomy = async () => {
    setIsLoading(true);
    try {
      const data = await adminApi.getTaxonomy();
      setSubjects(data.subjects);
      setSystems(data.systems);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Subject Actions
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    try {
      const created = await adminApi.createSubject(newSubjectName.trim());
      setSubjects([...subjects, created]);
      setNewSubjectName("");
      setToastMessage(`Subject "${created.name}" created.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSubjectEdit = async (id: number) => {
    if (!editingSubjectName.trim()) return;
    try {
      const updated = await adminApi.updateSubject(id, editingSubjectName.trim());
      setSubjects(subjects.map((s) => (s.id === id ? updated : s)));
      setEditingSubjectId(null);
      setToastMessage(`Subject renamed to "${updated.name}".`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSubject = async (id: number) => {
    try {
      await adminApi.deleteSubject(id);
      setSubjects(subjects.filter((s) => s.id !== id));
      setToastMessage("Subject archived.");
    } catch (err) {
      console.error(err);
    }
  };

  // System Actions
  const handleAddSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSystemName.trim()) return;
    try {
      const created = await adminApi.createSystem(newSystemName.trim());
      setSystems([...systems, created]);
      setNewSystemName("");
      setToastMessage(`Body system "${created.name}" created.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSystemEdit = async (id: number) => {
    if (!editingSystemName.trim()) return;
    try {
      const updated = await adminApi.updateSystem(id, editingSystemName.trim());
      setSystems(systems.map((sys) => (sys.id === id ? updated : sys)));
      setEditingSystemId(null);
      setToastMessage(`Body system renamed to "${updated.name}".`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSystem = async (id: number) => {
    try {
      await adminApi.deleteSystem(id);
      setSystems(systems.filter((sys) => sys.id !== id));
      setToastMessage("Body system archived.");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Header */}
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/admin/qbank" className="text-xs font-bold text-[#0FA3A3] hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to QBank
            </Link>
          </div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Medical Exam Taxonomy Manager</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure active Subjects and Organ Systems used to categorize QBank vignettes and mock exam papers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SUBJECTS COLUMN */}
        <Card className="p-6 border-slate-200 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#0FA3A3]" />
              <h2 className="text-base font-extrabold text-[#0E2A47]">Medical Subjects ({subjects.length})</h2>
            </div>
          </div>

          {/* Add Subject Form */}
          <form onSubmit={handleAddSubject} className="flex gap-2">
            <Input
              placeholder="New Subject (e.g. Behavioral Sciences)"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              className="flex-1"
            />
            <Button variant="teal" icon={<Plus className="w-4 h-4" />}>
              Add
            </Button>
          </form>

          {/* Subjects Table / List */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
            {subjects.map((sub) => (
              <div key={sub.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                {editingSubjectId === sub.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingSubjectName}
                      onChange={(e) => setEditingSubjectName(e.target.value)}
                      className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                    />
                    <button
                      onClick={() => handleSaveSubjectEdit(sub.id)}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingSubjectId(null)}
                      className="p-1 text-slate-400 hover:bg-slate-100 rounded-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-xs text-[#0E2A47]">{sub.name}</span>
                    <Badge variant="teal" size="sm" className="text-[10px] py-0 px-1.5">
                      {sub.questionsCount || 10} Questions
                    </Badge>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingSubjectId(sub.id);
                      setEditingSubjectName(sub.name);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteSubject(sub.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* BODY SYSTEMS COLUMN */}
        <Card className="p-6 border-slate-200 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-extrabold text-[#0E2A47]">Body Systems ({systems.length})</h2>
            </div>
          </div>

          {/* Add System Form */}
          <form onSubmit={handleAddSystem} className="flex gap-2">
            <Input
              placeholder="New Body System (e.g. Ophthalmology)"
              value={newSystemName}
              onChange={(e) => setNewSystemName(e.target.value)}
              className="flex-1"
            />
            <Button variant="teal" icon={<Plus className="w-4 h-4" />}>
              Add
            </Button>
          </form>

          {/* Systems Table / List */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
            {systems.map((sys) => (
              <div key={sys.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                {editingSystemId === sys.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingSystemName}
                      onChange={(e) => setEditingSystemName(e.target.value)}
                      className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
                    />
                    <button
                      onClick={() => handleSaveSystemEdit(sys.id)}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingSystemId(null)}
                      className="p-1 text-slate-400 hover:bg-slate-100 rounded-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-xs text-[#0E2A47]">{sys.name}</span>
                    <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1.5">
                      {sys.questionsCount || 8} Questions
                    </Badge>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingSystemId(sys.id);
                      setEditingSystemName(sys.name);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteSystem(sys.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
