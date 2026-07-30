import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DollarSign,
  Users,
  BookOpen,
  Clock,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  UserPlus,
  Ticket,
  FileQuestion,
  Settings,
  Eye,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Card, StatCard, Table, Badge, Button, ToastSystem } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { AdminDashboardKPIs, Order, User } from "../../types";
import { formatPKR, formatDate } from "../../utils/formatters";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const AdminDashboardPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<AdminDashboardKPIs | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<string>("");

  const loadData = async () => {
    try {
      const [kpiData, studentData] = await Promise.all([
        adminApi.getDashboardKPIs(),
        adminApi.getStudents(),
      ]);
      setKpis(kpiData);
      setStudents(studentData);
    } catch (err) {
      console.error("Dashboard error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleQuickApprove = async (orderId: number) => {
    try {
      await adminApi.approveBankTransfer(orderId);
      setToast(`Manual transfer for Order #${orderId} approved and course activated!`);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Approval failed.");
    }
  };

  if (loading || !kpis) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-8 h-8 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-500">Loading Executive Admin Dashboard...</p>
      </div>
    );
  }

  // Generate 30-day revenue mock points for the area chart
  const revenueTrendData = [
    { day: "Day 1", amount: 12000 },
    { day: "Day 5", amount: 15000 },
    { day: "Day 10", amount: 18000 },
    { day: "Day 15", amount: 14000 },
    { day: "Day 20", amount: 22000 },
    { day: "Day 25", amount: 28000 },
    { day: "Day 30", amount: 35000 },
  ];

  return (
    <div className="space-y-8 pb-12">
      {toast && (
        <ToastSystem
          toasts={[{ id: "1", type: "success", title: toast }]}
          onClose={() => setToast("")}
        />
      )}

      {/* Header Banner */}
      <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Executive Control Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time revenue metrics, candidate enrollments, manual payment approvals, and DRM logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/manual-payments"
            className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold text-xs hover:bg-amber-400 transition-colors shadow-xs"
          >
            <Clock className="w-4 h-4" />
            <span>Verify Manual Payments ({kpis.pendingTransfersCount})</span>
          </Link>
        </div>
      </div>

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Revenue This Month"
          value={formatPKR(kpis.revenue30d)}
          icon={<DollarSign className="w-5 h-5 text-[#0FA3A3]" />}
          subtext="+22.4% vs last month"
        />
        <StatCard
          title="New Student Candidates"
          value={kpis.newStudents30d.toString()}
          icon={<Users className="w-5 h-5 text-[#0FA3A3]" />}
          subtext="+14% new signups"
        />
        <StatCard
          title="Active Course Enrollments"
          value={kpis.activeEnrollmentsCount.toString()}
          icon={<BookOpen className="w-5 h-5 text-[#0FA3A3]" />}
        />
        <StatCard
          title="Pending Manual Payments"
          value={kpis.pendingTransfersCount.toString()}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
        />
      </div>

      {/* Quick Action Links Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Link
          to="/admin/manual-payments"
          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-teal-500 hover:shadow-xs transition-all flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-[#0E2A47] block group-hover:text-[#0FA3A3]">
              Manual Payments
            </span>
            <span className="text-[10px] text-slate-500">{kpis.pendingTransfersCount} pending</span>
          </div>
        </Link>

        <Link
          to="/admin/students"
          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-teal-500 hover:shadow-xs transition-all flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-[#0E2A47] block group-hover:text-[#0FA3A3]">
              Student Roster
            </span>
            <span className="text-[10px] text-slate-500">DRM & Devices</span>
          </div>
        </Link>

        <Link
          to="/admin/coupons"
          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-teal-500 hover:shadow-xs transition-all flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
            <Ticket className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-[#0E2A47] block group-hover:text-[#0FA3A3]">
              Promo Coupons
            </span>
            <span className="text-[10px] text-slate-500">Manage discounts</span>
          </div>
        </Link>

        <Link
          to="/admin/qbank"
          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-teal-500 hover:shadow-xs transition-all flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
            <FileQuestion className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-[#0E2A47] block group-hover:text-[#0FA3A3]">
              QBank Questions
            </span>
            <span className="text-[10px] text-slate-500">200+ Vignettes</span>
          </div>
        </Link>

        <Link
          to="/admin/settings"
          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-teal-500 hover:shadow-xs transition-all flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-[#0E2A47] block group-hover:text-[#0FA3A3]">
              System Settings
            </span>
            <span className="text-[10px] text-slate-500">Gateways & Keys</span>
          </div>
        </Link>
      </div>

      {/* 30-Day Revenue Area Chart Section */}
      {kpis && (
        <Card className="p-6 border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#0FA3A3]" />
              <div>
                <h3 className="text-base font-bold text-[#0E2A47]">30-Day Revenue Trend (PKR)</h3>
                <p className="text-xs text-slate-500">Gross platform sales trajectory over the past 30 days.</p>
              </div>
            </div>
            <span className="font-extrabold text-lg text-[#0E2A47]">{formatPKR(kpis.revenue30d)}</span>
          </div>

          {/* Visual Revenue Spark Area Chart */}
          <div className="h-44 w-full bg-gradient-to-b from-teal-50/50 to-white rounded-xl p-4 border border-slate-200 flex flex-col justify-end">
            <div className="flex items-end justify-between h-32 gap-2 pt-4">
              {revenueTrendData.map((pt, i) => {
                const heightPct = Math.round((pt.amount / 35000) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[10px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatPKR(pt.amount)}
                    </span>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-12 bg-gradient-to-t from-[#0E2A47] to-[#0FA3A3] rounded-t-md transition-all group-hover:brightness-125"
                    />
                    <span className="text-[10px] text-slate-500 font-semibold">{pt.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Filtered Data Prep for Global Search */}
      {(() => {
        const q = globalSearch.trim().toLowerCase();
        const filteredRecentOrders = (kpis?.recentOrders || []).filter((o) => {
          if (!q) return true;
          return (
            o.invoiceNo.toLowerCase().includes(q) ||
            String(o.id).includes(q) ||
            (o.userName && o.userName.toLowerCase().includes(q)) ||
            (o.userEmail && o.userEmail.toLowerCase().includes(q)) ||
            (o.courseTitle && o.courseTitle.toLowerCase().includes(q))
          );
        });

        const filteredStudentsList = students.filter((s) => {
          if (!q) return true;
          return (
            s.name.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q) ||
            String(s.id).includes(q) ||
            (s.phone && s.phone.includes(q))
          );
        });

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Orders (2 Cols) */}
            <Card className="lg:col-span-2 p-6 border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-[#0E2A47]">Recent Purchase Orders</h3>
                <Link to="/admin/orders" className="text-xs font-bold text-[#0FA3A3] hover:underline flex items-center gap-1">
                  View All Orders <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <Table
                columns={[
                  {
                    header: "Invoice #",
                    accessor: (o: Order) => (
                      <Link
                        to={`/admin/orders/${o.id}`}
                        className="font-mono text-xs font-bold text-[#0E2A47] hover:text-[#0FA3A3]"
                      >
                        {o.invoiceNo}
                      </Link>
                    ),
                  },
                  { header: "Candidate", accessor: (o) => <span className="font-semibold text-slate-800">{o.userName}</span> },
                  { header: "Amount", accessor: (o) => <span className="font-bold text-[#0E2A47]">{formatPKR(o.finalAmount)}</span> },
                  {
                    header: "Gateway",
                    accessor: (o) => (
                      <Badge variant={o.gateway === "raast" ? "teal" : "indigo"} size="sm">
                        {o.gateway.toUpperCase()}
                      </Badge>
                    ),
                  },
                  {
                    header: "Status",
                    accessor: (o) => (
                      <Badge
                        variant={
                          o.status === "paid"
                            ? "teal"
                            : o.status === "awaiting_verification"
                            ? "warning"
                            : "danger"
                        }
                        size="sm"
                      >
                        {o.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    ),
                  },
                  {
                    header: "Action",
                    accessor: (o) =>
                      o.status === "awaiting_verification" ? (
                        <Button
                          size="xs"
                          variant="teal"
                          onClick={() => handleQuickApprove(o.id)}
                        >
                          Approve
                        </Button>
                      ) : (
                        <Button size="xs" variant="outline" onClick={() => navigate(`/admin/orders/${o.id}`)}>
                          View
                        </Button>
                      ),
                  },
                ]}
                data={filteredRecentOrders.slice(0, 5)}
                keyExtractor={(o) => o.id}
                emptyText="No orders matched search filter."
              />
            </Card>

            {/* Recent Candidate Registrations (1 Col) */}
            <Card className="p-6 border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-[#0E2A47]">Recent Candidates</h3>
                <Link to="/admin/students" className="text-xs font-bold text-[#0FA3A3] hover:underline flex items-center gap-1">
                  All Students <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="space-y-3">
                {filteredStudentsList.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/admin/students/${s.id}`)}
                    className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-bold text-[#0E2A47] text-xs">{s.name}</p>
                      <p className="text-[10px] text-slate-500">{s.email}</p>
                    </div>
                    <Badge variant={s.status === "active" ? "teal" : "danger"} size="sm">
                      {s.status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
                {filteredStudentsList.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">No candidates match search.</p>
                )}
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
};
