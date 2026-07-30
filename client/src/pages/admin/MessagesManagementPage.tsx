import React, { useEffect, useState } from "react";
import { MessageSquare, Mail, CheckCircle2, Clock, Eye, Trash2 } from "lucide-react";
import { Card, Button, Table, Badge, Drawer } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { ContactMessage } from "../../types";
import { Toast } from "../../components/ui/ToastSystem";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const MessagesManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getContactMessages();
      setMessages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const openDrawer = async (msg: ContactMessage) => {
    setSelectedMessage(msg);
    if (msg.status === "new") {
      try {
        const updated = await adminApi.updateContactMessageStatus(msg.id, "read");
        setMessages(messages.map((m) => (m.id === msg.id ? updated : m)));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const markResolved = async (id: number) => {
    try {
      const updated = await adminApi.updateContactMessageStatus(id, "replied");
      setMessages(messages.map((m) => (m.id === id ? updated : m)));
      if (selectedMessage && selectedMessage.id === id) {
        setSelectedMessage(updated);
      }
      setToastMessage("Contact message marked as RESOLVED/REPLIED.");
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMessages = messages.filter((m) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.subject.toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q) ||
      String(m.id).includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Contact Inbox & Student Support Queries</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review inquiries sent via the Contact Us form, Raast payment inquiries, and course admission questions.
          </p>
        </div>
      </div>

      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "Sender & Subject",
              accessor: (row) => (
                <div className="space-y-1">
                  <div className={`text-sm ${row.status === "new" ? "font-extrabold text-[#0E2A47]" : "font-semibold text-slate-700"}`}>
                    {row.name}
                  </div>
                  <div className="text-xs text-[#0FA3A3] font-medium flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    {row.email}
                  </div>
                </div>
              ),
            },
            {
              header: "Subject & Excerpt",
              accessor: (row) => (
                <div className="space-y-1">
                  <div className={`text-xs ${row.status === "new" ? "font-bold text-[#0E2A47]" : "text-slate-800 font-medium"}`}>
                    {row.subject || "No Subject"}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 max-w-md">{row.message}</p>
                </div>
              ),
            },
            {
              header: "Received Date",
              accessor: (row) => <span className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleDateString()}</span>,
            },
            {
              header: "Status",
              accessor: (row) => (
                <Badge
                  variant={
                    row.status === "new" ? "danger" : row.status === "read" ? "warning" : "success"
                  }
                >
                  {row.status === "new" ? (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Unread</span>
                  ) : row.status === "read" ? (
                    "In Review"
                  ) : (
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved</span>
                  )}
                </Badge>
              ),
            },
            {
              header: "Actions",
              accessor: (row) => (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" icon={<Eye className="w-3.5 h-3.5" />} onClick={() => openDrawer(row)}>
                    View Query
                  </Button>
                  {row.status !== "replied" && (
                    <Button variant="teal" size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => markResolved(row.id)}>
                      Mark Resolved
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          data={filteredMessages}
          isLoading={loading}
          emptyText="No contact messages matching search query."
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        isOpen={!!selectedMessage}
        onClose={() => setSelectedMessage(null)}
        title="Contact Message Detail"
      >
        {selectedMessage && (
          <div className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Sender Name</label>
                <div className="text-base font-extrabold text-[#0E2A47]">{selectedMessage.name}</div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email Address</label>
                <div className="text-xs font-semibold text-[#0FA3A3]">{selectedMessage.email}</div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Received At</label>
                <div className="text-xs text-slate-600">{new Date(selectedMessage.createdAt).toLocaleString()}</div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Status</label>
                <div className="mt-1">
                  <Badge variant={selectedMessage.status === "new" ? "danger" : selectedMessage.status === "read" ? "warning" : "success"}>
                    {selectedMessage.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Subject Title</h4>
              <div className="p-3 bg-white border border-slate-200 rounded-lg text-sm font-bold text-[#0E2A47]">
                {selectedMessage.subject || "No Subject Specified"}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Full Message Content</h4>
              <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[140px]">
                {selectedMessage.message}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col gap-2">
              <a
                href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject || "SAMS Academy Inquiry")}`}
                className="w-full text-center px-4 py-2.5 bg-[#0E2A47] hover:bg-[#0A1E33] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" /> Reply via Email Client ({selectedMessage.email})
              </a>

              {selectedMessage.status !== "replied" && (
                <Button variant="teal" fullWidth icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => markResolved(selectedMessage.id)}>
                  Mark Query as Resolved
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
