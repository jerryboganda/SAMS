import React, { useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Lock, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button, Input, Card } from "../../components/ui";
import { authApi } from "../../api/endpoints/auth";

export const ResetPasswordPage: React.FC = () => {
  const { token: paramToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // No mock-token fallback — a missing token means the reset link itself is
  // malformed; the submit handler below checks for this explicitly instead
  // of sending a fake token to the real API. See DECISIONS.md 2026-07-31
  // (Phase 3.2-3.4).
  const token = paramToken || searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // Live strength meter math
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: "None", color: "bg-slate-200" };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { score: 25, label: "Weak", color: "bg-red-500", text: "text-red-600" };
    if (score === 2) return { score: 50, label: "Fair", color: "bg-amber-500", text: "text-amber-600" };
    if (score === 3) return { score: 75, label: "Good", color: "bg-teal-500", text: "text-teal-600" };
    return { score: 100, label: "Strong", color: "bg-emerald-500", text: "text-emerald-600" };
  };

  const strength = getPasswordStrength(password);
  const hasMinLength = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!token) {
      setErrorMessage("Invalid or missing password reset link. Please request a new one.");
      return;
    }

    if (!hasMinLength) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (!passwordsMatch) {
      setErrorMessage("Passwords do not match. Please verify.");
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to reset password. Link may be invalid or expired.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout title="Password Updated Successfully!" subtitle="Your new candidate password is active.">
        <div className="space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-200 shadow-md">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-extrabold text-[#0E2A47]">Password Reset Complete</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your account password has been updated. You can now log in using your new credentials.
            </p>
          </div>

          <Button
            variant="teal"
            fullWidth
            size="lg"
            onClick={() => navigate("/login")}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Proceed to Log In
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set New Password" subtitle="Choose a strong password for your candidate account.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>
              {errorMessage}
              {!token && (
                <>
                  {" "}
                  <Link to="/forgot-password" className="font-bold underline">
                    Request a new link
                  </Link>
                  .
                </>
              )}
            </span>
          </div>
        )}

        {/* New Password + Strength Meter */}
        <div className="space-y-1.5">
          <Input
            label="New Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            icon={<Lock className="w-4 h-4 text-slate-400" />}
          />

          {password && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span className="text-slate-500">Password Strength:</span>
                <span className={strength.text}>{strength.label}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${strength.color}`}
                  style={{ width: `${strength.score}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Confirm New Password */}
        <Input
          label="Confirm New Password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          icon={<Lock className="w-4 h-4 text-slate-400" />}
        />

        <Button type="submit" variant="teal" fullWidth size="lg" isLoading={isLoading}>
          Reset Password
        </Button>
      </form>
    </AuthLayout>
  );
};
