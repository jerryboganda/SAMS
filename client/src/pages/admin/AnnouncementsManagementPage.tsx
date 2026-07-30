import React, { useEffect, useState } from "react";
import { Plus, Bell, Trash2, Mail, Users, BookOpen } from "lucide-react";
import { Card, Button, Input, Textarea, Table, Badge, Modal, Select } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { Announcement, Course } from "../../types";
import { Toast } from "../../components/ui/ToastSystem";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const AnnouncementsManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "course">("all");
  const [selectedCourseId, setSelectedCourseId] = useState<number>(0);
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [anns, crs] = await Promise.all([
        adminApi.getAnnouncements(),
        adminApi.getCourses(),
      ]);
      setAnnouncements(anns);
      setCourses(crs);
      if (crs.length > 0) setSelectedCourseId(crs[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    try {
      const selectedCourse = courses.find((c) => c.id === Number(selectedCourseId));
      const created = await adminApi.createAnnouncement({
        title,
        body,
        audience,
        courseId: audience === "course" ? Number(selectedCourseId) : undefined,
        courseTitle: audience === "course" ? selectedCourse?.title : undefined,
        sendEmail,
        createdBy: "Dr. Zabih Ullah (Admin)",
      });

      setAnnouncements([created, ...announcements]);
      setIsModalOpen(false);
      setTitle("");
      setBody("");
      setSendEmail(true);
      setToastMessage("Broadcast published! Pushed notification to student portal bell.");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this announcement broadcast?")) return;
    try {
      await adminApi.deleteAnnouncement(id);
      setAnnouncements(announcements.filter((a) => a.id !== id));
      setToastMessage("Announcement deleted successfully.");
    } catch (err) {
      console.error(err);
    }
  };

  const filteredAnnouncements = announcements.filter((a) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      a.title.toLowerCase().includes(q) ||
      a.body.toLowerCase().includes(q) ||
      (a.courseTitle && a.courseTitle.toLowerCase().includes(q)) ||
      String(a.id).includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Announcements & Notifications Broadcast</h1>
          <p className="text-xs text-slate-500 mt-1">Broadcast sitewide alerts and exam updates. Pushes directly to student portal notification bell.</p>
        </div>
        <Button variant="teal" icon={<Plus className="w-4 h-4" />} onClick={() => setIsModalOpen(true)}>
          New Announcement Broadcast
        </Button>
      </div>

      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "Announcement Title & Message",
              accessor: (row) => (
                <div className="space-y-1">
                  <div className="font-bold text-[#0E2A47] text-sm flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#0FA3A3]" />
                    {row.title}
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2 max-w-xl">{row.body}</p>
                </div>
              ),
            },
            {
              header: "Audience Target",
              accessor: (row) => (
                <Badge variant={row.audience === "all" ? "teal" : "blue"}>
                  {row.audience === "all" ? (
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> All Candidates</span>
                  ) : (
                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {row.courseTitle || `Course #${row.courseId}`}</span>
                  )}
                </Badge>
              ),
            },
            {
              header: "Email Push",
              accessor: (row) => (
                <Badge variant={row.sendEmail ? "success" : "slate"}>
                  {row.sendEmail ? <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> Email Sent</span> : "Portal Only"}
                </Badge>
              ),
            },
            {
              header: "Broadcast Date",
              accessor: (row) => <span className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleDateString()}</span>,
            },
            {
              header: "Actions",
              accessor: (row) => (
                <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => handleDelete(row.id)}>
                  Delete
                </Button>
              ),
            },
          ]}
          data={filteredAnnouncements}
          isLoading={loading}
          emptyText="No announcements matched your search query."
        />
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Compose Broadcast Announcement">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Announcement Title"
            placeholder="e.g. PMDC NRE Step 1 2026 Registration Announcement"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Textarea
            label="Message Body"
            placeholder="Write official announcement details, exam center locations, or high-yield guidance..."
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Audience Group"
              value={audience}
              onChange={(e) => setAudience(e.target.value as "all" | "course")}
              options={[
                { value: "all", label: "All Enrolled Students (Sitewide)" },
                { value: "course", label: "Specific Enrolled Course Only" },
              ]}
            />

            {audience === "course" && (
              <Select
                label="Select Target Course"
                value={selectedCourseId.toString()}
                onChange={(e) => setSelectedCourseId(Number(e.target.value))}
                options={courses.map((c) => ({ value: c.id.toString(), label: c.title }))}
              />
            )}
          </div>

          <div className="flex items-center gap-3 pt-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              id="sendEmailToggle"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="w-4 h-4 text-[#0FA3A3] rounded border-slate-300 focus:ring-[#0FA3A3]"
            />
            <label htmlFor="sendEmailToggle" className="text-xs text-slate-700 font-medium cursor-pointer">
              Also send transactional email alert to target candidates
            </label>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="teal" isLoading={submitting}>
              Publish & Push Alert
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
