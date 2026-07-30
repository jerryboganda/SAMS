import React, { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  History,
  AlertCircle,
  FileText,
  Search,
  Check,
  X,
} from "lucide-react";
import {
  Card,
  Button,
  Table,
  Badge,
  Modal,
  ToastSystem,
  ConfirmDialog,
  Textarea,
  Input,
  Tabs,
} from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { Order } from "../../types";
import { formatPKR } from "../../utils/formatters";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const ManualPaymentsPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string>("");
  const [search, setSearch] = useState("");

  // Lightbox Modal
  const [lightboxProof, setLightboxProof] = useState<{
    imageUrl: string;
    refNo?: string;
    studentName?: string;
    amount?: number;
    gateway?: string;
  } | null>(null);

  // Approve Confirm Dialog
  const [approveTarget, setApproveTarget] = useState<Order | null>(null);

  // Reject Reason Modal
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getOrders();
      setOrders(data);
    } catch (err) {
      console.error("Failed to load bank transfers", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveConfirm = async () => {
    if (!approveTarget) return;
    try {
      await adminApi.approveBankTransfer(approveTarget.id);
      setToast(`Enrollment activated for ${approveTarget.userName || "Student"}`);
      setApproveTarget(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Approval failed.");
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    try {
      await adminApi.rejectBankTransfer(rejectTarget.id, rejectReason || "Payment mismatch / missing proof");
      setToast(`Manual transfer rejected for order ${rejectTarget.invoiceNo}`);
      setRejectTarget(null);
      setRejectReason("");
      await loadData();
    } catch (err: any) {
      alert(err.message || "Rejection failed.");
    }
  };

  // Filter pending vs history
  const pendingQueue = orders.filter(
    (o) =>
      (o.status === "awaiting_verification" || (o.proof && o.proof.status === "pending")) &&
      (o.gateway === "bank_transfer" || o.gateway === "raast" || o.gateway === "manual")
  );

  const historyQueue = orders.filter(
    (o) =>
      (o.status === "paid" || o.status === "failed" || o.status === "cancelled") &&
      (o.gateway === "bank_transfer" || o.gateway === "raast" || o.gateway === "manual")
  );

  const filterList = (list: Order[]) => {
    const q = (globalSearch || search).trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.invoiceNo.toLowerCase().includes(q) ||
        String(o.id).includes(q) ||
        (o.userName && o.userName.toLowerCase().includes(q)) ||
        (o.userEmail && o.userEmail.toLowerCase().includes(q)) ||
        (o.courseTitle && o.courseTitle.toLowerCase().includes(q)) ||
        (o.proof?.referenceNo && o.proof.referenceNo.toLowerCase().includes(q))
    );
  };

  const currentPending = filterList(pendingQueue);
  const currentHistory = filterList(historyQueue);

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#0E2A47]">Manual Payments Verification Queue</h1>
            <Badge variant="warning" className="font-bold">
              {pendingQueue.length} Pending
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review bank deposit receipts, Raast transaction references, and approve course enrollments.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search invoice, student, or ref #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4 text-slate-400" />}
          />
        </div>
      </div>

      {/* Queue Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("pending")}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "pending"
              ? "border-[#0FA3A3] text-[#0FA3A3]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          Pending Verification Queue
          <span className="ml-1 px-2 py-0.5 text-xs bg-amber-100 text-amber-800 font-extrabold rounded-full">
            {pendingQueue.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "history"
              ? "border-[#0FA3A3] text-[#0FA3A3]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <History className="w-4 h-4" />
          Transfer History & Logs
          <span className="ml-1 px-2 py-0.5 text-xs bg-slate-100 text-slate-700 font-extrabold rounded-full">
            {historyQueue.length}
          </span>
        </button>
      </div>

      {activeTab === "pending" ? (
        <Card className="p-6 border-slate-200">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading queue...</div>
          ) : currentPending.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-[#0E2A47]">All Manual Payments Verified</h3>
              <p className="text-xs text-slate-500">There are no pending bank or Raast transfer submissions awaiting approval.</p>
            </div>
          ) : (
            <Table
              columns={[
                {
                  header: "Gateway",
                  accessor: (row) => (
                    <Badge
                      variant={row.gateway === "raast" ? "teal" : "indigo"}
                      className="uppercase font-bold tracking-wider text-[10px]"
                    >
                      {row.gateway === "raast" ? "⚡ Raast ID" : "🏛️ Bank Transfer"}
                    </Badge>
                  ),
                },
                {
                  header: "Candidate & Invoice",
                  accessor: (row) => (
                    <div>
                      <p className="font-bold text-[#0E2A47] leading-tight">{row.userName || "Student"}</p>
                      <span className="font-mono text-xs text-slate-500">{row.invoiceNo}</span>
                    </div>
                  ),
                },
                {
                  header: "Enrolled Course",
                  accessor: (row) => (
                    <span className="text-xs font-medium text-slate-700 line-clamp-1 max-w-xs">
                      {row.courseTitle}
                    </span>
                  ),
                },
                {
                  header: "Amount",
                  accessor: (row) => (
                    <span className="font-extrabold text-[#0E2A47] text-sm">
                      {formatPKR(row.finalAmount || row.amount)}
                    </span>
                  ),
                },
                {
                  header: "Reference #",
                  accessor: (row) => (
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded-md text-slate-800 font-semibold border border-slate-200">
                      {row.proof?.referenceNo || "REF-NOT-PROVIDED"}
                    </span>
                  ),
                },
                {
                  header: "Deposit Receipt",
                  accessor: (row) =>
                    row.proof?.filePath ? (
                      <button
                        onClick={() =>
                          setLightboxProof({
                            imageUrl: row.proof?.filePath || "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80",
                            refNo: row.proof?.referenceNo,
                            studentName: row.userName,
                            amount: row.finalAmount,
                            gateway: row.gateway,
                          })
                        }
                        className="group flex items-center gap-2 p-1 border border-slate-200 rounded-lg hover:border-teal-500 bg-slate-50 transition-all text-left"
                      >
                        <img
                          src={row.proof.filePath}
                          alt="Proof"
                          className="w-8 h-8 rounded object-cover border border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLElement).setAttribute("src", "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80");
                          }}
                        />
                        <div className="text-[10px]">
                          <span className="text-[#0FA3A3] font-bold group-hover:underline flex items-center gap-1">
                            <Eye className="w-3 h-3" /> View Proof
                          </span>
                        </div>
                      </button>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium">No Image</span>
                    ),
                },
                {
                  header: "Verification Actions",
                  accessor: (row) => (
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="teal"
                        icon={<Check className="w-3.5 h-3.5" />}
                        onClick={() => setApproveTarget(row)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="xs"
                        variant="danger"
                        icon={<X className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setRejectTarget(row);
                          setRejectReason("");
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ),
                },
              ]}
              data={currentPending}
              keyExtractor={(r) => r.id}
            />
          )}
        </Card>
      ) : (
        <Card className="p-6 border-slate-200">
          <Table
            columns={[
              {
                header: "Gateway",
                accessor: (row) => (
                  <Badge variant={row.gateway === "raast" ? "teal" : "indigo"} size="sm">
                    {row.gateway.toUpperCase()}
                  </Badge>
                ),
              },
              {
                header: "Invoice #",
                accessor: (row) => <span className="font-mono font-bold text-[#0E2A47] text-xs">{row.invoiceNo}</span>,
              },
              { header: "Candidate", accessor: (row) => <span className="font-semibold text-slate-800">{row.userName}</span> },
              { header: "Amount", accessor: (row) => <span className="font-bold text-[#0E2A47]">{formatPKR(row.finalAmount)}</span> },
              {
                header: "Status",
                accessor: (row) => (
                  <Badge variant={row.status === "paid" ? "teal" : "danger"} size="sm">
                    {row.status === "paid" ? "APPROVED & ACTIVATED" : "REJECTED"}
                  </Badge>
                ),
              },
              {
                header: "Reviewer & Details",
                accessor: (row) => (
                  <div className="text-xs space-y-0.5 text-slate-600">
                    <p className="font-medium text-slate-800">{row.proof?.reviewedBy || "Dr. Zabih Ullah (Admin)"}</p>
                    {row.proof?.rejectReason && (
                      <p className="text-red-600 font-semibold italic">Reason: {row.proof.rejectReason}</p>
                    )}
                  </div>
                ),
              },
            ]}
            data={currentHistory}
            keyExtractor={(r) => r.id}
          />
        </Card>
      )}

      {/* Lightbox Modal */}
      {lightboxProof && (
        <Modal
          isOpen={!!lightboxProof}
          onClose={() => setLightboxProof(null)}
          title={`Payment Proof — ${lightboxProof.studentName}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">Gateway & Amount</span>
                <span className="font-bold text-[#0E2A47] text-sm uppercase">
                  {lightboxProof.gateway} • {formatPKR(lightboxProof.amount || 0)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Txn Reference No</span>
                <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {lightboxProof.refNo || "N/A"}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-900 max-h-96 flex items-center justify-center p-2">
              <img
                src={lightboxProof.imageUrl}
                alt="Bank Transfer Proof"
                className="max-h-88 max-w-full object-contain rounded-lg"
                onError={(e) => {
                  (e.target as HTMLElement).setAttribute("src", "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80");
                }}
              />
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setLightboxProof(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Approve Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!approveTarget}
        title="Approve Manual Payment & Activate Course"
        message={`Are you sure you want to approve the ${approveTarget?.gateway.toUpperCase()} payment for order ${approveTarget?.invoiceNo}? This will immediately activate course access for candidate ${approveTarget?.userName}.`}
        confirmLabel="Approve & Activate"
        cancelLabel="Cancel"
        variant="info"
        onConfirm={handleApproveConfirm}
        onCancel={() => setApproveTarget(null)}
      />

      {/* Reject Modal */}
      {rejectTarget && (
        <Modal
          isOpen={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          title={`Reject Manual Payment — ${rejectTarget.invoiceNo}`}
        >
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              Rejecting this payment request will mark the order as failed. The student will be notified and asked to submit valid payment proof.
            </div>

            <Textarea
              label="Rejection Reason"
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Transaction reference number was not found in bank statement, or screenshot was illegible."
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" type="submit">
                Confirm Rejection
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
