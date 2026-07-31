import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, MailCheck, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button, Card, Badge, Input } from "../../components/ui";
import { authApi } from "../../api/endpoints/auth";

export const VerifyEmailPage: React.FC = () => {
  const { token: paramToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // No mock-token fallback here — a missing token means the link is
  // genuinely malformed (e.g. the user navigated to /verify-email directly).
  // Sending an empty/fake token to the real API would just produce a
  // confusing "invalid token" round-trip; short-circuit to the failure
  // screen instead. See DECISIONS.md 2026-07-31 (Phase 3.2-3.4).
  const token = paramToken || searchParams.get("token") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendNotice, setResendNotice] = useState("");
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setIsSuccess(false);
      setErrorMsg("This verification link is missing its token. Please use the exact link from your email.");
      return;
    }

    const verifyToken = async () => {
      setIsLoading(true);
      setErrorMsg("");
      try {
        await authApi.verifyEmailToken(token);
        setIsSuccess(true);
      } catch (err: any) {
        setIsSuccess(false);
        setErrorMsg(err.message || "Invalid or expired verification token.");
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleResendLink = async () => {
    if (!resendEmail.trim()) {
      setResendNotice("Please enter your email address first.");
      return;
    }
    setIsResending(true);
    setResendNotice("");
    try {
      const res = await authApi.resendVerification(resendEmail.trim());
      setResendNotice(res.message || "A new verification link has been sent to your email address.");
    } catch (err: any) {
      setResendNotice(err.message || "Failed to send a new verification link. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  if (isLoading) {
    return (
      <AuthLayout title="Verifying Email Address" subtitle="Please wait while we validate your candidate token...">
        <div className="py-12 text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-[#0FA3A3] animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Validating verification token with SAMS servers...</p>
        </div>
      </AuthLayout>
    );
  }

  if (isSuccess) {
    return (
      <AuthLayout title="Email Verified Successfully!" subtitle="Your candidate account is now active.">
        <div className="space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-200 shadow-md">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <Badge variant="teal">ACCOUNT ACTIVATED</Badge>
            <h3 className="text-lg font-extrabold text-[#0E2A47]">Welcome to SAMS Academy</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your email has been verified. You can now log in to access NRE Step 1 video courses, QBank vignettes, and mock exam simulations.
            </p>
          </div>

          <Button
            variant="teal"
            fullWidth
            size="lg"
            onClick={() => navigate("/login")}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Log In to Candidate Portal
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verification Failed" subtitle="The link appears to be invalid or expired.">
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border-2 border-rose-200 shadow-md">
          <XCircle className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <Badge variant="danger">LINK EXPIRED OR INVALID</Badge>
          <h3 className="text-base font-extrabold text-[#0E2A47]">Verification Link Issue</h3>
          <p className="text-xs text-slate-600 leading-relaxed bg-rose-50 p-3 rounded-xl border border-rose-200 text-rose-800">
            {errorMsg}
          </p>
        </div>

        {resendNotice && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl border border-emerald-200 font-medium">
            {resendNotice}
          </div>
        )}

        {/* A verification token alone can't tell us who to resend to (the
            token itself may be invalid/expired) — ask for the email
            explicitly rather than guessing. See DECISIONS.md 2026-07-31. */}
        <div className="text-left">
          <Input
            label="Email Address"
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            placeholder="candidate@samsacademy.com"
          />
        </div>

        <div className="space-y-3 pt-2">
          <Button
            variant="teal"
            fullWidth
            isLoading={isResending}
            onClick={handleResendLink}
            leftIcon={<MailCheck className="w-4 h-4" />}
          >
            Request New Verification Link
          </Button>

          <Button variant="outline" fullWidth onClick={() => navigate("/login")}>
            Back to Login
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
};
