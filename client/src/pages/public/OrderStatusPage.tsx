import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  FileText,
  ShieldCheck,
  Building2,
  AlertCircle,
} from "lucide-react";
import { Card, Button, Badge } from "../../components/ui";
import { checkoutApi } from "../../api/endpoints/checkout";
import { Order } from "../../types";
import { formatPKR } from "../../utils/formatters";

export const OrderStatusPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const gatewayParam = searchParams.get("gateway") || "jazzcash";
  const initialStatusParam = searchParams.get("status");

  const [order, setOrder] = useState<Order | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [statusState, setStatusState] = useState<"pending" | "paid" | "awaiting_verification" | "failed">(
    initialStatusParam === "awaiting_verification" ? "awaiting_verification" : "pending"
  );

  useEffect(() => {
    let timer: any;
    async function fetchOrder() {
      try {
        const ord = await checkoutApi.getOrderById(Number(id) || 101);
        setOrder(ord);

        if (initialStatusParam === "awaiting_verification" || ord.gateway === "raast" || ord.gateway === "bank_transfer") {
          setIsPolling(false);
          setStatusState("awaiting_verification");
        } else {
          // Simulate 2s gateway IPN/status callback polling
          setIsPolling(true);
          timer = setTimeout(() => {
            setIsPolling(false);
            setStatusState("paid");
          }, 2000);
        }
      } catch (err) {
        setIsPolling(false);
        setStatusState("failed");
      }
    }

    fetchOrder();

    return () => clearTimeout(timer);
  }, [id, initialStatusParam]);

  if (isPolling) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="space-y-1">
          <h2 className="text-lg font-black text-[#0E2A47]">Verifying Gateway Payment...</h2>
          <p className="text-xs text-slate-500">
            Please wait while we confirm your transaction with {gatewayParam.toUpperCase()}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-2xl mx-auto pt-6">
      {/* Simulation Toggle Bar for Testing both Success & Failed Paths */}
      <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
        <span className="font-bold text-slate-600">Gateway Test Control:</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatusState("paid")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              statusState === "paid" ? "bg-emerald-600 text-white" : "bg-white text-slate-700 hover:bg-slate-200"
            }`}
          >
            Simulate Paid 🎉
          </button>
          <button
            type="button"
            onClick={() => setStatusState("awaiting_verification")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              statusState === "awaiting_verification"
                ? "bg-amber-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-200"
            }`}
          >
            Simulate Verification ⏳
          </button>
          <button
            type="button"
            onClick={() => setStatusState("failed")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              statusState === "failed" ? "bg-rose-600 text-white" : "bg-white text-slate-700 hover:bg-slate-200"
            }`}
          >
            Simulate Failed ❌
          </button>
        </div>
      </div>

      {/* SUCCESS STATE (PAID) */}
      {statusState === "paid" && (
        <Card className="p-8 border-emerald-300 bg-gradient-to-b from-emerald-50/80 via-white to-white rounded-3xl shadow-xl text-center space-y-6 relative overflow-hidden">
          <div className="w-16 h-16 rounded-3xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-200 animate-bounce">
            <Sparkles className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <Badge variant="emerald" size="lg" className="font-extrabold uppercase tracking-wide">
              Transaction Approved & Activated
            </Badge>
            <h1 className="text-2xl font-black text-[#0E2A47]">You're Enrolled! 🎉</h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Your payment has been successfully verified. Full course access, video lectures, and QBank practice modules are now active in your student portal.
            </p>
          </div>

          {/* Order Snapshot Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-left space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 font-bold text-[#0E2A47]">
              <span>Invoice Ref: {order?.invoiceNo || `SAMS-2026-${id || "1001"}`}</span>
              <span className="text-emerald-700 uppercase font-black">{order?.gateway || gatewayParam}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Activated Package:</span>
              <span className="font-bold text-slate-900">{order?.courseTitle || "NRE Step 1 Complete Course"}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Amount Paid:</span>
              <span className="font-black text-[#0E2A47]">{formatPKR(order?.finalAmount || 15000)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Access Validity:</span>
              <span className="font-bold text-slate-900">180 Days Unlimited</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/app/courses" className="w-full sm:w-auto">
              <Button variant="teal" size="lg" className="w-full" icon={<ArrowRight className="w-4 h-4" />}>
                Start Learning Now
              </Button>
            </Link>

            <Link to="/app/orders" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full" icon={<FileText className="w-4 h-4" />}>
                View Orders & Receipts
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* AWAITING VERIFICATION STATE */}
      {statusState === "awaiting_verification" && (
        <Card className="p-8 border-amber-300 bg-gradient-to-b from-amber-50/80 via-white to-white rounded-3xl shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-amber-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-amber-200">
            <Clock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <Badge variant="warning" size="lg" className="font-extrabold uppercase tracking-wide">
              Payment Proof Received
            </Badge>
            <h1 className="text-2xl font-black text-[#0E2A47]">Awaiting Manual Verification</h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Your transaction proof has been logged successfully. Our finance verification desk will review and activate your course within <strong>1–3 hours</strong>.
            </p>
          </div>

          {/* Reference Info */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Invoice Reference:</span>
              <span className="font-mono font-bold text-[#0E2A47]">{order?.invoiceNo || `SAMS-2026-${id || "1001"}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Method Used:</span>
              <span className="font-bold text-slate-800 uppercase">{order?.gateway || gatewayParam}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Verification Status:</span>
              <span className="font-extrabold text-amber-700">PENDING AUDIT</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/app/orders" className="w-full sm:w-auto">
              <Button variant="teal" size="md" className="w-full">
                Track Order Status
              </Button>
            </Link>
            <Link to="/app" className="w-full sm:w-auto">
              <Button variant="outline" size="md" className="w-full">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* FAILED STATE */}
      {statusState === "failed" && (
        <Card className="p-8 border-rose-300 bg-gradient-to-b from-rose-50/80 via-white to-white rounded-3xl shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-rose-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-rose-200">
            <XCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <Badge variant="danger" size="lg" className="font-extrabold uppercase tracking-wide">
              Transaction Unsuccessful
            </Badge>
            <h1 className="text-2xl font-black text-[#0E2A47]">Payment Processing Failed</h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              We were unable to process your payment via {gatewayParam.toUpperCase()}. Your account has not been charged.
            </p>
          </div>

          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-left space-y-1.5 text-rose-900">
            <div className="font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" /> Common Failure Causes:
            </div>
            <ul className="list-disc list-inside text-[11px] text-rose-800 space-y-1">
              <li>Insufficient mobile wallet or bank balance</li>
              <li>OTP authentication timeout or invalid PIN entry</li>
              <li>Temporary gateway API connection drop</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="w-full sm:w-auto">
              <Button variant="teal" size="lg" className="w-full" icon={<RotateCcw className="w-4 h-4" />}>
                Retry Checkout
              </Button>
            </button>
            <Link to="/contact" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full">
                Contact Billing Support
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
};
