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
  Edit,
} from "lucide-react";
import {
  Card,
  Button,
  Input,
  Table,
  Badge,
  Modal,
  Select,
  ToastSystem,
  ConfirmDialog,
  Tabs,
} from "../../components/ui";
import {
  AddStudentModal,
  EditStudentModal,
  PostCreateCredentialsModal,
} from "../../components/admin";
import { adminApi } from "../../api/endpoints/admin";
import { User, UserDevice, LoginEvent, Order, Enrollment, Course } from "../../types";
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

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  const [createdCredentialsData, setCreatedCredentialsData] = useState<{
    name: string;
    email: string;
    password: string;
    enrollments: { courseTitle: string; expiresAt: string }[];
  } | null>(null);

  // Detail View State
  const [activeTab, setActiveTab] = useState<"overview" | "enrollments" | "devices" | "activity" | "orders">("overview");
  const [studentDevices, setStudentDevices] = useState<UserDevice[]>([]);
  const [studentLoginEvents, setStudentLoginEvents] = useState<LoginEvent[]>([]);
  const [studentOrders, setStudentOrders] = useState<Order[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<Enrollment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  // Confirm Dialogs
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [isAnonymizeConfirmOpen, setIsAnonymizeConfirmOpen] = useState(false);
  const [anonymizeSubmitting, setAnonymizeSubmitting] = useState(false);

  // Enrollments Tab: Grant Modal
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [grantCourseId, setGrantCourseId] = useState<number>(0);
  const [grantDays, setGrantDays] = useState<number>(30);
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  // Enrollments Tab: Per-row Extend / Revoke
  const [extendingEnrollmentId, setExtendingEnrollmentId] = useState<number | null>(null);
  const [isRevokeConfirmOpen, setIsRevokeConfirmOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Enrollment | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const [data, crs] = await Promise.all([
        adminApi.getStudents(),
        courses.length === 0 ? adminApi.getCourses() : Promise.resolve(courses),
      ]);
      setStudents(data);
      if (courses.length === 0) {
        setCourses(crs);
      }

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
      const [devs, logEvts, ords, enrolls, crs] = await Promise.all([
        adminApi.getStudentDevices(studentId),
        adminApi.getStudentLoginEvents(studentId),
        adminApi.getStudentOrders(studentId),
        adminApi.getStudentEnrollments(studentId),
        adminApi.getCourses(),
      ]);
      setStudentDevices(devs);
      setStudentLoginEvents(logEvts);
      setStudentOrders(ords);
      setStudentEnrollments(enrolls);
      setCourses(crs);
      if (crs.length > 0) setGrantCourseId(crs[0].id);
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

  // Phase 12.5 security-audit finding M-3 (docs/10_SECURITY_CHECKLIST.md §I)
  // — scrubs PII (email->hash, name->"Deleted user") and permanently
  // disables the account; every order/enrollment/audit-log/test-history row
  // is preserved untouched. Irreversible, so gated behind its own confirm
  // dialog (same pattern as handleResetDevice/handleToggleStatus above).
  const handleAnonymize = async () => {
    if (!selectedStudent) return;
    setAnonymizeSubmitting(true);
    try {
      const updated = await adminApi.anonymizeStudent(selectedStudent.id);
      setSelectedStudent(updated);
      setStudents(students.map((s) => (s.id === updated.id ? updated : s)));
      setToast(`Account anonymized — all personal data for #${updated.id} has been permanently scrubbed.`);
      setIsAnonymizeConfirmOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to anonymize this account.");
    } finally {
      setAnonymizeSubmitting(false);
    }
  };

  const handleGrantEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !grantCourseId) return;
    setGrantSubmitting(true);
    try {
      const newEnrollment = await adminApi.grantStudentEnrollment(selectedStudent.id, grantCourseId, grantDays);
      setStudentEnrollments((prev) => [newEnrollment, ...prev]);
      setToast(`Granted ${grantDays}-day access to "${newEnrollment.courseTitle || "the course"}" for ${selectedStudent.name}.`);
      setIsGrantModalOpen(false);
      setGrantDays(30);
    } catch (err: any) {
      alert(err.message || "Failed to grant course enrollment.");
    } finally {
      setGrantSubmitting(false);
    }
  };

  const handleExtendRowEnrollment = async (enrollment: Enrollment) => {
    if (!selectedStudent) return;
    setExtendingEnrollmentId(enrollment.id);
    try {
      const updated = await adminApi.extendEnrollment(enrollment.id, 30);
      setStudentEnrollments((prev) => prev.map((en) => (en.id === updated.id ? updated : en)));
      setToast(`Extended "${enrollment.courseTitle || "course"}" validity by +30 Days for ${selectedStudent.name}.`);
    } catch (err: any) {
      alert(err.message || "Failed to extend enrollment validity.");
    } finally {
      setExtendingEnrollmentId(null);
    }
  };

  const handleRevokeEnrollment = async () => {
    if (!selectedStudent || !revokeTarget) return;
    setRevokeSubmitting(true);
    try {
      const updated = await adminApi.revokeEnrollment(revokeTarget.id);
      setStudentEnrollments((prev) => prev.map((en) => (en.id === updated.id ? updated : en)));
      setToast(`Revoked access to "${revokeTarget.courseTitle || "the course"}" for ${selectedStudent.name}.`);
      setIsRevokeConfirmOpen(false);
      setRevokeTarget(null);
    } catch (err: any) {
      alert(err.message || "Failed to revoke enrollment.");
    } finally {
      setRevokeSubmitting(false);
    }
  };

  const getDaysUntil = (dateStr: string): number => {
    const diffMs = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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
              icon={<Edit className="w-4 h-4 text-slate-600" />}
              onClick={() => {
                setEditingStudent(selectedStudent);
                setIsEditModalOpen(true);
              }}
            >
              Edit Profile
            </Button>
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

              <div className="border-t border-red-100 bg-red-50/60 -mx-6 -mb-6 px-6 py-4 rounded-b-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-red-700">Danger Zone — Anonymize Account</h4>
                  <p className="text-xs text-slate-500">
                    Permanently scrubs this candidate's name/email/phone and disables login. Orders, enrollments, and
                    exam history are preserved. This cannot be undone.
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => setIsAnonymizeConfirmOpen(true)}>
                  Anonymize Account
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
                <h3 className="text-base font-bold text-[#0E2A47]">Course Enrollments</h3>
                <p className="text-xs text-slate-500">View validity windows, grant new access, extend, or revoke enrollments for this candidate.</p>
              </div>
              <Button
                size="sm"
                variant="teal"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setIsGrantModalOpen(true)}
              >
                Grant New Enrollment
              </Button>
            </div>

            <Table
              columns={[
                {
                  header: "Course Package",
                  accessor: (row: Enrollment) => (
                    <div>
                      <p className="font-bold text-[#0E2A47]">{row.courseTitle || `Course #${row.courseId}`}</p>
                      <span className="text-xs text-slate-500">Course ID #{row.courseId}</span>
                    </div>
                  ),
                },
                {
                  header: "Source",
                  accessor: (row: Enrollment) => (
                    <Badge variant={row.source === "purchase" ? "teal" : "blue"}>
                      {row.source === "purchase" ? "Order Purchase" : "Manual Grant"}
                    </Badge>
                  ),
                },
                {
                  header: "Status",
                  accessor: (row: Enrollment) => (
                    <Badge
                      variant={row.status === "active" ? "teal" : row.status === "expired" ? "warning" : "danger"}
                    >
                      {row.status.toUpperCase()}
                    </Badge>
                  ),
                },
                {
                  header: "Expires",
                  accessor: (row: Enrollment) => {
                    const daysLeft = getDaysUntil(row.expiresAt);
                    return (
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{formatDate(row.expiresAt)}</p>
                        {row.status === "active" && (
                          <span
                            className={`text-[11px] ${daysLeft <= 14 ? "font-bold text-amber-600" : "text-slate-500"}`}
                          >
                            {daysLeft >= 0 ? `Expires in ${daysLeft} days` : `Expired ${Math.abs(daysLeft)} days ago`}
                          </span>
                        )}
                      </div>
                    );
                  },
                },
                {
                  header: "Action",
                  accessor: (row: Enrollment) => (
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        isLoading={extendingEnrollmentId === row.id}
                        onClick={() => handleExtendRowEnrollment(row)}
                      >
                        Extend +30 Days
                      </Button>
                      {row.status === "active" && (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => {
                            setRevokeTarget(row);
                            setIsRevokeConfirmOpen(true);
                          }}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={studentEnrollments}
              keyExtractor={(r) => r.id}
              emptyText="This candidate has no course enrollments yet. Use “Grant New Enrollment” to give access."
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

        {/* Confirm Anonymize (irreversible) */}
        <ConfirmDialog
          isOpen={isAnonymizeConfirmOpen}
          title="Anonymize Candidate Account"
          message={`This will permanently scrub ${selectedStudent.name}'s name, email, and phone number, and disable their login. Their orders, enrollments, and exam history are kept intact for financial/audit records. This action CANNOT be undone. Continue?`}
          confirmLabel="Anonymize Permanently"
          cancelLabel="Cancel"
          variant="danger"
          isLoading={anonymizeSubmitting}
          onConfirm={handleAnonymize}
          onCancel={() => setIsAnonymizeConfirmOpen(false)}
        />

        {/* Grant New Enrollment Modal */}
        <Modal
          isOpen={isGrantModalOpen}
          onClose={() => setIsGrantModalOpen(false)}
          title="Grant New Course Enrollment"
          description={`Manually enroll ${selectedStudent.name} into a course for a fixed validity period.`}
        >
          <form onSubmit={handleGrantEnrollment} className="space-y-4">
            <Select
              label="Course"
              value={grantCourseId.toString()}
              onChange={(e) => setGrantCourseId(Number(e.target.value))}
              options={courses.map((c) => ({ value: c.id.toString(), label: c.title }))}
            />

            <Input
              label="Validity (Days)"
              type="number"
              min={1}
              required
              value={grantDays}
              onChange={(e) => setGrantDays(Number(e.target.value))}
              helperText="Number of days the candidate will have access starting today."
            />

            <div className="pt-2 flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setIsGrantModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="teal" isLoading={grantSubmitting} disabled={!grantCourseId}>
                Grant Access
              </Button>
            </div>
          </form>
        </Modal>

        {/* Revoke Enrollment Confirm Dialog */}
        <ConfirmDialog
          isOpen={isRevokeConfirmOpen}
          title="Revoke Course Enrollment"
          message={`Are you sure you want to revoke ${selectedStudent.name}'s access to "${revokeTarget?.courseTitle || "this course"}"? This immediately removes their course and QBank access.`}
          confirmLabel="Revoke Access"
          cancelLabel="Cancel"
          variant="danger"
          isLoading={revokeSubmitting}
          onConfirm={handleRevokeEnrollment}
          onCancel={() => {
            setIsRevokeConfirmOpen(false);
            setRevokeTarget(null);
          }}
        />

        {/* Modals */}
        <AddStudentModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          courses={courses}
          onCreated={(newStudent, creds) => {
            setStudents((prev) => [newStudent, ...prev]);
            setCreatedCredentialsData(creds);
            setToast(`Candidate ${newStudent.name} registered successfully.`);
          }}
        />

        <EditStudentModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingStudent(null);
          }}
          student={editingStudent}
          onUpdated={(updatedStudent) => {
            setStudents((prev) =>
              prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
            );
            if (selectedStudent?.id === updatedStudent.id) {
              setSelectedStudent(updatedStudent);
            }
            setToast(`Updated student profile for ${updatedStudent.name}.`);
          }}
        />

        <PostCreateCredentialsModal
          isOpen={Boolean(createdCredentialsData)}
          onClose={() => setCreatedCredentialsData(null)}
          data={createdCredentialsData}
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
        <Button
          variant="teal"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsAddModalOpen(true)}
        >
          Add New Student
        </Button>
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
                      onClick={() => {
                        setEditingStudent(s);
                        setIsEditModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="teal"
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

      {/* Modals */}
      <AddStudentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        courses={courses}
        onCreated={(newStudent, creds) => {
          setStudents((prev) => [newStudent, ...prev]);
          setCreatedCredentialsData(creds);
          setToast(`Candidate ${newStudent.name} registered successfully.`);
        }}
      />

      <EditStudentModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingStudent(null);
        }}
        student={editingStudent}
        onUpdated={(updatedStudent) => {
          setStudents((prev) =>
            prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
          );
          if (selectedStudent?.id === updatedStudent.id) {
            setSelectedStudent(updatedStudent);
          }
          setToast(`Updated student profile for ${updatedStudent.name}.`);
        }}
      />

      <PostCreateCredentialsModal
        isOpen={Boolean(createdCredentialsData)}
        onClose={() => setCreatedCredentialsData(null)}
        data={createdCredentialsData}
      />
    </div>
  );
};
