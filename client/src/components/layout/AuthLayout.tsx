import React from "react";
import { Link } from "react-router-dom";
import { Activity, ShieldCheck, FileQuestion, Award, ArrowLeft, CheckCircle2 } from "lucide-react";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col lg:flex-row text-[#1E293B]">
      {/* Left Brand Panel (Desktop 45% / Mobile top banner) */}
      <div className="lg:w-[45%] bg-[#0E2A47] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden shrink-0 border-r border-slate-800">
        {/* Background decorative glowing radial blur */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#0FA3A3]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Brand Logo Header */}
        <div className="relative z-10 space-y-8">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-2xl bg-[#0FA3A3] text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Activity className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-white block leading-none">
                SAMS <span className="text-[#0FA3A3]">ACADEMY</span>
              </span>
              <span className="text-[10px] font-medium text-slate-300 tracking-wider uppercase block mt-1">
                Medical Exam Preparation Platform
              </span>
            </div>
          </Link>

          {/* Hero Headline & Subtitle */}
          <div className="space-y-3 pt-4 hidden sm:block">
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white leading-tight">
              Pakistan's Flagship Medical Exam <span className="text-[#0FA3A3]">Prep Platform</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg font-normal">
              Trusted by 10,000+ doctors and medical candidates for NRE Step 1, USMLE Step 1/2CK, SMLE, DHA, & Prometric licensing exams.
            </p>
          </div>

          {/* Key Feature Bullets */}
          <div className="space-y-4 pt-2 hidden lg:block">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#0FA3A3]/20 text-[#0FA3A3] shrink-0 mt-0.5 border border-[#0FA3A3]/30">
                <FileQuestion className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">3,000+ Single-Best-Answer Vignettes</h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Strictly aligned with PMDC NRE & Gulf licensing blueprints with high-yield explanations.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#0FA3A3]/20 text-[#0FA3A3] shrink-0 mt-0.5 border border-[#0FA3A3]/30">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Encrypted HD Video & Dynamic Watermarking</h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  High-definition lectures protected by candidate-specific dynamic watermarking and DRM.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#0FA3A3]/20 text-[#0FA3A3] shrink-0 mt-0.5 border border-[#0FA3A3]/30">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">2-Device Security Policy</h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Authorized device fingerprinting ensures fair content access and candidate protection.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Testimonial Card Footer */}
        <div className="relative z-10 pt-8 border-t border-slate-750/80 hidden lg:block mt-8">
          <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60 space-y-2">
            <div className="flex items-center gap-1 text-amber-400">
              <CheckCircle2 className="w-4 h-4 text-[#0FA3A3]" />
              <span className="text-[11px] font-bold text-slate-200">Verified Candidate Review</span>
            </div>
            <p className="text-xs italic text-slate-300 leading-relaxed">
              "Scored 78% on my NRE Step 1 exam on the first attempt! The QBank explanations and organ-system analytics were identical to actual PMDC test patterns."
            </p>
            <p className="text-[11px] font-bold text-[#0FA3A3]">
              Dr. Hamza Shah <span className="text-slate-400 font-normal">&bull; KEMU Graduate (NRE 2025)</span>
            </p>
          </div>
        </div>
      </div>

      {/* Right Form Card Side */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-8 lg:p-12 relative">
        {/* Back to Home Button */}
        <div className="w-full max-w-md flex justify-between items-center mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#0E2A47] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to main site</span>
          </Link>

          <span className="text-xs text-slate-400 font-medium">SAMS Auth v2.4</span>
        </div>

        {/* Center Card Container */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-[#0E2A47] tracking-tight">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>

          {children}
        </div>

        {/* Footer Security Badges */}
        <div className="mt-8 text-center text-[11px] text-slate-400 space-y-1">
          <p>&copy; {new Date().getFullYear()} SAMS Academy. 256-Bit SSL Encrypted Connection.</p>
          <div className="flex justify-center gap-4 text-slate-500 pt-1">
            <Link to="/terms" className="hover:underline">Terms of Service</Link>
            <span>&bull;</span>
            <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
            <span>&bull;</span>
            <Link to="/contact" className="hover:underline">Help & Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
