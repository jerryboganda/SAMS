import React, { useState } from "react";
import {
  User as UserIcon,
  Shield,
  Smartphone,
  KeyRound,
  CheckCircle2,
  Copy,
  Download,
  AlertTriangle,
  QrCode,
  Lock,
  Phone,
  Mail,
  Laptop,
  Globe,
  Info,
  Check,
} from "lucide-react";
import { Card, Button, Input, Badge, Tabs } from "../../components/ui";
import { useAuth } from "../../stores/authStore";

export const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

  // Profile Form State
  const [name, setName] = useState(user?.name || "Dr. Hamza Malik");
  const [phone, setPhone] = useState("+92 300 1234567");
  const [medicalCollege, setMedicalCollege] = useState("King Edward Medical University (KEMU)");
  const [targetExam, setTargetExam] = useState("NRE Step 1 (PMDC Pakistan)");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // 2FA Setup Flow State
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [twoFAStep, setTwoFAStep] = useState<"disabled" | "qr_step" | "otp_verify" | "enabled_success">("disabled");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);

  const secretKey2FA = "JBSWY3DPEHPK3PXP";
  const backupCodes2FA = [
    "8F2A-9K1L",
    "3M4N-7P8Q",
    "9K2P-1L5X",
    "4Q8R-6S2T",
    "7M3K-9N1P",
    "2L5X-8R4Q",
    "6P2M-3T9N",
    "1N8Q-4K7L",
  ];

  // Profile Save Handler
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser({ name });
    setProfileSuccess("Profile details updated successfully!");
    setTimeout(() => setProfileSuccess(""), 3000);
  };

  // Password Change Handler
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword) {
      setPasswordError("Please enter your current account password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    setPasswordSuccess("Password updated successfully! Next login will require your new password.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordSuccess(""), 3000);
  };

  // 2FA Handlers
  const handleCopy2FAKey = () => {
    navigator.clipboard.writeText(secretKey2FA);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleVerify2FAOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length !== 6) {
      setOtpError("Please enter a valid 6-digit verification code from Google Authenticator.");
      return;
    }

    setOtpError("");
    setIs2FAEnabled(true);
    setTwoFAStep("enabled_success");
  };

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-black text-[#0E2A47]">Account Settings & Security</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage personal credentials, two-factor authentication, and authorized devices.
        </p>
      </div>

      {/* Tabs Navigation */}
      <Tabs
        tabs={[
          { id: "profile", label: "Personal Profile", icon: <UserIcon className="w-4 h-4" /> },
          { id: "security", label: "Security & 2FA", icon: <Shield className="w-4 h-4" /> },
          { id: "devices", label: "Registered Devices (2 Slots)", icon: <Smartphone className="w-4 h-4" /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 1: PERSONAL PROFILE */}
      {activeTab === "profile" && (
        <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0E2A47] text-white font-black text-lg flex items-center justify-center">
              {user?.name ? user.name.charAt(0) : "S"}
            </div>
            <div>
              <h3 className="text-base font-black text-[#0E2A47]">{user?.name || "Dr. Student"}</h3>
              <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
            </div>
          </div>

          {profileSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {profileSuccess}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Full Name *" value={name} onChange={(e) => setName(e.target.value)} required />

              <Input label="Mobile Phone Number *" value={phone} onChange={(e) => setPhone(e.target.value)} required />

              <Input
                label="Email Address (Account Identifier)"
                value={user?.email || "student@samsacademy.com"}
                disabled
              />

              <Input
                label="Target Licensing Exam"
                value={targetExam}
                onChange={(e) => setTargetExam(e.target.value)}
              />

              <div className="sm:col-span-2">
                <Input
                  label="Medical College / University"
                  value={medicalCollege}
                  onChange={(e) => setMedicalCollege(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" variant="teal" size="md">
                Save Profile Changes
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 2: SECURITY & 2FA */}
      {activeTab === "security" && (
        <div className="space-y-6">
          {/* Change Password Card */}
          <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
            <h3 className="text-sm font-black text-[#0E2A47] border-b border-slate-100 pb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#0FA3A3]" /> Change Account Password
            </h3>

            {passwordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <Input
                type="password"
                label="Current Password *"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  type="password"
                  label="New Password (min 8 chars) *"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  label="Confirm New Password *"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="teal" size="md">
                  Update Password
                </Button>
              </div>
            </form>
          </Card>

          {/* Two-Factor Authentication (2FA) Card */}
          <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#0FA3A3]" /> Two-Factor Authentication (2FA)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Protect your exam subscription with Google Authenticator or TOTP app.
                </p>
              </div>

              <Badge variant={is2FAEnabled ? "emerald" : "secondary"} size="md" className="font-bold">
                {is2FAEnabled ? "ENABLED & ACTIVE" : "DISABLED"}
              </Badge>
            </div>

            {/* 2FA Flow Controls */}
            {twoFAStep === "disabled" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Two-factor authentication adds an extra layer of security to your candidate account by requiring a 6-digit code from your authenticator app when signing in.
                </p>
                <Button type="button" variant="teal" size="md" onClick={() => setTwoFAStep("qr_step")}>
                  Enable Two-Factor Authentication
                </Button>
              </div>
            )}

            {twoFAStep === "qr_step" && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-xs">
                <div className="font-extrabold text-[#0E2A47] text-sm">Step 1: Scan QR Code or Copy Key</div>
                <p className="text-slate-600">
                  Open <strong>Google Authenticator</strong> or <strong>Authy</strong> on your smartphone and scan this barcode or enter the setup key manually:
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-6 bg-white p-4 rounded-xl border border-slate-200">
                  {/* QR Code SVG Image Placeholder */}
                  <div className="p-2 bg-white border border-slate-300 rounded-xl shrink-0">
                    <img
                      src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=otpauth://totp/SAMS%20Academy:student@samsacademy.com?secret=JBSWY3DPEHPK3PXP&issuer=SAMS%20Academy"
                      alt="2FA QR Code"
                      className="w-32 h-32"
                    />
                  </div>

                  <div className="space-y-2 text-left">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Secret Manual Key</span>
                    <div className="flex items-center gap-2">
                      <code className="font-mono bg-slate-100 px-3 py-1.5 rounded-lg text-slate-900 font-black text-sm">
                        {secretKey2FA}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopy2FAKey}
                        className="p-1.5 text-[#0FA3A3] hover:text-teal-700"
                      >
                        {copiedKey ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                      Account Label: <strong>student@samsacademy.com</strong>
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setTwoFAStep("disabled")}>
                    Cancel
                  </Button>
                  <Button variant="teal" size="sm" onClick={() => setTwoFAStep("otp_verify")}>
                    Next: Enter Code
                  </Button>
                </div>
              </div>
            )}

            {twoFAStep === "otp_verify" && (
              <form onSubmit={handleVerify2FAOTP} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-xs">
                <div className="font-extrabold text-[#0E2A47] text-sm">Step 2: Enter 6-Digit Authenticator Code</div>
                <p className="text-slate-600">
                  Enter the 6-digit verification code currently generated by your authenticator app to complete setup.
                </p>

                {otpError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" /> {otpError}
                  </div>
                )}

                <Input
                  label="6-Digit Verification Code *"
                  placeholder="e.g. 123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                  required
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setTwoFAStep("qr_step")}>
                    Back
                  </Button>
                  <Button type="submit" variant="teal" size="sm">
                    Verify & Enable 2FA
                  </Button>
                </div>
              </form>
            )}

            {(twoFAStep === "enabled_success" || is2FAEnabled) && (
              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-4 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" /> 2FA Protection Active
                </div>

                <div className="space-y-2 bg-white p-4 rounded-xl border border-emerald-100">
                  <span className="font-extrabold text-slate-900 block">Emergency Recovery Backup Codes</span>
                  <p className="text-slate-500 text-[11px]">
                    Store these 8 single-use codes safely. If you lose access to your mobile device, you can sign in with any of these backup codes:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs font-bold text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {backupCodes2FA.map((code) => (
                      <div key={code} className="text-center py-1 bg-white border border-slate-200 rounded-md">
                        {code}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(backupCodes2FA.join("\n"));
                        alert("Backup codes copied to clipboard!");
                      }}
                      icon={<Copy className="w-3.5 h-3.5" />}
                    >
                      Copy All Codes
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (confirm("Are you sure you want to disable 2FA? This will decrease account security.")) {
                        setIs2FAEnabled(false);
                        setTwoFAStep("disabled");
                      }
                    }}
                  >
                    Disable 2FA
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: REGISTERED DEVICES (2 SLOTS) */}
      {activeTab === "devices" && (
        <div className="space-y-6">
          <Card className="p-6 border-slate-200 bg-white rounded-2xl shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-[#0E2A47] flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#0FA3A3]" /> Registered Candidate Devices (2 / 2 Slots)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Strict content security policy: maximum 2 hardware devices permitted per active candidate account.
                </p>
              </div>

              <Badge variant="teal" size="sm" className="font-extrabold uppercase">
                2 SLOTS OCCUPIED
              </Badge>
            </div>

            {/* Device Slot 1 */}
            <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl space-y-2 text-xs relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-black text-[#0E2A47] text-sm flex items-center gap-2">
                      Windows 11 PC - Chrome 122
                      <Badge variant="emerald" size="sm" className="font-black">
                        CURRENT DEVICE
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-500">Registered: 2026-01-10 • IP: 182.180.122.45 (Lahore, PK)</div>
                  </div>
                </div>

                <Badge variant="emerald" size="sm" className="font-extrabold uppercase">
                  ACTIVE
                </Badge>
              </div>
            </div>

            {/* Device Slot 2 */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#0E2A47] text-white flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-black text-[#0E2A47] text-sm">Apple iPad Pro - Mobile Safari</div>
                    <div className="text-[11px] text-slate-500">Registered: 2026-04-12 • Last Active: Yesterday 8:15 PM</div>
                  </div>
                </div>

                <Badge variant="secondary" size="sm" className="font-extrabold uppercase">
                  ACTIVE
                </Badge>
              </div>
            </div>

            {/* Support Disclaimer Banner */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-1.5">
              <div className="font-extrabold flex items-center gap-1.5 text-amber-800">
                <Info className="w-4 h-4 text-amber-600" /> Device Slot Reset Policy:
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Device resets are strictly managed by system administrators to protect copyrighted medical lectures and QBank content. If you replace your tablet/laptop or require a slot reset, please email your invoice reference to{" "}
                <strong className="underline">support@samsacademy.com</strong>.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
