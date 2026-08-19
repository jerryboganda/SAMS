import React, { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  Eye,
  EyeOff,
  User,
  Mail,
  Key,
  BookOpen,
  Calendar,
  Sparkles,
  Share2,
} from "lucide-react";
import { Modal, Button, Badge } from "../ui";
import { formatDate } from "../../utils/formatters";

export interface PostCreateCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    name: string;
    email: string;
    password: string;
    enrollments: { courseTitle: string; expiresAt: string }[];
  } | null;
}

export const PostCreateCredentialsModal: React.FC<PostCreateCredentialsModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  if (!data) return null;

  const copyToClipboard = async (text: string, identifier: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedItem(identifier);
      setTimeout(() => {
        setCopiedItem(null);
      }, 2500);
    } catch (err) {
      console.error("Failed to copy to clipboard", err);
    }
  };

  const generateWhatsAppMessage = (): string => {
    const coursesList =
      data.enrollments && data.enrollments.length > 0
        ? data.enrollments
            .map((e) => `• ${e.courseTitle} (Expires: ${formatDate(e.expiresAt)})`)
            .join("\n")
        : "• Access allocated by administrator";

    return `🎓 *Welcome to SAMS Academy!*
Your student account has been created:

👤 *Name:* ${data.name}
📧 *Email:* ${data.email}
🔑 *Password:* ${data.password}
🔗 *Login Portal:* https://samsacademy.com/login

📚 *Enrolled Courses:*
${coursesList}

Please log in and begin your studies!`;
  };

  const handleCopyWhatsApp = () => {
    const message = generateWhatsAppMessage();
    copyToClipboard(message, "whatsapp");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      footer={
        <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <Button
            type="button"
            variant={copiedItem === "whatsapp" ? "secondary" : "teal"}
            onClick={handleCopyWhatsApp}
            leftIcon={
              copiedItem === "whatsapp" ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )
            }
            className="flex-1"
          >
            {copiedItem === "whatsapp"
              ? "Copied Full Message to Clipboard! ✓"
              : "Copy Credentials for WhatsApp / SMS"}
          </Button>
          <Button type="button" variant="primary" onClick={onClose} className="sm:w-28">
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-6 py-1">
        {/* Header Banner */}
        <div className="text-center space-y-2 pb-2 border-b border-slate-100">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-[#0E2A47]">
            Student Account Created Successfully!
          </h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto">
            Please share the following credentials with the student candidate immediately.
          </p>
        </div>

        {/* Credentials Grid */}
        <div className="space-y-3 rounded-2xl bg-slate-50 border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#0E2A47]">
              Account Credentials
            </h4>
            <span className="text-[11px] text-[#64748B]">Click copy icon to copy fields</span>
          </div>

          <div className="space-y-2.5">
            {/* Name */}
            <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-semibold text-[#64748B] block">
                    Full Name
                  </span>
                  <span className="text-sm font-semibold text-[#0E2A47] truncate block">
                    {data.name}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(data.name, "name")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#0FA3A3] hover:bg-slate-100 transition-colors"
                title="Copy Name"
              >
                {copiedItem === "name" ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-teal-50 text-[#0FA3A3]">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-semibold text-[#64748B] block">
                    Email Address / Login
                  </span>
                  <span className="text-sm font-semibold text-[#0E2A47] truncate block">
                    {data.email}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(data.email, "email")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#0FA3A3] hover:bg-slate-100 transition-colors"
                title="Copy Email"
              >
                {copiedItem === "email" ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Password */}
            <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <Key className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-semibold text-[#64748B] block">
                    Generated Password
                  </span>
                  <span className="text-sm font-mono font-semibold text-[#0E2A47] block">
                    {showPassword ? data.password : "••••••••••••"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(data.password, "password")}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0FA3A3] hover:bg-slate-100 transition-colors"
                  title="Copy Password"
                >
                  {copiedItem === "password" ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Enrolled Courses Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0FA3A3]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0E2A47]">
                Enrolled Courses & Expirations
              </h4>
            </div>
            <span className="text-xs text-[#64748B]">
              {data.enrollments?.length || 0} package(s)
            </span>
          </div>

          {data.enrollments && data.enrollments.length > 0 ? (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {data.enrollments.map((enr, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#0E2A47]">{enr.courseTitle}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#0FA3A3] font-medium">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Expires: {formatDate(enr.expiresAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-[#64748B]">
              No courses were allocated during account creation.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
