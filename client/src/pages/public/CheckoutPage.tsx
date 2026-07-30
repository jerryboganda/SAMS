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
import { checkoutApi } from "../../api/endpoints/checkout";
import { MOCK_COURSES } from "../../mock-data";
import { formatPKR } from "../../utils/formatters";
import { PaymentGateway } from "../../types";

export const CheckoutPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Find course by slug or query parameter "course"
  const courseIdParam = searchParams.get("course");
  const course =
    MOCK_COURSES.find((c) => c.slug === slug) ||
    MOCK_COURSES.find((c) => c.id === Number(courseIdParam)) ||
    MOCK_COURSES[0];

  // Already Enrolled Check (Demo student enrolled in course 1 by default)
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(course.id === 1);

  // Quote State
  const [couponCode, setCouponCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponSuccess, setCouponSuccess] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);

  // Payment Selection State
  const [gateway, setGateway] = useState<PaymentGateway>("jazzcash");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Copy Feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Proof Upload Form State
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");

  // Gateway Config from backend (PayFast and Safepay are disabled: true)
  const gatewayConfigs = [
    {
      id: "jazzcash" as PaymentGateway,
      name: "JazzCash Mobile Wallet",
      desc: "Instant Automatic Activation",
      badge: "INSTANT",
      enabled: true,
    },
    {
      id: "easypaisa" as PaymentGateway,
      name: "EasyPaisa Wallet",
      desc: "Instant Automatic Activation",
      badge: "INSTANT",
      enabled: true,
    },
    {
      id: "raast" as PaymentGateway,
      name: "Raast Instant Transfer",
      desc: "Official SAMS Raast ID / QR Code",
      badge: "POPULAR",
      enabled: true,
    },
    {
      id: "bank_transfer" as PaymentGateway,
      name: "Direct Bank Transfer (Meezan)",
      desc: "IBAN Transfer & Proof Upload",
      badge: "SECURE",
      enabled: true,
    },
    // PayFast and Safepay exist in backend config as disabled: true
    {
      id: "payfast" as PaymentGateway,
      name: "PayFast Card Gateway",
      desc: "Credit / Debit Cards",
      badge: "DISABLED",
      enabled: false,
    },
    {
      id: "safepay" as PaymentGateway,
      name: "Safepay Gateway",
      desc: "Online Cards",
      badge: "DISABLED",
      enabled: false,
    },
  ].filter((gw) => gw.enabled); // Strictly render ONLY enabled gateways

  // Raast & Bank Transfer details
  const paymentAccountDetails = {
    raastId: "03001234567@raast",
    iban: "PK36MEZN0001020304050607",
    accountTitle: "SAMS ACADEMY PRIVATE LIMITED",
    bankName: "Meezan Bank Limited, Main Campus Branch",
    qrImageUrl: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PK36MEZN0001020304050607&format=svg",
  };

  const finalAmount = Math.max(0, course.price - appliedDiscount);

  // Copy helper
  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
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

  // Handle Order Placement
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await checkoutApi.createOrder({
        courseId: course.id,
        couponCode: appliedCouponCode || undefined,
        gateway,
      });

      if (gateway === "raast" || gateway === "bank_transfer") {
        // If proof is supplied inline or submitted
        if (!referenceNo) {
          alert("Please enter your transaction reference number or transaction ID.");
          setIsSubmitting(false);
          return;
        }

        await checkoutApi.uploadBankProof(res.order.id, {
          referenceNo,
          note,
          fileUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80",
        });

        navigate(`/order/${res.order.id}/status?status=awaiting_verification&gateway=${gateway}`);
      } else {
        // JazzCash or EasyPaisa -> Redirect to order status page
        navigate(`/order/${res.order.id}/status?gateway=${gateway}`);
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
          </Card>

          {/* Manual Transfer Details Panel (For Raast or Bank Transfer) */}
          {(gateway === "raast" || gateway === "bank_transfer") && (
            <Card className="p-6 border-indigo-200 bg-indigo-50/30 rounded-2xl shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-indigo-950">
                    {gateway === "raast" ? "Official Raast Transfer Details" : "Meezan Bank Account Details"}
                  </h3>
                </div>
                <Badge variant="teal" size="sm" className="font-bold uppercase">
                  Verify & Pay
                </Badge>
              </div>

              {/* Account Box & QR Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-indigo-100 text-xs">
                <div className="sm:col-span-2 space-y-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Bank Name</span>
                    <span className="font-extrabold text-[#0E2A47]">{paymentAccountDetails.bankName}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Account Title</span>
                    <span className="font-extrabold text-[#0E2A47]">{paymentAccountDetails.accountTitle}</span>
                  </div>

                  {gateway === "raast" ? (
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Official Raast ID</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-900 font-black">
                          {paymentAccountDetails.raastId}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(paymentAccountDetails.raastId, "raast")}
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
                          {paymentAccountDetails.iban}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(paymentAccountDetails.iban, "iban")}
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

                {/* QR Code Placeholder Box */}
                <div className="flex flex-col items-center justify-center bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-center space-y-1">
                  <img
                    src={paymentAccountDetails.qrImageUrl}
                    alt="Raast QR Code"
                    className="w-24 h-24 rounded-lg bg-white p-1 border border-slate-200"
                  />
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    Scan in Banking App
                  </span>
                </div>
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
              </div>
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
              onClick={handlePlaceOrder}
              className="font-black"
            >
              {gateway === "raast" || gateway === "bank_transfer" ? "Submit Payment Proof" : "Pay & Activate Course"}
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
