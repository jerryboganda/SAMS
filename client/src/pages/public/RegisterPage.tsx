import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User as UserIcon, Mail, Phone, Lock, CheckCircle2, AlertCircle, RefreshCw, MailCheck } from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button, Input, Checkbox, Card } from "../../components/ui";
import { authApi } from "../../api/endpoints/auth";

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Status & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuccessScreen, setIsSuccessScreen] = useState(false);

  // Resend Verification Email Timer
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState("");

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Password Strength Meter Math
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
  const hasUpper = /[A-Z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!acceptTerms) {
      setErrorMessage("You must accept the Terms of Service & Privacy Policy to register.");
      return;
    }

    if (!hasMinLength || !passwordsMatch) {
      setErrorMessage("Please fulfill all password requirements before proceeding.");
      return;
    }

    setIsLoading(true);
    try {
      await authApi.register({ name, email, password, phone });
      setIsSuccessScreen(true);
      setResendCooldown(60); // Start 60s cooldown
    } catch (err: any) {
      setErrorMessage(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (resendCooldown > 0) return;
    setResendNotice("");
    try {
      setResendNotice("Verification email re-sent successfully! Please check your inbox.");
      setResendCooldown(60);
    } catch (err) {
      setResendNotice("Failed to resend verification email.");
    }
  };

  // SUCCESS SCREEN: VERIFY EMAIL
  if (isSuccessScreen) {
    return (
      <AuthLayout
        title="Check Your Email Inbox"
        subtitle="Verification link dispatched to your registered candidate email."
      >
        <div className="space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-teal-50 text-[#0FA3A3] flex items-center justify-center mx-auto border-2 border-[#0FA3A3]/30 shadow-md">
            <MailCheck className="w-8 h-8 stroke-[2]" />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-extrabold text-[#0E2A47]">Verify Your Email Address</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              We sent a verification email to <span className="font-bold text-[#0E2A47]">{email}</span>. Click the link inside the email to activate your SAMS Academy account.
            </p>
          </div>

          {resendNotice && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs border border-emerald-200 font-medium">
              {resendNotice}
            </div>
          )}

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-2">
            <p className="text-[11px] font-bold text-[#0E2A47] uppercase tracking-wider">Didn't receive the email?</p>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder.</li>
              <li>Ensure <span className="font-mono text-slate-800">{email}</span> was spelled correctly.</li>
              <li>Wait for the cooldown timer before clicking resend.</li>
            </ul>
          </div>

          {/* Resend button with 60s Cooldown */}
          <div className="space-y-3 pt-2">
            <Button
              variant="outline"
              fullWidth
              disabled={resendCooldown > 0}
              onClick={handleResendEmail}
              leftIcon={<RefreshCw className={`w-4 h-4 ${resendCooldown > 0 ? "animate-spin" : ""}`} />}
            >
              {resendCooldown > 0 ? `Resend Available in (${resendCooldown}s)` : "Resend Verification Email"}
            </Button>

            <Button variant="teal" fullWidth onClick={() => navigate("/login")}>
              Proceed to Log In
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // STANDARD REGISTRATION FORM
  return (
    <AuthLayout
      title="Create Candidate Account"
      subtitle="Join SAMS Academy for NRE Step 1, USMLE, & Gulf licensing preparation."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Full Name */}
        <Input
          label="Full Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dr. Muhammad Ali"
          icon={<UserIcon className="w-4 h-4 text-slate-400" />}
        />

        {/* Email Address */}
        <Input
          label="Email Address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="candidate@samsacademy.com"
          icon={<Mail className="w-4 h-4 text-slate-400" />}
        />

        {/* Phone Number (+92 Format Hint) */}
        <Input
          label="Phone Number"
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+92 300 1234567"
          hint="Pakistan format: +92 3XX XXXXXXX for SMS notifications"
          icon={<Phone className="w-4 h-4 text-slate-400" />}
        />

        {/* Password + Live Strength Meter */}
        <div className="space-y-1.5">
          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            icon={<Lock className="w-4 h-4 text-slate-400" />}
          />

          {password && (
            <div className="space-y-2 pt-1">
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

              {/* Password Requirements Checklist */}
              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500 pt-1">
                <div className={`flex items-center gap-1 ${hasMinLength ? "text-emerald-600 font-bold" : ""}`}>
                  <CheckCircle2 className="w-3 h-3" /> 8+ Characters
                </div>
                <div className={`flex items-center gap-1 ${hasUpper ? "text-emerald-600 font-bold" : ""}`}>
                  <CheckCircle2 className="w-3 h-3" /> Uppercase Letter
                </div>
                <div className={`flex items-center gap-1 ${hasNumberOrSymbol ? "text-emerald-600 font-bold" : ""}`}>
                  <CheckCircle2 className="w-3 h-3" /> Number or Symbol
                </div>
                <div className={`flex items-center gap-1 ${passwordsMatch ? "text-emerald-600 font-bold" : ""}`}>
                  <CheckCircle2 className="w-3 h-3" /> Passwords Match
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <Input
          label="Confirm Password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          icon={<Lock className="w-4 h-4 text-slate-400" />}
        />

        {/* Terms Checkbox */}
        <div className="pt-2">
          <Checkbox
            id="acceptTerms"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            label={
              <span className="text-xs text-slate-600">
                I agree to the{" "}
                <Link to="/terms" className="text-[#0FA3A3] font-bold hover:underline" target="_blank">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-[#0FA3A3] font-bold hover:underline" target="_blank">
                  Privacy Policy
                </Link>
                .
              </span>
            }
          />
        </div>

        {/* Submit Button */}
        <Button type="submit" variant="teal" fullWidth size="lg" isLoading={isLoading} className="mt-2">
          Register Candidate Account
        </Button>

        {/* Link to Login */}
        <div className="text-center pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">Already have an account? </span>
          <Link to="/login" className="text-xs font-bold text-[#0FA3A3] hover:underline">
            Log In Here
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};
