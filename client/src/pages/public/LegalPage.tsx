import React, { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { ShieldCheck, FileText, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Card, Badge } from "../../components/ui";

export const LegalPage: React.FC = () => {
  const location = useLocation();
  const path = location.pathname.toLowerCase();

  // Determine active document type
  let docType: "terms" | "privacy" | "refund" = "terms";
  if (path.includes("privacy")) docType = "privacy";
  if (path.includes("refund")) docType = "refund";

  const [activeSection, setActiveSection] = useState<string>("section-1");

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-10 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Page Header */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl space-y-3 shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <Badge variant="teal">Official SAMS Academy Documents</Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          {docType === "terms" && "Terms & Conditions of Service"}
          {docType === "privacy" && "Privacy Policy & Data Security"}
          {docType === "refund" && "Refund & Course Cancellation Policy"}
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
          Last Updated: January 1, 2026. Applicable to all registered students and visitors across Pakistan and International regions.
        </p>

        {/* Tab Switcher */}
        <div className="pt-4 flex flex-wrap items-center gap-3">
          <Link
            to="/terms"
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              docType === "terms" ? "bg-[#0FA3A3] text-white shadow-md" : "bg-white/10 text-slate-300 hover:bg-white/20"
            }`}
          >
            Terms of Service
          </Link>
          <Link
            to="/privacy"
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              docType === "privacy" ? "bg-[#0FA3A3] text-white shadow-md" : "bg-white/10 text-slate-300 hover:bg-white/20"
            }`}
          >
            Privacy Policy
          </Link>
          <Link
            to="/refund"
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              docType === "refund" ? "bg-[#0FA3A3] text-white shadow-md" : "bg-white/10 text-slate-300 hover:bg-white/20"
            }`}
          >
            Refund Policy
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sticky Table of Contents Sidebar */}
        <div className="lg:col-span-1 hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <Card className="p-5 border-slate-200 space-y-3 bg-white shadow-xs">
              <h4 className="text-xs font-bold text-[#0E2A47] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#0FA3A3]" /> Document Outline
              </h4>
              <nav className="space-y-1 text-xs">
                {docType === "terms" && (
                  <>
                    <button
                      onClick={() => scrollToSection("section-1")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-1" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      1. Account Registration
                    </button>
                    <button
                      onClick={() => scrollToSection("section-2")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-2" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      2. 2-Device Policy Security
                    </button>
                    <button
                      onClick={() => scrollToSection("section-3")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-3" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      3. Intellectual Property DRM
                    </button>
                    <button
                      onClick={() => scrollToSection("section-4")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-4" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      4. Payments & Activation
                    </button>
                  </>
                )}

                {docType === "privacy" && (
                  <>
                    <button
                      onClick={() => scrollToSection("section-1")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-1" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      1. Information Collected
                    </button>
                    <button
                      onClick={() => scrollToSection("section-2")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-2" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      2. Usage of Personal Data
                    </button>
                    <button
                      onClick={() => scrollToSection("section-3")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-3" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      3. Device & Watermark Logs
                    </button>
                  </>
                )}

                {docType === "refund" && (
                  <>
                    <button
                      onClick={() => scrollToSection("section-1")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-1" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      1. Digital Product Policy
                    </button>
                    <button
                      onClick={() => scrollToSection("section-2")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-2" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      2. Refund Eligibility Criteria
                    </button>
                    <button
                      onClick={() => scrollToSection("section-3")}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        activeSection === "section-3" ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-bold" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      3. Duplicate Payment Resolution
                    </button>
                  </>
                )}
              </nav>
            </Card>
          </div>
        </div>

        {/* Content Body Area (3 cols) */}
        <div className="lg:col-span-3 space-y-8">
          {docType === "terms" && (
            <Card className="p-8 border-slate-200 space-y-8 text-xs text-slate-700 leading-relaxed bg-white">
              <section id="section-1" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  1. Account Registration & User Qualifications
                </h2>
                <p>
                  SAMS Academy provides medical licensing preparation courses and question banks intended strictly for medical students, medical graduates, and healthcare professionals. By creating an account, you represent that all information provided (full name, email, phone number) is accurate and truthful.
                </p>
                <p>
                  Each registered account is strictly non-transferable and intended for personal educational use only. Sharing credentials with third parties is a violation of our Service Terms.
                </p>
              </section>

              <section id="section-2" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  2. Strict 2-Device Policy & Anti-Sharing Controls
                </h2>
                <p>
                  To protect our medical faculty's copyrighted video content and QBank materials, SAMS Academy enforces a strict maximum limit of **2 registered primary devices** per student account.
                </p>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                  <span className="font-bold block">Important Security Notice:</span>
                  <p>
                    Attempting to log in or stream lectures on a 3rd device will result in account restriction (Error Code 423: DEVICE_LIMIT_REACHED). Device limit resets can only be performed by platform administrators upon verification.
                  </p>
                </div>
              </section>

              <section id="section-3" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  3. Intellectual Property & Dynamic DRM Watermarking
                </h2>
                <p>
                  All video lectures, clinical vignettes, explanations, and website assets are protected under international copyright law. Screen recording, unauthorized downloading, or distributing video content is illegal and prohibited.
                </p>
                <p>
                  Our video player automatically overlays a semi-transparent dynamic watermark featuring your registered name, email address, and real-time timestamp during playback.
                </p>
              </section>

              <section id="section-4" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  4. Payments, Activation & Validity Periods
                </h2>
                <p>
                  Course fees are charged in Pakistani Rupees (PKR) as listed. Payments completed via JazzCash or EasyPaisa trigger immediate automated activation. Payments completed via Raast or Manual Bank Transfer are activated upon review of the transaction proof (typically within 1–3 hours).
                </p>
              </section>
            </Card>
          )}

          {docType === "privacy" && (
            <Card className="p-8 border-slate-200 space-y-8 text-xs text-slate-700 leading-relaxed bg-white">
              <section id="section-1" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  1. Information We Collect
                </h2>
                <p>
                  We collect essential information required to deliver our educational services, including your name, email address, mobile phone number, login device IP addresses, browser user agent hints, and QBank test performance statistics.
                </p>
              </section>

              <section id="section-2" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  2. Usage of Personal Data
                </h2>
                <p>
                  Your personal data is used exclusively to grant course access, process payment invoices, deliver notification alerts, and render personalized learning analytics. SAMS Academy never sells or leases your personal information to third-party advertisers.
                </p>
              </section>

              <section id="section-3" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  3. Device Fingerprinting & Watermark Security
                </h2>
                <p>
                  To enforce the 2-device policy and prevent account sharing, we store an encrypted device token cookie on your browser. When watching video lectures, your name and email address are rendered dynamically on the player canvas.
                </p>
              </section>
            </Card>
          )}

          {docType === "refund" && (
            <Card className="p-8 border-slate-200 space-y-8 text-xs text-slate-700 leading-relaxed bg-white">
              <section id="section-1" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  1. Digital Product & Instant Access Policy
                </h2>
                <p>
                  Due to the digital nature of SAMS Academy online courses, downloadable question sets, and instant video lecture streaming access, all course purchases are generally non-refundable once content has been accessed.
                </p>
              </section>

              <section id="section-2" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  2. Refund Eligibility Exceptions
                </h2>
                <p>
                  Refund requests may be considered under the following limited conditions:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Technical failure on our platform preventing video playback that our technical team cannot resolve within 72 hours.</li>
                  <li>Inadvertent duplicate payments for the same course bundle.</li>
                  <li>Refund request submitted within 24 hours of purchase provided less than 5% of video content has been viewed.</li>
                </ul>
              </section>

              <section id="section-3" className="space-y-3">
                <h2 className="text-lg font-bold text-[#0E2A47] border-b border-slate-100 pb-2">
                  3. Resolution of Duplicate Payments
                </h2>
                <p>
                  If you accidentally pay twice for the same course via JazzCash, EasyPaisa, or Raast, please contact support@samsacademy.com with both transaction reference numbers. The duplicate payment will be refunded to your source account within 3–5 business days.
                </p>
              </section>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
