import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link, useParams } from "react-router-dom";
import {
  ShieldCheck,
  CreditCard,
  Upload,
  CheckCircle2,
  AlertCircle,
  Copy,
  ArrowLeft,
  Check,
  Building2,
  QrCode,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { Card, Button, Input, Badge } from "../../components/ui";
import { checkoutApi, GatewayInfo, CreateOrderResponse } from "../../api/endpoints/checkout";
import { coursesApi } from "../../api/endpoints/courses";
import { formatPKR } from "../../utils/formatters";
import { Course, PaymentGateway } from "../../types";

// Cosmetic per-gateway copy (badge/description) — the backend's GET /checkout/gateways
// response only carries {code, name, enabled}; this map decorates it for the UI, keeping
// the enabled/disabled *state* itself entirely server-driven (docs/07_EXECUTION_PLAN.md 9.7).
const GATEWAY_COPY: Record<string, { desc: string; badge: string }> = {
  jazzcash: { desc: "Instant Automatic Activation", badge: "INSTANT" },
  easypaisa: { desc: "Instant Automatic Activation", badge: "INSTANT" },
  raast: { desc: "Official SAMS Raast ID / QR Code", badge: "POPULAR" },
  bank_transfer: { desc: "IBAN Transfer & Proof Upload", badge: "SECURE" },
  payfast: { desc: "Credit / Debit Cards", badge: "DISABLED" },
  safepay: { desc: "Online Cards", badge: "DISABLED" },
  mock: { desc: "Dev/Test Auto-Pay", badge: "INSTANT" },
};

export const CheckoutPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Real course lookup by slug — `slug` (path param, e.g. /checkout/:slug) or `course` (query
  // param, e.g. /checkout?course=nre-step-1 — the shape CourseDetailPage.tsx's own "Enroll Now"
  // link actually uses: `/checkout?course=${course.slug || course.id}`). Previously resolved from
  // client-side MOCK_COURSES fixture data regardless of CONFIG.USE_MOCK, so `?course=<real-slug>`
  // was silently ignored and every checkout attempt used whichever mock course happened to be
  // MOCK_COURSES[0] — a real, live-browser-discovered bug (docs/07_EXECUTION_PLAN.md 9.7; see
  // DECISIONS.md 2026-08-05). `coursesApi.getCourseBySlug` already hits the real
  // GET /public/courses/:slug endpoint (Phase 3) — the same one CourseDetailPage.tsx uses.
  const courseSlugParam = slug || searchParams.get("course") || "";
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoadingCourse, setIsLoadingCourse] = useState(true);
  const [courseLoadError, setCourseLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadCourse() {
      if (!courseSlugParam) {
        setCourseLoadError("No course was specified.");
        setIsLoadingCourse(false);
        return;
      }
      setIsLoadingCourse(true);
      setCourseLoadError("");
      try {
        const real = await coursesApi.getCourseBySlug(courseSlugParam);
        if (cancelled) return;
        setCourse(real);
      } catch (err: any) {
        if (!cancelled) setCourseLoadError(err.message || "Course not found.");
      } finally {
        if (!cancelled) setIsLoadingCourse(false);
      }
    }
    loadCourse();
    return () => {
      cancelled = true;
    };
  }, [courseSlugParam]);

  // Real 409 ALREADY_ENROLLED signal only — no more guessing from a hardcoded mock id. The
  // backend's own per-course check (services/orderService.js#assertNotAlreadyEnrolled) is the
  // single source of truth; handlePlaceOrder/handleRevealPaymentInstructions below already
  // correctly flip this on a genuine 409 from a real order-creation attempt.
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);

  // Quote State
  const [couponCode, setCouponCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponSuccess, setCouponSuccess] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);

  // Payment Selection State
  const [gateway, setGateway] = useState<PaymentGateway | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Copy Feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Proof Upload Form State
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileError, setProofFileError] = useState("");

  // Real gateway list from GET /checkout/gateways (docs/07_EXECUTION_PLAN.md 9.7) —
  // replaces the previously-hardcoded gatewayConfigs array.
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [isLoadingGateways, setIsLoadingGateways] = useState(true);
  const [gatewaysError, setGatewaysError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadGateways() {
      setIsLoadingGateways(true);
      setGatewaysError("");
      try {
        const list = await checkoutApi.getGateways();
        if (cancelled) return;
        const enabledList = list.filter((gw) => gw.enabled);
        setGateways(enabledList);
        if (enabledList.length > 0) setGateway(enabledList[0].code);
      } catch (err: any) {
        if (!cancelled) setGatewaysError(err.message || "Unable to load available payment methods.");
      } finally {
        if (!cancelled) setIsLoadingGateways(false);
      }
    }
    loadGateways();
    return () => {
      cancelled = true;
    };
  }, []);

  const gatewayConfigs = gateways.map((gw) => ({
    id: gw.code,
    name: gw.name,
    desc: GATEWAY_COPY[gw.code]?.desc || "Secure Payment",
    badge: GATEWAY_COPY[gw.code]?.badge || "AVAILABLE",
    enabled: gw.enabled,
  }));

  // Real Raast / Bank Transfer account details — populated from the actual
  // POST /checkout/orders response (manualDetails), never assumed/hardcoded
  // (docs/07_EXECUTION_PLAN.md 9.7). A manual-gateway order must exist before
  // these details are known (they're sourced server-side from admin Settings
  // at createCheckout time), so selecting raast/bank_transfer first reveals a
  // "Get Payment Instructions" CTA which creates the (pending) order and
  // populates this state, THEN the proof-submission fields become available.
  const [manualOrder, setManualOrder] = useState<{
    orderId: number;
    gateway: PaymentGateway;
    manualDetails: NonNullable<CreateOrderResponse["manualDetails"]>;
  } | null>(null);

  // Reset the manual-order/proof state whenever the selected gateway changes,
  // so switching payment methods always starts a fresh instructions/proof cycle.
  useEffect(() => {
    setManualOrder(null);
    setProofFile(null);
    setProofFileError("");
  }, [gateway]);

  // Loading/error guard — placed after every hook declaration above (same position the
  // pre-existing `if (alreadyEnrolled)` guard below already uses), before anything that
  // dereferences `course`.
  if (isLoadingCourse) {
    return (
      <div className="py-20 text-center space-y-3 max-w-xl mx-auto">
        <div className="w-10 h-10 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-500">Loading course details...</p>
      </div>
    );
  }
  if (courseLoadError || !course) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 space-y-4 text-center">
        <Card className="p-8 border-rose-200 bg-rose-50/50 rounded-3xl shadow-md space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h2 className="text-lg font-black text-[#0E2A47]">Course Not Found</h2>
          <p className="text-xs text-slate-600">{courseLoadError || "This course could not be loaded."}</p>
          <Link to="/courses">
            <Button variant="teal" size="md">
              Browse Courses
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const finalAmount = Math.max(0, course.price - appliedDiscount);

  // Copy helper
  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Real payment-proof file picker (replaces the previously-hardcoded Unsplash fileUrl stand-in).
  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setProofFileError("");
    setProofFile(file);
  };

  // Apply Coupon via Server Quote Endpoint
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setCouponError("");
    setCouponSuccess("");
    setIsQuoting(true);

    try {
      const quote = await checkoutApi.getQuote({
        courseId: course.id,
        couponCode: couponCode.trim(),
      });

      setAppliedDiscount(quote.discountAmount);
      setAppliedCouponCode(couponCode.trim());
      setCouponSuccess(`Coupon '${couponCode.trim().toUpperCase()}' applied! Saved ${formatPKR(quote.discountAmount)}.`);
    } catch (err: any) {
      setAppliedDiscount(0);
      setAppliedCouponCode("");
      // Render inline specific coupon error message (e.g. COUPON_INVALID, EXPIRED, USED_UP)
      setCouponError(err.message || "Invalid discount coupon code.");
    } finally {
      setIsQuoting(false);
    }
  };

  /**
   * Builds + auto-submits a real hidden HTML form to a hosted-checkout gateway's own
   * `actionUrl` (JazzCash/EasyPaisa) — one hidden <input> per formFields entry, exactly the
   * pattern server/src/adapters/payments/jazzcash.js's own doc comment specifies for whoever
   * wires the frontend. Navigates the browser away; nothing runs after this returns.
   */
  const submitHostedCheckoutForm = (actionUrl: string, formFields: Record<string, string>) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = actionUrl;
    Object.entries(formFields).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  };

  // Handle Order Placement (hosted-checkout gateways: jazzcash/easypaisa/mock — a single click
  // creates the order AND redirects straight to the gateway/return flow).
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateway) {
      alert("Please select a payment method.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await checkoutApi.createOrder({
        courseId: course.id,
        couponCode: appliedCouponCode || undefined,
        gateway,
      });

      if (res.actionUrl && res.formFields) {
        // JazzCash/EasyPaisa: real hosted-checkout form-POST redirect.
        submitHostedCheckoutForm(res.actionUrl, res.formFields);
        // Browser navigates away here — no further state updates needed.
        return;
      } else if (res.redirectUrl) {
        // mock gateway: our own GET /checkout/return/mock -> verifies -> redirects to /order/:id/status.
        window.location.href = res.redirectUrl;
        return;
      } else {
        // Defensive fallback — should never happen given a valid gateway response.
        navigate(`/order/${res.order.id}/status`);
      }
    } catch (err: any) {
      if (err.code === "ALREADY_ENROLLED") {
        setAlreadyEnrolled(true);
      } else {
        alert(err.message || "Checkout failed. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manual gateways (raast/bank_transfer), phase 1: create the (pending) order to reveal the
  // REAL account/QR instructions from the backend's manualDetails response — these come from
  // admin-editable Settings server-side, never assumed/hardcoded client-side.
  const handleRevealPaymentInstructions = async () => {
    if (gateway !== "raast" && gateway !== "bank_transfer") return;
    setIsSubmitting(true);
    try {
      const res = await checkoutApi.createOrder({
        courseId: course.id,
        couponCode: appliedCouponCode || undefined,
        gateway,
      });
      if (res.manualDetails) {
        setManualOrder({ orderId: res.order.id, gateway, manualDetails: res.manualDetails });
      }
    } catch (err: any) {
      if (err.code === "ALREADY_ENROLLED") {
        setAlreadyEnrolled(true);
      } else {
        alert(err.message || "Unable to generate payment instructions. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manual gateways, phase 2: upload the REAL file the student picked, then submit the
  // reference/note against the order created in phase 1.
  const handleSubmitProof = async () => {
    if (!manualOrder) return;
    if (!referenceNo) {
      alert("Please enter your transaction reference number or transaction ID.");
      return;
    }
    if (!proofFile) {
      setProofFileError("Please attach a screenshot/photo of your payment proof.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { url } = await checkoutApi.uploadProofImage(manualOrder.orderId, proofFile);
      await checkoutApi.uploadBankProof(manualOrder.orderId, { referenceNo, note, fileUrl: url });
      navigate(`/order/${manualOrder.orderId}/status`);
    } catch (err: any) {
      alert(err.message || "Failed to submit payment proof. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isManualGateway = gateway === "raast" || gateway === "bank_transfer";

  // Single bottom CTA dispatcher — routes to the right handler for the current gateway/phase.
  const handleMainCtaClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateway) return;
    if (isManualGateway) {
      if (manualOrder) handleSubmitProof();
      else handleRevealPaymentInstructions();
    } else {
      handlePlaceOrder(e);
    }
  };

  const mainCtaLabel = !gateway
    ? "Select a Payment Method"
    : isManualGateway
    ? manualOrder
      ? "Submit Payment Proof"
      : "Get Payment Instructions"
    : "Pay & Activate Course";

  // 409 ALREADY_ENROLLED Friendly Screen
  if (alreadyEnrolled) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 space-y-6 text-center">
        <Card className="p-8 border-emerald-200 bg-emerald-50/50 rounded-3xl shadow-md space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto">
            <BookOpen className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <Badge variant="emerald" size="md" className="font-extrabold uppercase">
              ACTIVE ENROLLMENT DETECTED
            </Badge>
            <h2 className="text-xl font-black text-[#0E2A47]">You are already enrolled!</h2>
            <p className="text-xs text-slate-600 max-w-sm mx-auto">
              You currently hold active access to <strong>{course.title}</strong> in your student portal.
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <Link to="/app/courses">
              <Button variant="teal" size="md">
                Go to My Courses
              </Button>
            </Link>
            <Link to="/app">
              <Button variant="outline" size="md">
                Student Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="border-b border-slate-200 pb-4 flex items-center gap-3">
        <Link to={`/courses/${course.slug}`} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">SAMS Academy Secure Checkout</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Official Course Activation for NRE Step 1 & Licensing Examinations.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Payment Method Radio List */}
          <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#0FA3A3]" /> Select Payment Method
              </h3>
              <span className="text-[11px] text-slate-400 font-bold">256-bit Encrypted SSL</span>
            </div>

            {isLoadingGateways ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-8 h-8 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-500">Loading available payment methods...</p>
              </div>
            ) : gatewaysError ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {gatewaysError}
              </div>
            ) : gatewayConfigs.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-bold text-center">
                No payment methods are currently available. Please contact support.
              </div>
            ) : (
              <div className="space-y-3">
                {gatewayConfigs.map((gw) => {
                  const isSelected = gateway === gw.id;
                  return (
                    <button
                      key={gw.id}
                      type="button"
                      onClick={() => setGateway(gw.id)}
                      className={`w-full p-4 rounded-xl text-left border text-xs flex items-center justify-between gap-4 transition-all ${
                        isSelected
                          ? "border-[#0FA3A3] bg-[#0FA3A3]/5 ring-2 ring-[#0FA3A3]/20 text-[#0E2A47]"
                          : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected ? "border-[#0FA3A3] bg-[#0FA3A3]" : "border-slate-300"
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>

                        <div>
                          <div className="font-extrabold text-sm text-[#0E2A47]">{gw.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{gw.desc}</div>
                        </div>
                      </div>

                      <Badge variant={isSelected ? "teal" : "secondary"} size="sm" className="shrink-0 font-bold">
                        {gw.badge}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Manual Transfer Details Panel (For Raast or Bank Transfer) — real data only,
              sourced from the manualDetails returned by the actual POST /checkout/orders call
              (docs/07_EXECUTION_PLAN.md 9.7). Since these come from the backend at order-creation
              time (admin Settings), the panel is a two-phase flow: reveal instructions (creates
              the pending order) -> submit proof (uploads + confirms). */}
          {isManualGateway && (
            <Card className="p-6 border-indigo-200 bg-indigo-50/30 rounded-2xl shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-indigo-950">
                    {gateway === "raast" ? "Official Raast Transfer Details" : "Bank Account Details"}
                  </h3>
                </div>
                <Badge variant="teal" size="sm" className="font-bold uppercase">
                  Verify & Pay
                </Badge>
              </div>

              {!manualOrder ? (
                <div className="p-4 bg-white rounded-xl border border-indigo-100 text-xs text-slate-600 space-y-3 text-center">
                  <p>
                    Click <strong>"Get Payment Instructions"</strong> below to generate your order and
                    reveal the official account/transfer details to pay {formatPKR(finalAmount)} to.
                  </p>
                </div>
              ) : (
                <>
                  {/* Account Box & QR Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-indigo-100 text-xs">
                    <div className="sm:col-span-2 space-y-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Bank Name</span>
                        <span className="font-extrabold text-[#0E2A47]">{manualOrder.manualDetails.bankName}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Account Title</span>
                        <span className="font-extrabold text-[#0E2A47]">{manualOrder.manualDetails.accountTitle}</span>
                      </div>

                      {gateway === "raast" ? (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Official Raast ID</span>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-900 font-black">
                              {manualOrder.manualDetails.raastId}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(manualOrder.manualDetails.raastId, "raast")}
                              className="p-1 text-[#0FA3A3] hover:text-teal-700"
                              title="Copy Raast ID"
                            >
                              {copiedField === "raast" ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">IBAN Number</span>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="font-mono bg-slate-100 px-2 py-1 rounded-md text-slate-900 font-black text-[11px]">
                              {manualOrder.manualDetails.iban}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(manualOrder.manualDetails.iban, "iban")}
                              className="p-1 text-[#0FA3A3] hover:text-teal-700"
                              title="Copy IBAN"
                            >
                              {copiedField === "iban" ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Payable Amount</span>
                        <span className="font-black text-emerald-700 text-sm">{formatPKR(finalAmount)}</span>
                      </div>
                    </div>

                    {/* QR Code Box */}
                    {manualOrder.manualDetails.qrImageUrl && (
                      <div className="flex flex-col items-center justify-center bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-center space-y-1">
                        <img
                          src={manualOrder.manualDetails.qrImageUrl}
                          alt="Payment QR Code"
                          className="w-24 h-24 rounded-lg bg-white p-1 border border-slate-200"
                        />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          Scan in Banking App
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Proof / Txn Ref Upload Fields */}
                  <div className="space-y-3 pt-2 border-t border-indigo-100/80">
                    <span className="text-xs font-black text-[#0E2A47] block">
                      Submit Transaction Proof / Reference
                    </span>

                    <Input
                      label="Transaction ID / Bank Reference Number *"
                      placeholder="e.g. RAAST-987123 or MEZN-44120"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      required
                    />

                    <Input
                      label="Payment Notes (Optional)"
                      placeholder="e.g. Transferred via Meezan Mobile Banking App"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />

                    <div>
                      <label htmlFor="proof-file-input" className="text-xs font-bold text-slate-700 block mb-1.5">
                        Payment Proof Screenshot / Photo *
                      </label>
                      <label
                        htmlFor="proof-file-input"
                        className="flex items-center gap-2 p-3 border-2 border-dashed border-indigo-200 rounded-xl bg-white text-xs text-slate-600 cursor-pointer hover:border-[#0FA3A3] hover:bg-[#0FA3A3]/5 transition-colors"
                      >
                        <Upload className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                        <span className="font-bold truncate">
                          {proofFile ? proofFile.name : "Click to attach an image (JPG, PNG, WEBP)"}
                        </span>
                      </label>
                      <input
                        id="proof-file-input"
                        type="file"
                        accept="image/*"
                        onChange={handleProofFileChange}
                        className="sr-only"
                        aria-describedby={proofFileError ? "proof-file-error" : undefined}
                      />
                      {proofFileError && (
                        <p id="proof-file-error" className="text-[11px] text-rose-600 font-bold mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> {proofFileError}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Promo Coupon Card */}
          <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-3">
            <h3 className="text-xs font-black text-[#0E2A47] uppercase tracking-wider">Have a Discount Promo Coupon?</h3>
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <Input
                placeholder="e.g. WELCOME10, RAMADAN20"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
              />
              <Button type="submit" variant="teal" isLoading={isQuoting}>
                Apply
              </Button>
            </form>

            {couponError && (
              <p className="text-xs text-rose-600 font-extrabold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {couponError}
              </p>
            )}

            {couponSuccess && (
              <p className="text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {couponSuccess}
              </p>
            )}
          </Card>
        </div>

        {/* Sidebar Order Summary */}
        <div className="space-y-6">
          <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-md space-y-5 sticky top-20">
            <h3 className="text-sm font-black text-[#0E2A47] border-b border-slate-100 pb-3">Order Summary</h3>

            {/* Course Card Thumbnail & Title */}
            <div className="flex gap-3 pb-3 border-b border-slate-100">
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
              />
              <div className="space-y-1">
                <Badge variant="teal" size="sm" className="font-extrabold uppercase">
                  {course.examCategory}
                </Badge>
                <h4 className="text-xs font-black text-[#0E2A47] leading-tight">{course.title}</h4>
                <p className="text-[11px] text-slate-500 font-medium">{course.validityDays} Days Full Access</p>
              </div>
            </div>

            {/* Price Calculations Breakdown */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Standard Package Price:</span>
                <span className="font-bold text-slate-900">{formatPKR(course.price)}</span>
              </div>

              {appliedDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-extrabold">
                  <span>Coupon Discount ({appliedCouponCode.toUpperCase()}):</span>
                  <span>-{formatPKR(appliedDiscount)}</span>
                </div>
              )}

              <div className="flex justify-between text-base font-black text-[#0E2A47] pt-3 border-t border-slate-100">
                <span>Total Amount Payable:</span>
                <span className="text-[#0FA3A3]">{formatPKR(finalAmount)}</span>
              </div>
            </div>

            {/* Place Order CTA Button */}
            <Button
              fullWidth
              variant="teal"
              size="lg"
              isLoading={isSubmitting}
              disabled={!gateway || isLoadingGateways}
              onClick={handleMainCtaClick}
              className="font-black"
            >
              {mainCtaLabel}
            </Button>

            <div className="text-[10px] text-slate-400 text-center space-y-1">
              <p>🔒 Instant digital activation upon verification.</p>
              <p>7-day refund guarantee per platform terms.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
