import React, { useEffect, useState } from "react";
import { Plus, ShieldCheck, Edit, Trash2, ArrowUp, ArrowDown, UserPlus } from "lucide-react";
import { Card, Button, Input, Textarea, Table, Badge, Modal } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { FacultyMember } from "../../types";
import { Toast } from "../../components/ui/ToastSystem";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const FacultyManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FacultyMember | null>(null);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadFaculty = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getFaculty();
      setFaculty(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFaculty();
  }, []);

  const openAddModal = () => {
    setEditingMember(null);
    setName("");
    setTitle("");
    setBio("");
    setPhotoUrl("https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80");
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (member: FacultyMember) => {
    setEditingMember(member);
    setName(member.name);
    setTitle(member.title);
    setBio(member.bio);
    setPhotoUrl(member.photoUrl);
    setIsActive(member.isActive);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !title.trim()) return;

    setSubmitting(true);
    try {
      if (editingMember) {
        const updated = await adminApi.updateFaculty(editingMember.id, {
          name,
          title,
          bio,
          photoUrl,
          isActive,
        });
        setFaculty(faculty.map((f) => (f.id === editingMember.id ? updated : f)));
        setToastMessage(`Faculty member "${name}" updated successfully.`);
      } else {
        const created = await adminApi.createFaculty({
          name,
          title,
          bio,
          photoUrl: photoUrl || "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80",
          sortOrder: faculty.length + 1,
          isActive,
        });
        setFaculty([...faculty, created]);
        setToastMessage(`Faculty member "${name}" added to roster.`);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to remove this faculty member profile?")) return;
    try {
      await adminApi.deleteFaculty(id);
      setFaculty(faculty.filter((f) => f.id !== id));
      setToastMessage("Faculty profile removed.");
    } catch (err) {
      console.error(err);
    }
  };

  const moveMember = async (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= faculty.length) return;

    const newFaculty = [...faculty];
    const temp = newFaculty[index];
    newFaculty[index] = newFaculty[targetIdx];
    newFaculty[targetIdx] = temp;

    // re-index sortOrder
    const reordered = newFaculty.map((item, idx) => ({ ...item, sortOrder: idx + 1 }));
    setFaculty(reordered);
    await adminApi.reorderFaculty(reordered);
    setToastMessage("Faculty roster display order updated.");
  };

  const filteredFaculty = faculty.filter((f) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      f.name.toLowerCase().includes(q) ||
      f.title.toLowerCase().includes(q) ||
      f.bio.toLowerCase().includes(q) ||
      String(f.id).includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Faculty Roster Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage instructor profiles, academic credentials, and public website faculty showcase order.
          </p>
        </div>
        <Button variant="teal" icon={<UserPlus className="w-4 h-4" />} onClick={openAddModal}>
          Add Faculty Instructor
        </Button>
      </div>

      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "Order & Instructor Info",
              accessor: (row, idx) => (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => moveMember(idx, "up")}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={idx === faculty.length - 1}
                      onClick={() => moveMember(idx, "down")}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <img
                    src={row.photoUrl}
                    alt={row.name}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                  <div>
                    <div className="font-bold text-[#0E2A47] text-sm">{row.name}</div>
                    <div className="text-xs text-[#0FA3A3] font-medium">{row.title}</div>
                  </div>
                </div>
              ),
            },
            {
              header: "Instructor Biography & Credentials",
              accessor: (row) => <p className="text-xs text-slate-600 line-clamp-2 max-w-lg">{row.bio}</p>,
            },
            {
              header: "Status",
              accessor: (row) => (
                <Badge variant={row.isActive ? "success" : "slate"}>
                  {row.isActive ? "Active Instructor" : "Inactive"}
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
          data={filteredFaculty}
          isLoading={loading}
          emptyText="No faculty members listed matching search query."
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMember ? "Edit Faculty Instructor Profile" : "Add New Faculty Instructor"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name & Title"
            placeholder="e.g. Dr. Zabih Ullah"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            label="Academic Specialty / Role"
            placeholder="e.g. Founder & Lead NRE / USMLE Instructor"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Input
            label="Photo URL"
            placeholder="https://images.unsplash.com/..."
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
          />

          <Textarea
            label="Instructor Biography & Qualifications"
            placeholder="e.g. MBBS, FCPS Medicine, USMLE Step 1/2CK 250+. Over 8 years teaching..."
            required
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
          />

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="facultyActiveToggle"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-[#0FA3A3] rounded border-slate-300 focus:ring-[#0FA3A3]"
            />
            <label htmlFor="facultyActiveToggle" className="text-xs text-slate-700 font-medium cursor-pointer">
              Show profile on public website Faculty Showcase
            </label>
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="teal" isLoading={submitting}>
              {editingMember ? "Save Profile Changes" : "Add to Roster"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
