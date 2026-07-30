import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Eye,
  FileText,
  DollarSign,
  ArrowLeft,
  Calendar,
  CreditCard,
  Code,
  ShieldAlert,
} from "lucide-react";
import {
  Card,
  Button,
  Table,
  Badge,
  Modal,
  ToastSystem,
  Textarea,
  Input,
  Select,
} from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { Order, PaymentEvent } from "../../types";
import { formatPKR, formatDate } from "../../utils/formatters";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const OrdersManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const { id: urlOrderId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");

  // Modals for Actions
  const [isMarkPaidModalOpen, setIsMarkPaidModalOpen] = useState(false);
  const [markPaidReason, setMarkPaidReason] = useState("");

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getOrders();
      setOrders(data);

      if (urlOrderId) {
        const found = data.find((o) => o.id === Number(urlOrderId) || o.invoiceNo === urlOrderId);
        if (found) {
          setSelectedOrder(found);
          loadOrderEvents(found.id);
        }
      } else {
        setSelectedOrder(null);
      }
    } catch (err) {
      console.error("Failed to load orders", err);
    } finally {
      setLoading(false);
    }
  };

  const loadOrderEvents = async (orderId: number) => {
    try {
      const events = await adminApi.getPaymentEvents(orderId);
      setPaymentEvents(events);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [urlOrderId]);

  // Actions
  const handleMarkPaidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      const updated = await adminApi.markOrderAsPaid(selectedOrder.id, markPaidReason || "Manual payment verification");
      setSelectedOrder(updated);
      setOrders(orders.map((o) => (o.id === updated.id ? updated : o)));
      setToast(`Order ${updated.invoiceNo} marked as PAID. Course activated for student!`);
      setIsMarkPaidModalOpen(false);
      setMarkPaidReason("");
    } catch (err: any) {
      alert(err.message || "Action failed.");
    }
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      const updated = await adminApi.flagOrderRefund(selectedOrder.id, refundReason || "Candidate refund requested");
      setSelectedOrder(updated);
      setOrders(orders.map((o) => (o.id === updated.id ? updated : o)));
      setToast(`Order ${updated.invoiceNo} flagged as REFUNDED.`);
      setIsRefundModalOpen(false);
      setRefundReason("");
    } catch (err: any) {
      alert(err.message || "Action failed.");
    }
  };

  // Filter Logic
  const effectiveSearch = (globalSearch || search).trim().toLowerCase();

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      !effectiveSearch ||
      o.invoiceNo.toLowerCase().includes(effectiveSearch) ||
      String(o.id).includes(effectiveSearch) ||
      (o.userName && o.userName.toLowerCase().includes(effectiveSearch)) ||
      (o.userEmail && o.userEmail.toLowerCase().includes(effectiveSearch)) ||
      (o.courseTitle && o.courseTitle.toLowerCase().includes(effectiveSearch));

    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    const matchesGateway = gatewayFilter === "all" || o.gateway === gatewayFilter;

    return matchesSearch && matchesStatus && matchesGateway;
  });

  // Render Order Detail View
  if (selectedOrder && urlOrderId) {
    return (
      <div className="space-y-6 pb-12">
        {toast && (
          <ToastSystem
            toasts={[{ id: "1", type: "success", title: toast }]}
            onClose={() => setToast("")}
          />
        )}

        {/* Back Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin/orders")}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-mono font-extrabold text-[#0E2A47]">{selectedOrder.invoiceNo}</h1>
                <Badge
                  variant={
                    selectedOrder.status === "paid"
                      ? "teal"
                      : selectedOrder.status === "awaiting_verification"
                      ? "warning"
                      : selectedOrder.status === "refunded"
                      ? "indigo"
                      : "danger"
                  }
                  className="uppercase font-bold"
                >
                  {selectedOrder.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Created {formatDate(selectedOrder.createdAt)} • Gateway: {selectedOrder.gateway.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedOrder.status !== "paid" && (
              <Button
                variant="teal"
                size="sm"
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={() => {
                  setMarkPaidReason("");
                  setIsMarkPaidModalOpen(true);
                }}
              >
                Mark as Paid
              </Button>
            )}
            {selectedOrder.status === "paid" && (
              <Button
                variant="danger"
                size="sm"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={() => {
                  setRefundReason("");
                  setIsRefundModalOpen(true);
                }}
              >
                Flag Refund
              </Button>
            )}
          </div>
        </div>

        {/* Order Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 border-slate-200 space-y-6">
            <h3 className="text-base font-bold text-[#0E2A47]">Order & Candidate Summary</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-xs text-slate-500">Student Candidate</span>
                <p className="font-bold text-[#0E2A47]">{selectedOrder.userName || "Student"}</p>
                <p className="text-xs text-slate-500">{selectedOrder.userEmail || "student@samsacademy.com"}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-xs text-slate-500">Enrolled Course</span>
                <p className="font-bold text-slate-800 line-clamp-1">{selectedOrder.courseTitle}</p>
                <p className="text-xs text-emerald-600 font-medium">Includes 180 Days Full QBank Access</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-xs text-slate-500">Payment Gateway</span>
                <p className="font-bold text-slate-800 uppercase">{selectedOrder.gateway}</p>
                <p className="font-mono text-xs text-slate-500">{selectedOrder.gatewayRef || "REF-NOT-PROVIDED"}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-xs text-slate-500">Discount & Coupon</span>
                <p className="font-bold text-slate-800">
                  {selectedOrder.couponCode ? `Coupon "${selectedOrder.couponCode}"` : "No Coupon Applied"}
                </p>
                <p className="text-xs text-slate-500">Saved: {formatPKR(selectedOrder.discountAmount)}</p>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="border-t border-slate-200 pt-4 space-y-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Course Original Price</span>
                <span className="font-semibold">{formatPKR(selectedOrder.amount)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Coupon Discount</span>
                <span className="font-semibold text-emerald-600">- {formatPKR(selectedOrder.discountAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-[#0E2A47] pt-2 border-t border-slate-200">
                <span>Final Billed Amount</span>
                <span className="text-lg text-[#0FA3A3]">{formatPKR(selectedOrder.finalAmount)}</span>
              </div>
            </div>
          </Card>

          {/* Payment Events Timeline */}
          <Card className="p-6 border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-[#0FA3A3]" />
              <h3 className="text-base font-bold text-[#0E2A47]">Payment Events & Webhook IPN Log</h3>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {paymentEvents.map((evt) => (
                <div key={evt.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0E2A47] uppercase">{evt.eventType}</span>
                    <Badge variant={evt.signatureValid ? "teal" : "danger"} size="sm">
                      {evt.signatureValid ? "Sig Valid ✓" : "Sig Invalid"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-500">{formatDate(evt.createdAt)}</p>
                  <pre className="p-2 bg-slate-900 text-amber-300 rounded font-mono text-[10px] overflow-x-auto">
                    {JSON.stringify(evt.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Mark as Paid Modal */}
        {isMarkPaidModalOpen && (
          <Modal
            isOpen={isMarkPaidModalOpen}
            onClose={() => setIsMarkPaidModalOpen(false)}
            title={`Mark Order ${selectedOrder.invoiceNo} as PAID`}
          >
            <form onSubmit={handleMarkPaidSubmit} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                This manual action will mark the order status as PAID and immediately grant 180-day course access to candidate {selectedOrder.userName}.
              </div>

              <Textarea
                label="Reason for Manual Mark Paid"
                required
                rows={3}
                value={markPaidReason}
                onChange={(e) => setMarkPaidReason(e.target.value)}
                placeholder="e.g. Bank transfer verified directly in Meezan Bank business portal."
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsMarkPaidModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="teal" type="submit">
                  Confirm Mark Paid
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Flag Refund Modal */}
        {isRefundModalOpen && (
          <Modal
            isOpen={isRefundModalOpen}
            onClose={() => setIsRefundModalOpen(false)}
            title={`Flag Refund for Order ${selectedOrder.invoiceNo}`}
          >
            <form onSubmit={handleRefundSubmit} className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
                Flagging this order as refunded will record an audit trail event and mark the order status as REFUNDED.
              </div>

              <Textarea
                label="Refund Reason"
                required
                rows={3}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Duplicate order by candidate or candidate requested fee refund under terms."
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsRefundModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" type="submit">
                  Confirm Refund
                </Button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    );
  }

  // Render Table Orders View
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
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Orders & Revenue Transactions</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track JazzCash, EasyPaisa, Raast, Bank Transfer, PayFast, and Safepay purchase transactions.
          </p>
        </div>
      </div>

      <Card className="p-6 border-slate-200 space-y-4">
        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            placeholder="Search invoice #, student, or course..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4 text-slate-400" />}
          />

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "Filter Status: All Statuses" },
              { value: "paid", label: "Paid / Approved" },
              { value: "awaiting_verification", label: "Awaiting Verification" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Failed" },
              { value: "refunded", label: "Refunded" },
            ]}
          />

          <Select
            value={gatewayFilter}
            onChange={(e) => setGatewayFilter(e.target.value)}
            options={[
              { value: "all", label: "Filter Gateway: All Gateways" },
              { value: "jazzcash", label: "JazzCash" },
              { value: "easypaisa", label: "EasyPaisa" },
              { value: "raast", label: "Raast ID" },
              { value: "bank_transfer", label: "Bank Transfer" },
              { value: "payfast", label: "PayFast" },
              { value: "safepay", label: "Safepay" },
            ]}
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading transactions...</div>
        ) : (
          <Table
            columns={[
              {
                header: "Invoice #",
                accessor: (o: Order) => (
                  <button
                    onClick={() => navigate(`/admin/orders/${o.id}`)}
                    className="font-mono text-xs font-bold text-[#0E2A47] hover:text-[#0FA3A3] underline transition-colors"
                  >
                    {o.invoiceNo}
                  </button>
                ),
              },
              { header: "Student Name", accessor: (o) => <span className="font-bold text-slate-800">{o.userName}</span> },
              { header: "Course Title", accessor: (o) => <span className="line-clamp-1 max-w-xs">{o.courseTitle}</span> },
              { header: "Amount", accessor: (o) => <span className="font-extrabold text-[#0E2A47]">{formatPKR(o.finalAmount)}</span> },
              {
                header: "Gateway",
                accessor: (o) => (
                  <Badge variant={o.gateway === "raast" ? "teal" : o.gateway === "jazzcash" ? "warning" : "indigo"} size="sm">
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
                        : o.status === "refunded"
                        ? "indigo"
                        : "danger"
                    }
                    size="sm"
                  >
                    {o.status.replace("_", " ").toUpperCase()}
                  </Badge>
                ),
              },
              { header: "Date", accessor: (o) => <span className="text-xs text-slate-500">{formatDate(o.createdAt)}</span> },
              {
                header: "Action",
                accessor: (o) => (
                  <Button size="xs" variant="outline" onClick={() => navigate(`/admin/orders/${o.id}`)}>
                    Details
                  </Button>
                ),
              },
            ]}
            data={filteredOrders}
            keyExtractor={(o) => o.id}
          />
        )}
      </Card>
    </div>
  );
};
