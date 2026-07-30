import React, { useState, useEffect } from "react";
import {
  ShoppingBag,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Printer,
  FileText,
  Building2,
  X,
} from "lucide-react";
import { Card, Button, Badge, Modal } from "../../components/ui";
import { checkoutApi } from "../../api/endpoints/checkout";
import { Order } from "../../types";
import { formatPKR } from "../../utils/formatters";

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);

  useEffect(() => {
    async function loadOrders() {
      setIsLoading(true);
      try {
        const list = await checkoutApi.getMyOrders();
        setOrders(list);
      } catch (err) {
        console.error("Failed to load orders", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadOrders();
  }, []);

  const handlePrintInvoice = () => {
    window.print();
  };

  const getStatusBadge = (status: string, rejectReason?: string) => {
    switch (status) {
      case "paid":
      case "approved":
        return (
          <Badge variant="emerald" size="sm" className="font-extrabold uppercase">
            <CheckCircle2 className="w-3 h-3 mr-1" /> PAID & ACTIVATED
          </Badge>
        );
      case "awaiting_verification":
      case "pending":
        return (
          <Badge variant="warning" size="sm" className="font-extrabold uppercase">
            <Clock className="w-3 h-3 mr-1" /> AWAITING VERIFICATION
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="danger" size="sm" className="font-extrabold uppercase">
            <XCircle className="w-3 h-3 mr-1" /> REJECTED
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" size="sm" className="font-extrabold uppercase">
            {status}
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center space-y-3 max-w-xl mx-auto">
        <div className="w-10 h-10 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-500">Loading Orders & Official Invoices...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">My Orders & Tax Invoices</h1>
          <p className="text-xs text-slate-500 mt-1">
            Transaction statements, verification status logs, and official printable tax receipts.
          </p>
        </div>

        <Badge variant="teal" size="lg" className="font-extrabold uppercase">
          {orders.length} TOTAL TRANSACTIONS
        </Badge>
      </div>

      {/* Orders Table & Cards */}
      <div className="space-y-4">
        {orders.map((ord) => {
          const isRejected = ord.status === ("rejected" as any) || ord.proof?.status === "rejected";
          const rejectReason = ord.proof?.rejectReason || "Verification check failed. Reference number mismatch.";

          return (
            <Card key={ord.id} className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
              {/* Order Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black text-[#0FA3A3]">{ord.invoiceNo}</span>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : "2026-07-28"}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-[#0E2A47]">{ord.courseTitle}</h3>
                </div>

                <div className="shrink-0">{getStatusBadge(ord.status, rejectReason)}</div>
              </div>

              {/* Order Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold block uppercase">Gateway Method</span>
                  <span className="font-extrabold text-[#0E2A47] uppercase">{ord.gateway}</span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block uppercase">Gateway Ref / Txn ID</span>
                  <span className="font-mono font-bold text-slate-700">
                    {ord.gatewayRef || ord.proof?.referenceNo || "Pending Ref"}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block uppercase">Discount Applied</span>
                  <span className="font-bold text-emerald-600">
                    {ord.discountAmount ? `-${formatPKR(ord.discountAmount)}` : "None"}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block uppercase">Amount Paid</span>
                  <span className="font-black text-[#0E2A47] text-sm">{formatPKR(ord.finalAmount)}</span>
                </div>
              </div>

              {/* Rejected Notice Banner */}
              {isRejected && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs space-y-1">
                  <span className="font-black flex items-center gap-1.5 text-rose-700">
                    <AlertTriangle className="w-4 h-4 text-rose-600" /> Transaction Rejected by Verification Desk:
                  </span>
                  <p className="text-[11px] opacity-90 pl-5">{rejectReason}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedInvoiceOrder(ord)}
                  icon={<Download className="w-3.5 h-3.5" />}
                >
                  Download Invoice (PDF)
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Printable Invoice Modal */}
      <Modal
        isOpen={selectedInvoiceOrder !== null}
        onClose={() => setSelectedInvoiceOrder(null)}
        title="Official Tax Invoice & Receipt"
        size="lg"
      >
        {selectedInvoiceOrder && (
          <div className="space-y-6 text-xs text-slate-800 print:p-0">
            {/* Printable Container Header */}
            <div className="flex items-start justify-between border-b-2 border-[#0E2A47] pb-4">
              <div>
                <h2 className="text-xl font-black text-[#0E2A47] tracking-tight">SAMS ACADEMY</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Medical Licensing Exam Preparation Platform
                </p>
                <p className="text-[11px] text-slate-400 mt-1">NRE Step 1 • USMLE • SMLE • DHA • Prometric</p>
              </div>

              <div className="text-right space-y-0.5">
                <Badge variant="teal" size="md" className="font-black">
                  INVOICE: {selectedInvoiceOrder.invoiceNo}
                </Badge>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  Date: {selectedInvoiceOrder.createdAt ? new Date(selectedInvoiceOrder.createdAt).toLocaleDateString() : "2026-07-28"}
                </p>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Status: {selectedInvoiceOrder.status}</p>
              </div>
            </div>

            {/* Candidate & Vendor Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-[#0FA3A3]">Billed To (Candidate)</span>
                <p className="font-extrabold text-slate-900">{selectedInvoiceOrder.userName}</p>
                <p className="text-slate-500 font-mono text-[11px]">{selectedInvoiceOrder.userEmail}</p>
                <p className="text-slate-500">Reg ID: SAM-STUDENT-2026</p>
              </div>

              <div className="space-y-1 text-right">
                <span className="text-[10px] font-black uppercase text-[#0FA3A3]">Issued By (Platform)</span>
                <p className="font-extrabold text-slate-900">SAMS Academy Private Limited</p>
                <p className="text-slate-500">Meezan Bank Plaza, Main Campus Branch</p>
                <p className="text-slate-500 font-mono text-[11px]">NTN / STRN: 8912034-7</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[#0E2A47] font-black uppercase text-[10px]">
                    <th className="p-3">Item Description</th>
                    <th className="p-3 text-center">Access Window</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  <tr>
                    <td className="p-3">
                      <span className="font-bold block text-slate-900">{selectedInvoiceOrder.courseTitle}</span>
                      <span className="text-[10px] text-slate-400">Includes Full HD Lectures, QBank, & Mock Exams</span>
                    </td>
                    <td className="p-3 text-center text-slate-600 font-bold">180 Days</td>
                    <td className="p-3 text-right font-black text-slate-900">
                      {formatPKR(selectedInvoiceOrder.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Math Breakdown */}
            <div className="flex justify-end pt-2">
              <div className="w-64 space-y-2 text-xs border-t border-slate-200 pt-2">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Amount:</span>
                  <span className="font-bold">{formatPKR(selectedInvoiceOrder.amount)}</span>
                </div>
                {selectedInvoiceOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Promo Discount:</span>
                    <span>-{formatPKR(selectedInvoiceOrder.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-[#0E2A47] border-t border-slate-200 pt-2">
                  <span>Total Paid (PKR):</span>
                  <span className="text-[#0FA3A3]">{formatPKR(selectedInvoiceOrder.finalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Print Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 print:hidden">
              <Button variant="ghost" size="md" onClick={() => setSelectedInvoiceOrder(null)}>
                Close
              </Button>
              <Button variant="teal" size="md" onClick={handlePrintInvoice} icon={<Printer className="w-4 h-4" />}>
                Print Tax Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
