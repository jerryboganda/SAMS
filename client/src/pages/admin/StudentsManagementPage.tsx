import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Search,
  RefreshCw,
  UserCheck,
  Smartphone,
  ShieldAlert,
  ArrowLeft,
  Calendar,
  Mail,
  Phone,
  Shield,
  Activity,
  BookOpen,
  ShoppingBag,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Clock,
} from "lucide-react";
import {
  Card,
  Button,
  Input,
  Table,
  Badge,
  Modal,
  ToastSystem,
  ConfirmDialog,
  Tabs,
} from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { User, UserDevice, LoginEvent, Order, Enrollment } from "../../types";
import { formatPKR, formatDate } from "../../utils/formatters";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const StudentsManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const { id: urlStudentId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [students, setStudents] = useState<User[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [toast, setToast] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // Detail View State
  const [activeTab, setActiveTab] = useState<"overview" | "enrollments" | "devices" | "activity" | "orders">("overview");
  const [studentDevices, setStudentDevices] = useState<UserDevice[]>([]);
  const [studentLoginEvents, setStudentLoginEvents] = useState<LoginEvent[]>([]);
  const [studentOrders, setStudentOrders] = useState<Order[]>([]);

  // Confirm Dialogs
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [isExtendConfirmOpen, setIsExtendConfirmOpen] = useState(false);
  const [extendCourseId, setExtendCourseId] = useState<number>(1);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getStudents();
      setStudents(data);

      if (urlStudentId) {
        const found = data.find((s) => s.id === Number(urlStudentId));
        if (found) {
          setSelectedStudent(found);
          loadStudentDetailData(found.id);
        }
      } else {
        setSelectedStudent(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentDetailData = async (studentId: number) => {
    try {
      const [devs, logEvts, ords] = await Promise.all([
        adminApi.getStudentDevices(studentId),
        adminApi.getStudentLoginEvents(studentId),
        adminApi.getStudentOrders(studentId),
      ]);
      setStudentDevices(devs);
      setStudentLoginEvents(logEvts);
      setStudentOrders(ords);
    } catch (err) {
      console.error("Failed to load student sub-data", err);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [urlStudentId]);

  // Actions
  const handleResetDevice = async () => {
    if (!selectedStudent) return;
    try {
      await adminApi.resetStudentDevices(selectedStudent.id);
      setSelectedStudent({ ...selectedStudent, activeDevicesCount: 0 });
      setStudentDevices([]);
      setToast(`Device lock reset successfully for ${selectedStudent.name}.`);
      setIsResetConfirmOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to reset device lock.");
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedStudent) return;
    const newStatus = selectedStudent.status === "active" ? "suspended" : "active";
    try {
      const updated = await adminApi.updateStudentStatus(selectedStudent.id, newStatus);
      setSelectedStudent(updated);
      setStudents(students.map((s) => (s.id === updated.id ? updated : s)));
      setToast(`Student account marked as ${newStatus.toUpperCase()}`);
      setIsStatusConfirmOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to update status.");
    }
  };

  const handleExtendEnrollment = async () => {
    if (!selectedStudent) return;
    try {
      await adminApi.extendStudentEnrollment(selectedStudent.id, extendCourseId, 30);
      setToast(`Enrollment validity extended by +30 Days for ${selectedStudent.name}.`);
      setIsExtendConfirmOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to extend validity.");
    }
  };

  const effectiveSearch = (globalSearch || search).trim().toLowerCase();

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      !effectiveSearch ||
      s.name.toLowerCase().includes(effectiveSearch) ||
      s.email.toLowerCase().includes(effectiveSearch) ||
      String(s.id).includes(effectiveSearch) ||
      (s.phone && s.phone.includes(effectiveSearch));
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Render Student Detail View if urlStudentId or selectedStudent is present
  if (selectedStudent && urlStudentId) {
    return (
      <div className="space-y-6 pb-12">
        {toast && (
          <ToastSystem
            toasts={[{ id: "1", type: "success", title: toast }]}
            onClose={() => setToast("")}
          />
        )}

        {/* Back Button & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin/students")}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
              title="Back to Roster"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-[#0E2A47]">{selectedStudent.name}</h1>
                <Badge
                  variant={selectedStudent.status === "active" ? "teal" : "danger"}
                  className="capitalize font-bold"
                >
                  {selectedStudent.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Candidate ID #{selectedStudent.id} • Registered {formatDate(selectedStudent.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="w-4 h-4 text-amber-600" />}
              onClick={() => setIsResetConfirmOpen(true)}
            >
              Reset Devices ({selectedStudent.activeDevicesCount || 0}/2)
            </Button>
            <Button
              variant={selectedStudent.status === "active" ? "danger" : "teal"}
              size="sm"
              onClick={() => setIsStatusConfirmOpen(true)}
            >
              {selectedStudent.status === "active" ? "Suspend Account" : "Activate Account"}
            </Button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-200 gap-2 sm:gap-6 overflow-x-auto pb-0">
          {[
            { key: "overview", label: "Candidate Overview", icon: UserCheck },
            { key: "enrollments", label: "Course Enrollments", icon: BookOpen },
            { key: "devices", label: "Registered Devices (DRM)", icon: Smartphone },
            { key: "activity", label: "Login & Security Log", icon: Activity },
            { key: "orders", label: "Order History", icon: ShoppingBag },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`pb-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                  active
                    ? "border-[#0FA3A3] text-[#0FA3A3]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-6 border-slate-200 space-y-6">
              <h3 className="text-base font-bold text-[#0E2A47]">Profile & Account Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Email Address
                  </span>
                  <p className="font-bold text-slate-800">{selectedStudent.email}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> WhatsApp Phone
                  </span>
                  <p className="font-bold text-slate-800">{selectedStudent.phone || "+92 300 0000000"}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" /> Account Role & 2FA
                  </span>
                  <p className="font-bold text-slate-800 capitalize">
                    {selectedStudent.role} • {selectedStudent.twofaEnabled ? "2FA Enabled 🛡️" : "2FA Disabled"}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Registration Date
                  </span>
                  <p className="font-bold text-slate-800">{formatDate(selectedStudent.createdAt)}</p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#0E2A47]">Account Status Toggle</h4>
                  <p className="text-xs text-slate-500">
                    Suspending an account revokes access to courses and QBank instantly.
                  </p>
                </div>
                <Button
                  variant={selectedStudent.status === "active" ? "danger" : "teal"}
                  size="sm"
                  onClick={() => setIsStatusConfirmOpen(true)}
                >
                  {selectedStudent.status === "active" ? "Suspend Account" : "Activate Account"}
                </Button>
              </div>
            </Card>

            {/* Quick Summary Card */}
            <Card className="p-6 border-slate-200 space-y-4 bg-gradient-to-br from-slate-900 to-[#0E2A47] text-white">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">DRM & Hardware Status</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Active Bound Devices</span>
                  <span className="font-bold text-white">{selectedStudent.activeDevicesCount || 0} / 2 Slots</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Last Active Session</span>
                  <span className="font-bold text-white">{formatDate(selectedStudent.lastLoginAt || new Date().toISOString())}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Login Security Status</span>
                  <span className="text-emerald-400 font-bold">Verified Clean</span>
                </div>
              </div>
              <Button
                variant="warning"
                fullWidth
                size="sm"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={() => setIsResetConfirmOpen(true)}
              >
                Clear Registered Devices
              </Button>
            </Card>
          </div>
        )}

        {/* TAB 2: ENROLLMENTS */}
        {activeTab === "enrollments" && (
          <Card className="p-6 border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0E2A47]">Active Course Access</h3>
                <p className="text-xs text-slate-500">View validity windows or extend access for candidate.</p>
              </div>
              <Button
                size="sm"
                variant="teal"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setIsExtendConfirmOpen(true)}
              >
                Extend / Grant Access
              </Button>
            </div>

            <Table
              columns={[
                {
                  header: "Course Package",
                  accessor: (row) => (
                    <div>
                      <p className="font-bold text-[#0E2A47]">NRE Step 1 Complete Preparation Masterclass</p>
                      <span className="text-xs text-slate-500">PMDC Exam Category • NRE1</span>
                    </div>
                  ),
                },
                {
                  header: "Source",
                  accessor: () => <Badge variant="teal">Order Purchase</Badge>,
                },
                {
                  header: "Validity Period",
                  accessor: () => <span className="text-xs font-semibold text-slate-700">180 Days (Expires in 142 days)</span>,
                },
                {
                  header: "Status",
                  accessor: () => <Badge variant="teal">ACTIVE</Badge>,
                },
                {
                  header: "Action",
                  accessor: () => (
                    <Button size="xs" variant="outline" onClick={() => setIsExtendConfirmOpen(true)}>
                      Extend +30 Days
                    </Button>
                  ),
                },
              ]}
              data={[{ id: 1 }]}
              keyExtractor={(r) => r.id}
            />
          </Card>
        )}

        {/* TAB 3: DEVICES */}
        {activeTab === "devices" && (
          <Card className="p-6 border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0E2A47]">Bound Hardware Devices (Max 2)</h3>
                <p className="text-xs text-slate-500">
                  Unique device fingerprints registered to this student account.
                </p>
              </div>
              <Button
                size="sm"
                variant="warning"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={() => setIsResetConfirmOpen(true)}
              >
                Reset All Device Slots
              </Button>
            </div>

            {studentDevices.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm space-y-2">
                <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold">No Active Devices Bound</p>
                <p className="text-xs text-slate-400">The candidate has 2 open slots available to pair new devices.</p>
              </div>
            ) : (
              <Table
                columns={[
                  {
                    header: "Device Name",
                    accessor: (dev: UserDevice) => (
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-[#0FA3A3]" />
                        <div>
                          <p className="font-bold text-[#0E2A47] text-xs">{dev.deviceName}</p>
                          <span className="font-mono text-[10px] text-slate-400">{dev.fingerprintHash || "fp_hash_valid"}</span>
                        </div>
                      </div>
                    ),
                  },
                  { header: "IP Address", accessor: (dev) => <span className="font-mono text-xs text-slate-700">{dev.lastIp}</span> },
                  { header: "Location", accessor: (dev) => <span className="text-xs font-semibold text-slate-700">{dev.location || "Lahore, PK"}</span> },
                  { header: "Last Seen", accessor: (dev) => <span className="text-xs text-slate-500">{formatDate(dev.lastSeenAt)}</span> },
                  {
                    header: "State",
                    accessor: (dev) => (
                      <Badge variant={dev.isActive ? "teal" : "gray"} size="sm">
                        {dev.isActive ? "ACTIVE" : "REVOKED"}
                      </Badge>
                    ),
                  },
                ]}
                data={studentDevices}
                keyExtractor={(d) => d.id}
              />
            )}
          </Card>
        )}

        {/* TAB 4: ACTIVITY / LOGIN LOGS */}
        {activeTab === "activity" && (
          <Card className="p-6 border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-[#0E2A47]">Security Audit & Login History</h3>
            <Table
              columns={[
                {
                  header: "Status",
                  accessor: (evt: LoginEvent) => (
                    <Badge
                      variant={
                        evt.status === "success"
                          ? "teal"
                          : evt.status === "suspicious"
                          ? "warning"
                          : "danger"
                      }
                      size="sm"
                    >
                      {evt.status.toUpperCase()}
                    </Badge>
                  ),
                },
                { header: "IP Address", accessor: (evt) => <span className="font-mono text-xs text-slate-800">{evt.ip}</span> },
                { header: "Country", accessor: (evt) => <span className="font-bold text-slate-700">{evt.country || "PK"}</span> },
                {
                  header: "User Agent",
                  accessor: (evt) => <span className="text-xs text-slate-600 line-clamp-1 max-w-xs">{evt.userAgent}</span>,
                },
                {
                  header: "Details / Flag Reason",
                  accessor: (evt) => (
                    <span className={`text-xs ${evt.status === "suspicious" ? "font-bold text-amber-700" : "text-slate-500"}`}>
                      {evt.reason || "Normal login sequence"}
                    </span>
                  ),
                },
                { header: "Timestamp", accessor: (evt) => <span className="text-xs text-slate-500">{formatDate(evt.createdAt)}</span> },
              ]}
              data={studentLoginEvents}
              keyExtractor={(e) => e.id}
            />
          </Card>
        )}

        {/* TAB 5: ORDERS */}
        {activeTab === "orders" && (
          <Card className="p-6 border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-[#0E2A47]">Candidate Purchase History</h3>
            <Table
              columns={[
                { header: "Invoice #", accessor: (o: Order) => <span className="font-mono font-bold text-xs text-[#0E2A47]">{o.invoiceNo}</span> },
                { header: "Course Title", accessor: "courseTitle" },
                { header: "Amount", accessor: (o) => <span className="font-bold text-[#0E2A47]">{formatPKR(o.finalAmount)}</span> },
                { header: "Gateway", accessor: (o) => <Badge variant="teal">{o.gateway.toUpperCase()}</Badge> },
                {
                  header: "Status",
                  accessor: (o) => (
                    <Badge variant={o.status === "paid" ? "teal" : o.status === "awaiting_verification" ? "warning" : "danger"}>
                      {o.status.toUpperCase()}
                    </Badge>
                  ),
                },
                { header: "Date", accessor: (o) => <span className="text-xs text-slate-500">{formatDate(o.createdAt)}</span> },
              ]}
              data={studentOrders}
              keyExtractor={(o) => o.id}
            />
          </Card>
        )}

        {/* Confirm Reset Dialog */}
        <ConfirmDialog
          isOpen={isResetConfirmOpen}
          title="Reset DRM Device Binding Slots"
          message={`Are you sure you want to clear all active hardware device bindings for candidate ${selectedStudent.name}? This will revoke their current device session tokens and allow them to pair 2 new devices.`}
          confirmLabel="Reset Devices"
          cancelLabel="Cancel"
          variant="warning"
          onConfirm={handleResetDevice}
          onCancel={() => setIsResetConfirmOpen(false)}
        />

        {/* Confirm Status Change */}
        <ConfirmDialog
          isOpen={isStatusConfirmOpen}
          title={selectedStudent.status === "active" ? "Suspend Candidate Account" : "Activate Candidate Account"}
          message={`Are you sure you want to change candidate ${selectedStudent.name}'s status to ${
            selectedStudent.status === "active" ? "SUSPENDED" : "ACTIVE"
          }?`}
          confirmLabel={selectedStudent.status === "active" ? "Suspend Now" : "Activate Now"}
          cancelLabel="Cancel"
          variant={selectedStudent.status === "active" ? "danger" : "info"}
          onConfirm={handleToggleStatus}
          onCancel={() => setIsStatusConfirmOpen(false)}
        />

        {/* Extend Validity Modal */}
        <ConfirmDialog
          isOpen={isExtendConfirmOpen}
          title="Extend Course Validity (+30 Days)"
          message={`Grant a 30-day extension to ${selectedStudent.name} for their NRE Step 1 Course enrollment?`}
          confirmLabel="Grant +30 Days"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={handleExtendEnrollment}
          onCancel={() => setIsExtendConfirmOpen(false)}
        />
      </div>
    );
  }

  // Render Table Roster View
  return (
    <div className="space-y-8 pb-12">
      {toast && (
        <ToastSystem
          toasts={[{ id: "1", type: "success", title: toast }]}
          onClose={() => setToast("")}
        />
      )}

      {/* Header */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Student Roster & DRM Control</h1>
          <p className="text-xs text-slate-500 mt-1">
            Search candidates, manage account statuses, review login security, and reset device limits.
          </p>
        </div>
      </div>

      <Card className="p-6 border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Input
            placeholder="Search candidate by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4 text-slate-400" />}
            className="w-full sm:w-80"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">Filter Status:</span>
            {["all", "active", "suspended"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-[#0E2A47] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading candidates...</div>
        ) : (
          <Table
            columns={[
              {
                header: "Candidate Name",
                accessor: (s: User) => (
                  <Link
                    to={`/admin/students/${s.id}`}
                    className="font-bold text-[#0E2A47] hover:text-[#0FA3A3] transition-colors"
                  >
                    {s.name}
                  </Link>
                ),
              },
              { header: "Email Address", accessor: "email" },
              {
                header: "WhatsApp Phone",
                accessor: (s: User) => <span className="text-xs font-semibold text-slate-700">{s.phone || "—"}</span>,
              },
              {
                header: "Joined Date",
                accessor: (s: User) => <span className="text-xs text-slate-500">{formatDate(s.createdAt)}</span>,
              },
              {
                header: "Device Slots",
                accessor: (s: User) => (
                  <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-1 rounded text-slate-800">
                    {s.activeDevicesCount || 0} / 2 Used
                  </span>
                ),
              },
              {
                header: "Status",
                accessor: (s: User) => (
                  <Badge variant={s.status === "active" ? "teal" : "danger"} size="sm">
                    {s.status.toUpperCase()}
                  </Badge>
                ),
              },
              {
                header: "Action",
                accessor: (s: User) => (
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => navigate(`/admin/students/${s.id}`)}
                    >
                      Manage
                    </Button>
                  </div>
                ),
              },
            ]}
            data={filteredStudents}
            keyExtractor={(s) => s.id}
          />
        )}
      </Card>
    </div>
  );
};
