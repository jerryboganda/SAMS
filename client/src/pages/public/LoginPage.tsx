import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Lock,
  Mail,
  Smartphone,
  ShieldAlert,
  KeyRound,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  PhoneCall,
  CheckCircle2,
  ShieldCheck,
  MailWarning,
} from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button, Input, Checkbox, Badge, Card } from "../../components/ui";
import { useAuth } from "../../stores/authStore";
import { authApi } from "../../api/endpoints/auth";
import { CONFIG } from "../../config";
import { resolveLoginErrorScreen } from "./loginErrorScreen";

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, logout, clearErrors, completeExternalLogin, sessionExpiredMessage } = useAuth();

  // Primary Login Form State
  const [email, setEmail] = useState(CONFIG.USE_MOCK ? "student@samsacademy.com" : "");
  const [password, setPassword] = useState(CONFIG.USE_MOCK ? "Student@123" : "");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Screen View States: 'normal' | 'device_limit' | 'totp' | 'suspicious' | 'locked' | 'email_unverified'
  const [activeScreen, setActiveScreen] = useState<
    "normal" | "device_limit" | "totp" | "suspicious" | "locked" | "email_unverified"
  >("normal");

  // Step Inputs
  const [twoFaCode, setTwoFaCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [reverifyCode, setReverifyCode] = useState("");

  // Account Locked Countdown Timer (15 min = 900 seconds)
  const [lockedTimeLeft, setLockedTimeLeft] = useState(900);

  // Device reset request feedback
  const [deviceResetRequested, setDeviceResetRequested] = useState(false);

  // Resend-verification feedback (EMAIL_NOT_VERIFIED screen)
  const [resendNotice, setResendNotice] = useState("");
  const [isResending, setIsResending] = useState(false);

  // Check returnTo or next query param
  const searchParams = new URLSearchParams(location.search);
  const returnTo = searchParams.get("returnTo") || searchParams.get("next") || (location.state as any)?.from?.pathname;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeScreen === "locked" && lockedTimeLeft > 0) {
      timer = setInterval(() => {
        setLockedTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeScreen, lockedTimeLeft]);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const routeAfterLogin = (userRole: string) => {
    if (returnTo) {
      navigate(returnTo);
    } else if (userRole === "admin") {
      navigate("/admin");
    } else {
      navigate("/app");
    }
  };

  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    clearErrors();

    // Mock-only test-email shortcuts (Quick Testing Presets panel below) —
    // these never touch the real API, so they must not fire once the real
    // backend is live (CONFIG.USE_MOCK === false) or a real user whose email
    // happens to contain e.g. "+2fa" would get routed to a fake screen
    // instead of actually logging in. See DECISIONS.md 2026-07-31.
    if (CONFIG.USE_MOCK) {
      if (email.includes("+limit")) {
        setIsLoading(false);
        setActiveScreen("device_limit");
        return;
      }
      if (email.includes("+2fa")) {
        setIsLoading(false);
        setActiveScreen("totp");
        return;
      }
      if (email.includes("+suspicious") || email.includes("+reverify")) {
        setIsLoading(false);
        setActiveScreen("suspicious");
        return;
      }
      if (email.includes("+locked")) {
        setIsLoading(false);
        setLockedTimeLeft(900);
        setActiveScreen("locked");
        return;
      }
    }

    try {
      const user = await login(email, password);
      if (user) {
        routeAfterLogin(user.role);
      }
    } catch (err: any) {
      const screen = resolveLoginErrorScreen(err.code, err.status);
      if (screen) {
        if (screen === "locked") setLockedTimeLeft(900);
        setActiveScreen(screen);
      } else {
        setErrorMessage(err.message || "Invalid credentials provided.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 2FA TOTP Form Submit — the real backend has no standalone
  // `/auth/2fa/verify` endpoint; the TOTP/backup code must be resubmitted
  // together with email+password on POST /auth/login (docs/04_API_SPEC.md
  // §1). Reuses the same `login()` used for the initial submit rather than
  // authApi.verify2FA() directly, since `login()` already retains the
  // entered `password` in this component's state.
  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    try {
      const user = await login({ email, password, twofaCode: twoFaCode || "123456" });
      if (user) {
        routeAfterLogin(user.role);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Invalid verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Resend the verification email from the EMAIL_NOT_VERIFIED screen.
  const handleResendVerification = async () => {
    setIsResending(true);
    setResendNotice("");
    try {
      const res = await authApi.resendVerification(email);
      setResendNotice(res.message || "Verification email sent. Please check your inbox.");
    } catch (err: any) {
      setResendNotice(err.message || "Failed to resend verification email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // Suspicious Reverify Submit — authApi.reverifyLogin() (like authApi.login())
  // completes the session server-side via httpOnly cookies, but doesn't
  // touch client-side auth state on its own. Without committing the
  // returned user into the auth store here, `useAuth().isAuthenticated`
  // stays false after a real (non-mock) reverify success, and
  // ProtectedRoute immediately bounces the now-actually-logged-in admin/
  // student straight back to /login. See DECISIONS.md (Phase 4.2).
  const handleReverifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await authApi.reverifyLogin(email, reverifyCode || "123456");
      if (res.user) {
        completeExternalLogin(res.user, res.token);
        routeAfterLogin(res.user.role);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Invalid confirmation code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Demo Preset Handlers
  const applyPreset = (presetEmail: string, presetPw: string) => {
    setEmail(presetEmail);
    setPassword(presetPw);
    setErrorMessage("");
    setActiveScreen("normal");
  };

  // ---------------------------------------------------------------------------
  // SCREEN 1: 423 DEVICE_LIMIT_REACHED
  // ---------------------------------------------------------------------------
  if (activeScreen === "device_limit") {
    return (
      <AuthLayout title="2-Device Limit Reached" subtitle="Account access restricted under candidate security policy.">
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant="danger" className="text-xs font-bold uppercase tracking-wider">
              423 DEVICE_LIMIT_REACHED
            </Badge>
          </div>

          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-xs text-rose-900">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
              <Smartphone className="w-5 h-5 text-rose-600 shrink-0" />
              <span>Maximum Registered Devices Active</span>
            </div>
            <p className="leading-relaxed">
              SAMS Academy strictly permits maximum <span className="font-bold">2 registered devices</span> per candidate account (e.g., 1 primary laptop + 1 tablet/mobile) to protect proprietary lectures and QBank content.
            </p>
            <p className="text-[11px] text-rose-700 italic">
              Logged-in primary devices: Windows 11 PC (Lahore) & iPad Pro (Karachi).
            </p>
          </div>

          {/* Contact Support Panel */}
          <Card className="p-4 bg-slate-900 text-white space-y-3 border-slate-800">
            <h4 className="text-xs font-bold text-[#0FA3A3] uppercase tracking-wider flex items-center gap-2">
              <HelpCircle className="w-4 h-4" /> Request Device Reset from Admin
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              If you have upgraded your laptop or lost a registered device, contact SAMS Academy candidate support to reset your registered device slots.
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80">
                <span className="text-slate-400">Support Email:</span>
                <a href="mailto:support@samsacademy.com" className="font-bold text-white hover:underline">
                  support@samsacademy.com
                </a>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80">
                <span className="text-slate-400">WhatsApp Support:</span>
                <a href="https://wa.me/923001234567" target="_blank" rel="noreferrer" className="font-bold text-[#0FA3A3] hover:underline flex items-center gap-1">
                  <PhoneCall className="w-3.5 h-3.5" /> +92 300 1234567
                </a>
              </div>
            </div>

            {deviceResetRequested ? (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Device reset request submitted to Admin! Processing within 2 hours.</span>
              </div>
            ) : (
              <Button
                variant="teal"
                fullWidth
                size="sm"
                onClick={() => setDeviceResetRequested(true)}
              >
                Submit Instant Reset Request
              </Button>
            )}
          </Card>

          <Button variant="outline" fullWidth onClick={() => setActiveScreen("normal")}>
            Back to Login Form
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // SCREEN 2: SUSPICIOUS LOGIN ("Confirm it's you")
  // ---------------------------------------------------------------------------
  if (activeScreen === "suspicious") {
    return (
      <AuthLayout title="Confirm It's You" subtitle="Security authorization required for unrecognized login attempt.">
        <form onSubmit={handleReverifySubmit} className="space-y-4">
          <Badge variant="warning">SUSPICIOUS LOCATION DETECTED</Badge>

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Unrecognized Device or IP Address</span>
            </div>
            <p className="leading-relaxed">
              We detected a login from an unfamiliar IP location. A 6-digit confirmation code has been emailed to <span className="font-bold">{email}</span>.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <Input
            label="6-Digit Email Code"
            required
            value={reverifyCode}
            onChange={(e) => setReverifyCode(e.target.value)}
            placeholder="123456 (Hint: Enter 123456)"
            icon={<KeyRound className="w-4 h-4 text-slate-400" />}
          />

          <Button type="submit" variant="teal" fullWidth size="lg" isLoading={isLoading}>
            Verify Code & Sign In
          </Button>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <button
              type="button"
              onClick={() => alert("Verification code re-sent to email!")}
              className="text-[#0FA3A3] font-bold hover:underline"
            >
              Resend Code
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen("normal")}
              className="hover:underline"
            >
              Back to Login
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // SCREEN 3: 2FA TOTP STEP
  // ---------------------------------------------------------------------------
  if (activeScreen === "totp") {
    return (
      <AuthLayout title="Two-Factor Authentication" subtitle="Enter your 6-digit TOTP code or backup key.">
        <form onSubmit={handle2FASubmit} className="space-y-4">
          <Badge variant="teal">2FA PROTECTION ACTIVE</Badge>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
            {useBackupCode
              ? "Enter one of your 8-character single-use emergency backup codes."
              : "Open your Authenticator app (Google Authenticator / Authy) and enter the current 6-digit code."}
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <Input
            label={useBackupCode ? "Emergency Backup Code" : "2FA Code"}
            required
            value={twoFaCode}
            onChange={(e) => setTwoFaCode(e.target.value)}
            placeholder={useBackupCode ? "A1B2-C3D4" : "123456 (Hint: Enter 123456)"}
            icon={<ShieldCheck className="w-4 h-4 text-[#0FA3A3]" />}
          />

          <Button type="submit" variant="teal" fullWidth size="lg" isLoading={isLoading}>
            Verify 2FA Code
          </Button>

          <div className="flex items-center justify-between text-xs pt-2">
            <button
              type="button"
              onClick={() => setUseBackupCode(!useBackupCode)}
              className="text-[#0FA3A3] font-bold hover:underline"
            >
              {useBackupCode ? "Use Authenticator App Instead" : "Lost phone? Use Backup Code"}
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen("normal")}
              className="text-slate-500 hover:underline"
            >
              Back to Login
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // SCREEN 4: ACCOUNT_LOCKED COUNTDOWN
  // ---------------------------------------------------------------------------
  if (activeScreen === "locked") {
    return (
      <AuthLayout title="Account Temporarily Locked" subtitle="Failed login attempts threshold exceeded.">
        <div className="space-y-5 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border-2 border-red-200">
            <Clock className="w-7 h-7" />
          </div>

          <Badge variant="danger">ACCOUNT_LOCKED (15 MIN)</Badge>

          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2 text-xs text-red-900 text-left">
            <p className="font-bold text-sm text-red-800">6 Failed Login Attempts Detected</p>
            <p className="leading-relaxed">
              To protect candidate accounts from brute-force attacks, logins for <span className="font-bold">{email}</span> are temporarily suspended for 15 minutes.
            </p>
          </div>

          {/* Live Countdown Timer */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Lockout Time Remaining</span>
            <div className="text-3xl font-extrabold font-mono text-amber-400">
              {formatTime(lockedTimeLeft)}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Button variant="teal" fullWidth onClick={() => navigate("/forgot-password")}>
              Reset Password Now
            </Button>
            <Button variant="outline" fullWidth onClick={() => setActiveScreen("normal")}>
              Back to Login
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // SCREEN 5: EMAIL_NOT_VERIFIED
  // ---------------------------------------------------------------------------
  if (activeScreen === "email_unverified") {
    return (
      <AuthLayout title="Email Address Not Verified" subtitle="Please verify your email before signing in.">
        <div className="space-y-5">
          <Badge variant="warning">403 EMAIL_NOT_VERIFIED</Badge>

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <MailWarning className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Verification Required</span>
            </div>
            <p className="leading-relaxed">
              Your account for <span className="font-bold">{email}</span> is registered but not yet verified. Please check your inbox for the verification link, or request a new one below.
            </p>
          </div>

          {resendNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {resendNotice}
            </div>
          )}

          <Button
            variant="teal"
            fullWidth
            size="lg"
            isLoading={isResending}
            onClick={handleResendVerification}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Resend Verification Email
          </Button>

          <Button variant="outline" fullWidth onClick={() => setActiveScreen("normal")}>
            Back to Login
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // SCREEN 0: STANDARD LOGIN FORM
  // ---------------------------------------------------------------------------
  return (
    <AuthLayout
      title="Candidate & Admin Login"
      subtitle="Sign in to access NRE Step 1 courses, QBank, & mock exams."
    >
      <div className="space-y-4">
        {/* Session-Expired Notice (redirected here after a revoked/expired
            mid-session token — see authStore.tsx's AUTH_SESSION_EXPIRED_EVENT
            handling). Not an error: cleared on the next login attempt. */}
        {sessionExpiredMessage && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{sessionExpiredMessage}</span>
          </div>
        )}

        {/* Quick Demo Credentials Presets Bar */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#0E2A47] uppercase tracking-wider">
            <span>Quick Testing Presets</span>
            <span className="text-slate-400 font-normal">Click to load</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => applyPreset("student@samsacademy.com", "Student@123")}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0FA3A3] font-semibold text-left truncate"
            >
              🎓 Student
            </button>

            <button
              type="button"
              onClick={() => applyPreset("admin@samsacademy.com", "Admin@12345")}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-amber-500 font-semibold text-left truncate"
            >
              🛡️ Admin
            </button>

            {/* The remaining presets only work against the mock login
                simulation (client/src/api/endpoints/auth.ts) — none of
                these synthetic emails exist as real seeded accounts, so
                they're hidden once CONFIG.USE_MOCK is false to avoid
                misleading real users. See DECISIONS.md 2026-07-31. */}
            {CONFIG.USE_MOCK && (
            <>
            <button
              type="button"
              onClick={() => applyPreset("student+limit@samsacademy.com", "Student@123")}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-rose-700 hover:border-rose-400 font-semibold text-left truncate"
            >
              📱 2-Device
            </button>

            <button
              type="button"
              onClick={() => applyPreset("student+2fa@samsacademy.com", "Student@123")}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-teal-700 hover:border-teal-400 font-semibold text-left truncate"
            >
              🔐 2FA Code
            </button>

            <button
              type="button"
              onClick={() => applyPreset("student+suspicious@samsacademy.com", "Student@123")}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-amber-700 hover:border-amber-400 font-semibold text-left truncate"
            >
              🛡️ Reverify
            </button>

            <button
              type="button"
              onClick={() => applyPreset("student+locked@samsacademy.com", "Student@123")}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-red-700 hover:border-red-400 font-semibold text-left truncate"
            >
              🔒 Locked
            </button>
            </>
            )}
          </div>
        </div>

        {/* Form Error Banner */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleStandardSubmit} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="candidate@samsacademy.com"
            icon={<Mail className="w-4 h-4 text-slate-400" />}
          />

          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            icon={<Lock className="w-4 h-4 text-slate-400" />}
          />

          <div className="flex items-center justify-between text-xs">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              label="Remember candidate device"
            />

            <Link to="/forgot-password" className="text-xs font-bold text-[#0FA3A3] hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" variant="teal" fullWidth size="lg" isLoading={isLoading}>
            Sign In to Account
          </Button>

          <div className="text-center pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">Don't have an account? </span>
            <Link to="/register" className="text-xs font-bold text-[#0FA3A3] hover:underline">
              Create Candidate Account
            </Link>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
};
