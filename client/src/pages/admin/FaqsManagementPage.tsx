import React, { useEffect, useState } from "react";
import { Plus, HelpCircle, Edit, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Card, Button, Input, Textarea, Table, Badge, Modal } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { FAQ } from "../../types";
import { Toast } from "../../components/ui/ToastSystem";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const FaqsManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadFaqs = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getFaqs();
      setFaqs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFaqs();
  }, []);

  const openAddModal = () => {
    setEditingFaq(null);
    setQuestion("");
    setAnswer("");
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (faq: FAQ) => {
    setEditingFaq(faq);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setIsActive(faq.isActive);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return;

    setSubmitting(true);
    try {
      if (editingFaq) {
        const updated = await adminApi.updateFaq(editingFaq.id, {
          question,
          answer,
          isActive,
        });
        setFaqs(faqs.map((f) => (f.id === editingFaq.id ? updated : f)));
        setToastMessage("FAQ item updated successfully.");
      } else {
        const created = await adminApi.createFaq({
          question,
          answer,
          sortOrder: faqs.length + 1,
          isActive,
        });
        setFaqs([...faqs, created]);
        setToastMessage("New FAQ added.");
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this FAQ item?")) return;
    try {
      await adminApi.deleteFaq(id);
      setFaqs(faqs.filter((f) => f.id !== id));
      setToastMessage("FAQ item deleted.");
    } catch (err) {
      console.error(err);
    }
  };

  const moveFaq = async (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= faqs.length) return;

    const newFaqs = [...faqs];
    const temp = newFaqs[index];
    newFaqs[index] = newFaqs[targetIdx];
    newFaqs[targetIdx] = temp;

    const reordered = newFaqs.map((item, idx) => ({ ...item, sortOrder: idx + 1 }));
    setFaqs(reordered);
    await adminApi.reorderFaqs(reordered);
    setToastMessage("FAQ reorder saved.");
  };

  const filteredFaqs = faqs.filter((f) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q) ||
      String(f.id).includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Frequently Asked Questions (FAQs) Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, update, and reorder public FAQ items displayed across the portal and landing pages.
          </p>
        </div>
        <Button variant="teal" icon={<Plus className="w-4 h-4" />} onClick={openAddModal}>
          Add FAQ Item
        </Button>
      </div>

      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "Reorder & Question",
              accessor: (row, idx) => (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => moveFaq(idx, "up")}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={idx === faqs.length - 1}
                      onClick={() => moveFaq(idx, "down")}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <div className="font-bold text-[#0E2A47] text-sm flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                      {row.question}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: "Answer Content",
              accessor: (row) => <p className="text-xs text-slate-600 line-clamp-2 max-w-lg">{row.answer}</p>,
            },
            {
              header: "Status",
              accessor: (row) => (
                <Badge variant={row.isActive ? "success" : "slate"}>
                  {row.isActive ? "Active" : "Hidden"}
                </Badge>
              ),
            },
            {
              header: "Actions",
              accessor: (row) => (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" icon={<Edit className="w-3.5 h-3.5" />} onClick={() => openEditModal(row)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => handleDelete(row.id)}>
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredFaqs}
          isLoading={loading}
          emptyText="No FAQ items match your query."
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingFaq ? "Edit FAQ Item" : "Create New FAQ Item"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Question Text"
            placeholder="e.g. How do I access the video lectures and QBank after purchasing?"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <Textarea
            label="Answer Content"
            placeholder="e.g. Once your payment is approved (instant for JazzCash/EasyPaisa; within 1-3 hours for Raast)..."
            required
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
          />

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="faqActiveToggle"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-[#0FA3A3] rounded border-slate-300 focus:ring-[#0FA3A3]"
            />
            <label htmlFor="faqActiveToggle" className="text-xs text-slate-700 font-medium cursor-pointer">
              Publish on public FAQ page
            </label>
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="teal" isLoading={submitting}>
              {editingFaq ? "Save FAQ Item" : "Publish FAQ"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
