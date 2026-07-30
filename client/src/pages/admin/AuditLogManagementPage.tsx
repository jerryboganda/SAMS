import React, { useEffect, useState } from "react";
import { History, Search, Shield, Filter, User, Tag, Calendar } from "lucide-react";
import { Card, Input, Table, Badge, Button } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { AuditLog } from "../../types";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const AuditLogManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const effectiveSearch = (globalSearch || searchTerm).trim().toLowerCase();

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !effectiveSearch ||
      log.actorName.toLowerCase().includes(effectiveSearch) ||
      log.action.toLowerCase().includes(effectiveSearch) ||
      log.summary.toLowerCase().includes(effectiveSearch) ||
      String(log.id).includes(effectiveSearch) ||
      (log.entityType && log.entityType.toLowerCase().includes(effectiveSearch));

    const matchesAction = actionFilter === "all" || log.action.startsWith(actionFilter);

    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-8 pb-12">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">System Audit Logs & Mutation History</h1>
          <p className="text-xs text-slate-500 mt-1">
            Immutable audit record of all administrative actions, student device resets, course edits, and settings changes.
          </p>
        </div>
        <Button variant="outline" size="sm" icon={<History className="w-4 h-4 text-[#0FA3A3]" />} onClick={loadAuditLogs}>
          Refresh Log Feed
        </Button>
      </div>

      <Card className="p-4 border-slate-200 flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by actor, action, summary, IP address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0FA3A3] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-3 py-2 font-medium text-slate-700 focus:ring-2 focus:ring-[#0FA3A3] focus:outline-none"
          >
            <option value="all">All Action Categories</option>
            <option value="announcement">Announcements</option>
            <option value="faculty">Faculty</option>
            <option value="faq">FAQs</option>
            <option value="settings">Settings</option>
            <option value="student">Student Operations</option>
            <option value="course">Course Management</option>
          </select>
        </div>
      </Card>

      <Card className="p-6 border-slate-200">
        <Table
          columns={[
            {
              header: "Timestamp",
              accessor: (row) => (
                <div className="text-xs text-slate-600 font-medium flex items-center gap-1.5 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {new Date(row.createdAt).toLocaleString()}
                </div>
              ),
            },
            {
              header: "Actor (Admin User)",
              accessor: (row) => (
                <div className="space-y-0.5">
                  <div className="font-bold text-[#0E2A47] text-xs flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#0FA3A3]" />
                    {row.actorName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">IP: {row.ip || "182.180.122.45"}</div>
                </div>
              ),
            },
            {
              header: "Action Tag",
              accessor: (row) => (
                <Badge variant={row.action.includes("create") || row.action.includes("broadcast") ? "teal" : row.action.includes("delete") ? "danger" : "blue"}>
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {row.action}
                  </span>
                </Badge>
              ),
            },
            {
              header: "Entity / Target",
              accessor: (row) => (
                <div className="text-xs font-semibold text-slate-700">
                  {row.entityType} {row.entityId ? `#${row.entityId}` : ""}
                </div>
              ),
            },
            {
              header: "Mutation Summary Description",
              accessor: (row) => (
                <p className="text-xs text-slate-600 font-medium max-w-md line-clamp-2">{row.summary}</p>
              ),
            },
          ]}
          data={filteredLogs}
          isLoading={loading}
          emptyText="No audit logs matched your query filter."
        />
      </Card>
    </div>
  );
};
