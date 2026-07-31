import React, { useEffect, useState } from "react";
import {
  Globe,
  CreditCard,
  Video,
  Mail,
  FileText,
  Save,
  Send,
  CheckCircle2,
  Lock,
  Building2,
  QrCode,
  ShieldAlert,
} from "lucide-react";
import { Card, Button, Input, Textarea, Toast } from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";

export const SettingsManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"site" | "payments" | "video" | "smtp" | "legal">("site");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form States
  const [siteForm, setSiteForm] = useState({
    name: "SAMS Academy",
    tagline: "Premier Medical Exam Preparation Platform",
    supportEmail: "support@samsacademy.com",
    supportPhone: "+92 300 1234567",
    whatsapp: "+92 300 1234567",
    facebookUrl: "https://facebook.com/samsacademy.pk",
    instagramUrl: "https://instagram.com/samsacademy.pk",
    youtubeUrl: "https://youtube.com/@samsacademy",
  });

  const [paymentsForm, setPaymentsForm] = useState({
    bankName: "Meezan Bank Limited",
    accountTitle: "SAMS Medical Academy Pvt Ltd",
    iban: "PK36MEZN0001234567890123",
    accountNumber: "0102-0103456789",
    branchCode: "0102 (Gulberg Branch, Lahore)",
    raastId: "03001234567",
    raastIban: "PK36MEZN0001234567890123",
    raastQrImage: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80",
    enabledGateways: ["jazzcash", "easypaisa", "raast", "bank_transfer"],
    gatewayKeys: {
      jazzcashMerchantId: "MC_JAZZ_987654",
      jazzcashPassword: "••••••••••••",
      jazzcashIntegritySalt: "••••••••••••••••",
      easypaisaStoreId: "EP_STORE_44321",
      easypaisaHashKey: "••••••••••••••••",
      payfastMerchantId: "PF_MERCHANT_1122",
      payfastSecuredKey: "••••••••••••••••",
      safepayApiKey: "sec_live_sf_998877",
      safepaySecret: "••••••••••••••••",
    },
  });

  const [videoForm, setVideoForm] = useState({
    bunnyLibraryId: "248910",
    bunnyApiKey: "••••••••-••••-••••-••••-••••••••••••",
    bunnyTokenAuthKey: "••••••••••••••••••••••••••••••••",
    bunnyCdnHostname: "video.samsacademy.com",
  });

  const [smtpForm, setSmtpForm] = useState({
    host: "smtp.hostinger.com",
    port: "465",
    user: "noreply@samsacademy.com",
    password: "••••••••••••",
    fromName: "SAMS Academy Notifications <noreply@samsacademy.com>",
    secure: true,
  });

  const [legalForm, setLegalForm] = useState({
    privacyPolicy: `# Privacy Policy\n\nAt SAMS Academy, accessible from https://samsacademy.com, one of our main priorities is the privacy of our candidates and medical doctors...`,
    termsAndConditions: `# Terms and Conditions\n\nWelcome to SAMS Academy. By purchasing or using our medical exam preparation portal, you agree to comply with the following terms...`,
    refundPolicy: `# Refund & Cancellation Policy\n\nSAMS Academy offers premium medical preparation courses. Please review our policy prior to enrollment...`,
  });

  const [testEmailAddress, setTestEmailAddress] = useState("doctor.test@samsacademy.com");

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSettings();
      if (data) {
        if (data.site) setSiteForm(data.site);
        if (data.payments) setPaymentsForm(data.payments);
        if (data.video) setVideoForm(data.video);
        if (data.smtp) setSmtpForm(data.smtp);
        if (data.legal) setLegalForm(data.legal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSection = async (section: string, formData: any) => {
    setSubmitting(true);
    try {
      await adminApi.updateSettings(section, formData);
      setToastMessage(`Saved ${section.toUpperCase()} configuration successfully.`);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGateway = (gatewayKey: string) => {
    const current = paymentsForm.enabledGateways;
    const exists = current.includes(gatewayKey);
    const updated = exists ? current.filter((g) => g !== gatewayKey) : [...current, gatewayKey];
    setPaymentsForm({ ...paymentsForm, enabledGateways: updated });
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="h-8 bg-slate-200 rounded w-1/3 animate-pulse"></div>
        <div className="h-96 bg-slate-200 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-extrabold text-[#0E2A47]">System Configuration & Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage platform branding, payment gateway credentials, Bunny video CDN keys, SMTP email relays, and legal policies.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
        {[
          { id: "site", label: "Site & Branding", icon: Globe },
          { id: "payments", label: "Payments & Gateways", icon: CreditCard },
          { id: "video", label: "Video CDN (Bunny)", icon: Video },
          { id: "smtp", label: "SMTP Email Setup", icon: Mail },
          { id: "legal", label: "Legal Policies", icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold transition-colors border-b-2 whitespace-nowrap ${
                isActive
                  ? "border-[#0FA3A3] text-[#0FA3A3] bg-teal-50/50"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: SITE */}
      {activeTab === "site" && (
        <Card className="p-6 border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-[#0E2A47] flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#0FA3A3]" /> Platform Identity & Support Channels
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Configure platform titles, candidate support emails, and social handles.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Platform Name"
              value={siteForm.name}
              onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}
            />
            <Input
              label="Tagline / Subheading"
              value={siteForm.tagline}
              onChange={(e) => setSiteForm({ ...siteForm, tagline: e.target.value })}
            />
            <Input
              label="Support Email Address"
              value={siteForm.supportEmail}
              onChange={(e) => setSiteForm({ ...siteForm, supportEmail: e.target.value })}
            />
            <Input
              label="Support Phone Number"
              value={siteForm.supportPhone}
              onChange={(e) => setSiteForm({ ...siteForm, supportPhone: e.target.value })}
            />
            <Input
              label="WhatsApp Helpline Number"
              value={siteForm.whatsapp}
              onChange={(e) => setSiteForm({ ...siteForm, whatsapp: e.target.value })}
            />
            <Input
              label="Facebook Page URL"
              value={siteForm.facebookUrl}
              onChange={(e) => setSiteForm({ ...siteForm, facebookUrl: e.target.value })}
            />
            <Input
              label="Instagram Profile URL"
              value={siteForm.instagramUrl}
              onChange={(e) => setSiteForm({ ...siteForm, instagramUrl: e.target.value })}
            />
            <Input
              label="YouTube Channel URL"
              value={siteForm.youtubeUrl}
              onChange={(e) => setSiteForm({ ...siteForm, youtubeUrl: e.target.value })}
            />
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="teal"
              icon={<Save className="w-4 h-4" />}
              isLoading={submitting}
              onClick={() => handleSaveSection("site", siteForm)}
            >
              Save Site Settings
            </Button>
          </div>
        </Card>
      )}

      {/* TAB 2: PAYMENTS */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          {/* Bank & Raast Details */}
          <Card className="p-6 border-slate-200 space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#0E2A47] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#0FA3A3]" /> Manual Bank Transfer & Raast Details
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                These credentials and QR codes are displayed to candidates during Raast and Bank Transfer checkout.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Bank Name"
                value={paymentsForm.bankName}
                onChange={(e) => setPaymentsForm({ ...paymentsForm, bankName: e.target.value })}
              />
              <Input
                label="Account Title"
                value={paymentsForm.accountTitle}
                onChange={(e) => setPaymentsForm({ ...paymentsForm, accountTitle: e.target.value })}
              />
              <Input
                label="IBAN Number"
                value={paymentsForm.iban}
                onChange={(e) => setPaymentsForm({ ...paymentsForm, iban: e.target.value })}
              />
              <Input
                label="Account Number"
                value={paymentsForm.accountNumber}
                onChange={(e) => setPaymentsForm({ ...paymentsForm, accountNumber: e.target.value })}
              />
              <Input
                label="Branch Code & Location"
                value={paymentsForm.branchCode}
                onChange={(e) => setPaymentsForm({ ...paymentsForm, branchCode: e.target.value })}
              />
              <Input
                label="Raast ID (Phone / IBAN)"
                value={paymentsForm.raastId}
                onChange={(e) => setPaymentsForm({ ...paymentsForm, raastId: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-[#0FA3A3]" /> Raast QR Image Upload Placeholder URL
              </label>
              <Input
                placeholder="https://images.unsplash.com/..."
                value={paymentsForm.raastQrImage}
                onChange={(e) => setPaymentsForm({ ...paymentsForm, raastQrImage: e.target.value })}
              />
              {paymentsForm.raastQrImage && (
                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 inline-block">
                  <img src={paymentsForm.raastQrImage} alt="Raast QR Preview" className="w-24 h-24 object-cover rounded" />
                </div>
              )}
            </div>
          </Card>

          {/* Gateways & Masked Secret Keys */}
          <Card className="p-6 border-slate-200 space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#0E2A47] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#0FA3A3]" /> Enabled Gateways & Masked API Keys
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Toggle gateway availability at student checkout. Secrets are stored securely with password masking.
              </p>
            </div>

            {/* Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {[
                { id: "jazzcash", name: "JazzCash Mobile Wallet" },
                { id: "easypaisa", name: "EasyPaisa Mobile Wallet" },
                { id: "raast", name: "Raast Instant Transfer" },
                { id: "bank_transfer", name: "Bank Transfer (Manual Proof)" },
                { id: "payfast", name: "PayFast Online Cards", placeholder: true },
                { id: "safepay", name: "Safepay Checkout", placeholder: true },
              ].map((gw) => {
                const isEnabled = paymentsForm.enabledGateways.includes(gw.id);
                return (
                  <div key={gw.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleGateway(gw.id)}
                        className="w-4 h-4 text-[#0FA3A3] rounded border-slate-300 focus:ring-[#0FA3A3]"
                      />
                      {gw.name}
                    </label>
                    {gw.placeholder && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                        Placeholder — integration pending
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Masked Secret Key Inputs */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" /> Gateway API Keys & Salt Credentials (Masked)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="JazzCash Merchant ID"
                  type="password"
                  value={paymentsForm.gatewayKeys.jazzcashMerchantId}
                  onChange={(e) =>
                    setPaymentsForm({
                      ...paymentsForm,
                      gatewayKeys: { ...paymentsForm.gatewayKeys, jazzcashMerchantId: e.target.value },
                    })
                  }
                />
                <Input
                  label="JazzCash Password"
                  type="password"
                  value={paymentsForm.gatewayKeys.jazzcashPassword}
                  onChange={(e) =>
                    setPaymentsForm({
                      ...paymentsForm,
                      gatewayKeys: { ...paymentsForm.gatewayKeys, jazzcashPassword: e.target.value },
                    })
                  }
                />
                <Input
                  label="EasyPaisa Store ID"
                  type="password"
                  value={paymentsForm.gatewayKeys.easypaisaStoreId}
                  onChange={(e) =>
                    setPaymentsForm({
                      ...paymentsForm,
                      gatewayKeys: { ...paymentsForm.gatewayKeys, easypaisaStoreId: e.target.value },
                    })
                  }
                />
                <Input
                  label="PayFast Merchant ID (Pending)"
                  type="password"
                  value={paymentsForm.gatewayKeys.payfastMerchantId}
                  onChange={(e) =>
                    setPaymentsForm({
                      ...paymentsForm,
                      gatewayKeys: { ...paymentsForm.gatewayKeys, payfastMerchantId: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="teal"
                icon={<Save className="w-4 h-4" />}
                isLoading={submitting}
                onClick={() => handleSaveSection("payments", paymentsForm)}
              >
                Save Payment Settings
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: VIDEO (BUNNY) */}
      {activeTab === "video" && (
        <Card className="p-6 border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-[#0E2A47] flex items-center gap-2">
              <Video className="w-5 h-5 text-[#0FA3A3]" /> Bunny Stream CDN Configuration (Masked Secrets)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Secure DRM video lecture token authentication parameters. Private API keys are kept masked.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Bunny Stream Library ID"
              value={videoForm.bunnyLibraryId}
              onChange={(e) => setVideoForm({ ...videoForm, bunnyLibraryId: e.target.value })}
            />
            <Input
              label="CDN Hostname"
              value={videoForm.bunnyCdnHostname}
              onChange={(e) => setVideoForm({ ...videoForm, bunnyCdnHostname: e.target.value })}
            />
            <Input
              label="Bunny API Key"
              type="password"
              value={videoForm.bunnyApiKey}
              onChange={(e) => setVideoForm({ ...videoForm, bunnyApiKey: e.target.value })}
            />
            <Input
              label="Token Authentication Secret Key"
              type="password"
              value={videoForm.bunnyTokenAuthKey}
              onChange={(e) => setVideoForm({ ...videoForm, bunnyTokenAuthKey: e.target.value })}
            />
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 space-y-1">
              <div className="font-bold text-[#0E2A47]">Adaptive HLS Streaming & Dynamic Watermarking Enforced</div>
              <p>
                All student video sessions enforce single concurrent device playback locks and generate dynamic overlays carrying candidate identity signatures.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="teal"
              icon={<Save className="w-4 h-4" />}
              isLoading={submitting}
              onClick={() => handleSaveSection("video", videoForm)}
            >
              Save Video Settings
            </Button>
          </div>
        </Card>
      )}

      {/* TAB 4: SMTP */}
      {activeTab === "smtp" && (
        <Card className="p-6 border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-[#0E2A47] flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#0FA3A3]" /> Hostinger SMTP Transactional Mailer
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure automated email relays for password resets, order invoices, and broadcast announcements.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="SMTP Host"
              value={smtpForm.host}
              onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
            />
            <Input
              label="SMTP Port"
              value={smtpForm.port}
              onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })}
            />
            <Input
              label="SMTP Username / Email"
              value={smtpForm.user}
              onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
            />
            <Input
              label="SMTP Password"
              type="password"
              value={smtpForm.password}
              onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Sender Name / From Address Header"
                value={smtpForm.fromName}
                onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
              />
            </div>
          </div>

          {/* Send Test Email Section — backend endpoint not built yet
              (POST /admin/settings/smtp/test is out of scope for this
              round, see DECISIONS.md), so this action is disabled with a
              clear "not yet available" treatment rather than wired to a
              404. */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 pt-4">
            <h4 className="text-xs font-bold text-[#0E2A47] flex items-center gap-1.5">
              <Send className="w-4 h-4 text-[#0FA3A3]" /> Send Test Email
            </h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="Enter recipient email address..."
                disabled
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0FA3A3] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Send className="w-3.5 h-3.5" />}
                disabled
                title="Live SMTP test-send isn't available yet in this deployment."
              >
                Send Test Email (Coming Soon)
              </Button>
            </div>
            <p className="text-[10px] text-slate-400">
              Live SMTP test-sending isn't wired up yet. Save your settings above, then verify delivery via a real
              password-reset or verification email instead.
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="teal"
              icon={<Save className="w-4 h-4" />}
              isLoading={submitting}
              onClick={() => handleSaveSection("smtp", smtpForm)}
            >
              Save SMTP Settings
            </Button>
          </div>
        </Card>
      )}

      {/* TAB 5: LEGAL */}
      {activeTab === "legal" && (
        <Card className="p-6 border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-[#0E2A47] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0FA3A3]" /> Legal Policies & Markdown Terms
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Edit terms of service, privacy policies, and candidate refund terms rendered across footer pages.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#0E2A47] mb-1 block">Privacy Policy Content (Markdown Supported)</label>
              <Textarea
                rows={6}
                value={legalForm.privacyPolicy}
                onChange={(e) => setLegalForm({ ...legalForm, privacyPolicy: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0E2A47] mb-1 block">Terms and Conditions Content (Markdown Supported)</label>
              <Textarea
                rows={6}
                value={legalForm.termsAndConditions}
                onChange={(e) => setLegalForm({ ...legalForm, termsAndConditions: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0E2A47] mb-1 block">Refund & Cancellation Policy Content (Markdown Supported)</label>
              <Textarea
                rows={6}
                value={legalForm.refundPolicy}
                onChange={(e) => setLegalForm({ ...legalForm, refundPolicy: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="teal"
              icon={<Save className="w-4 h-4" />}
              isLoading={submitting}
              onClick={() => handleSaveSection("legal", legalForm)}
            >
              Save Legal Policies
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
