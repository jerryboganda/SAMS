import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Clock,
  XCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Card, Button, Badge } from "../../components/ui";
import { checkoutApi } from "../../api/endpoints/checkout";
import { Order } from "../../types";
import { formatPKR } from "../../utils/formatters";
import { resolveDisplayStatus, shouldContinuePolling, FailedReason } from "./orderStatusResolution";

// Poll GET /orders/:id every 2.5s, for up to ~60s (24 attempts), until the order reaches a
// terminal status (docs/07_EXECUTION_PLAN.md 9.7 — replaces the previous fake
// `setTimeout(2000)` "simulate polling"/dev-only status-toggle bar with REAL polling).
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 24;

const FAILED_COPY: Record<FailedReason, { title: string; body: string }> = {
  failed: {
    title: "Payment Processing Failed",
    body: "We were unable to process your payment. Your account has not been charged.",
  },
  cancelled: {
    title: "Order Cancelled",
    body: "This order was cancelled. Your account has not been charged. You can start a new checkout at any time.",
  },
  refunded: {
    title: "Order Refunded",
    body: "This order was refunded. If you believe this is a mistake, please contact billing support.",
  },
  poll_timeout: {
    title: "Still Processing Your Payment",
    body: "Your payment is taking longer than usual to confirm — this doesn't necessarily mean it failed. Please check My Orders shortly, or contact support if this persists.",
  },
};

export const OrderStatusPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const attemptRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Mutable holder (not the variable itself) so `intervalRef` can stay `const` — pollOnce's
    // closure reads `intervalRef.current` lazily, by which point the interval below has always
    // already been assigned (JS single-threaded ordering: the sync `setInterval(...)` line below
    // always runs before this async function's first `await` resumes).
    const intervalRef: { current?: ReturnType<typeof setInterval> } = {};

    async function pollOnce() {
      try {
        const ord = await checkoutApi.getOrderById(Number(id));
        if (cancelled) return;
        setOrder(ord);
        setLoadError("");
        setIsLoading(false);

        attemptRef.current += 1;
        if (!shouldContinuePolling(ord.status, attemptRef.current, MAX_POLL_ATTEMPTS)) {
          if (ord.status === "pending" && attemptRef.current >= MAX_POLL_ATTEMPTS) {
            setTimedOut(true);
          }
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch (err: any) {
        if (cancelled) return;
        setIsLoading(false);
        setLoadError(err.message || "Unable to load order status.");
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }

    pollOnce();
    intervalRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="space-y-1">
          <h2 className="text-lg font-black text-[#0E2A47]">Loading Order Status...</h2>
          <p className="text-xs text-slate-500">Please wait while we fetch your order.</p>
        </div>
      </div>
    );
  }

  if (loadError && !order) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-[#0E2A47]">Unable to Load Order</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">{loadError}</p>
        </div>
        <Link to="/app/orders">
          <Button variant="teal" size="md">
            Go to My Orders
          </Button>
        </Link>
      </div>
    );
  }

  const { display: statusState, failedReason } = resolveDisplayStatus(order, { timedOut });
  const isStillPolling = statusState === "pending";

  if (isStillPolling) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="space-y-1">
          <h2 className="text-lg font-black text-[#0E2A47]">Verifying Gateway Payment...</h2>
          <p className="text-xs text-slate-500">
            Please wait while we confirm your transaction with {order?.gateway?.toUpperCase() || "the gateway"}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-2xl mx-auto pt-6">
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
              <span>Invoice Ref: {order?.invoiceNo || `#${id}`}</span>
              <span className="text-emerald-700 uppercase font-black">{order?.gateway}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Activated Package:</span>
              <span className="font-bold text-slate-900">{order?.courseTitle}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Amount Paid:</span>
              <span className="font-black text-[#0E2A47]">{formatPKR(order?.finalAmount || 0)}</span>
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
              <span className="font-mono font-bold text-[#0E2A47]">{order?.invoiceNo || `#${id}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Method Used:</span>
              <span className="font-bold text-slate-800 uppercase">{order?.gateway}</span>
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

      {/* FAILED / CANCELLED / REFUNDED / STILL-PENDING-TIMED-OUT STATE (shares one card shape;
          copy varies by failedReason so a slow-pending order is never told it "failed") */}
      {statusState === "failed" && (
        <Card className="p-8 border-rose-300 bg-gradient-to-b from-rose-50/80 via-white to-white rounded-3xl shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-rose-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-rose-200">
            <XCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <Badge variant="danger" size="lg" className="font-extrabold uppercase tracking-wide">
              {failedReason === "poll_timeout" ? "Verification In Progress" : "Transaction Unsuccessful"}
            </Badge>
            <h1 className="text-2xl font-black text-[#0E2A47]">
              {FAILED_COPY[failedReason || "failed"].title}
            </h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              {FAILED_COPY[failedReason || "failed"].body}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {failedReason === "poll_timeout" ? (
              <Link to="/app/orders" className="w-full sm:w-auto">
                <Button variant="teal" size="lg" className="w-full" icon={<FileText className="w-4 h-4" />}>
                  Check My Orders
                </Button>
              </Link>
            ) : (
              <button type="button" onClick={() => navigate(-1)} className="w-full sm:w-auto">
                <Button variant="teal" size="lg" className="w-full" icon={<RotateCcw className="w-4 h-4" />}>
                  Retry Checkout
                </Button>
              </button>
            )}
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
