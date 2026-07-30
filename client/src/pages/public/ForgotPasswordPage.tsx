import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, MailCheck, AlertCircle } from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button, Input, Card } from "../../components/ui";
import { authApi } from "../../api/endpoints/auth";

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      await authApi.forgotPassword(email);
      setIsSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process password reset request.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <AuthLayout title="Reset Link Dispatched" subtitle="Instructions sent to your candidate email.">
        <div className="space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-teal-50 text-[#0FA3A3] flex items-center justify-center mx-auto border-2 border-[#0FA3A3]/30 shadow-md">
            <MailCheck className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-extrabold text-[#0E2A47]">Check Your Inbox</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              If an account exists for <span className="font-bold text-[#0E2A47]">{email}</span>, password reset instructions have been sent.
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-600 space-y-1">
            <p className="font-bold text-[#0E2A47]">Didn't receive the email?</p>
            <p>Check your spam/junk folder or request a new reset link after a few minutes.</p>
          </div>

          <Button variant="teal" fullWidth onClick={() => navigate("/login")} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Log In
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot Password?"
      subtitle="Enter your candidate email to receive password reset instructions."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <Input
          label="Email Address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="candidate@samsacademy.com"
          icon={<Mail className="w-4 h-4 text-slate-400" />}
        />

        <Button type="submit" variant="teal" fullWidth size="lg" isLoading={isLoading}>
          Send Reset Instructions
        </Button>

        <div className="text-center pt-3 border-t border-slate-100">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0E2A47]">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Log In
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};
