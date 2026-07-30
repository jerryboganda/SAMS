import React, { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Activity, Menu, X, ArrowRight, Phone, Mail, MapPin, ShieldCheck, Award } from "lucide-react";
import { Button, Drawer } from "../ui";
import { useAuth } from "../../stores/authStore";

export const PublicLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const navLinks = [
    { label: "Home", path: "/" },
    { label: "Courses", path: "/courses" },
    { label: "QBank", path: "/qbank" },
    { label: "Faculty", path: "/faculty" },
    { label: "About", path: "/about" },
    { label: "FAQs", path: "/faqs" },
    { label: "Contact", path: "/contact" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-[#1E293B]">
      {/* Top Banner Notice */}
      <div className="bg-[#0E2A47] text-white text-xs py-2 px-4 text-center flex items-center justify-center gap-2">
        <span className="bg-[#0FA3A3] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
          2026 Registration
        </span>
        <span>Admissions Open for NRE Step 1 & Gulf Medical Licensing Batch</span>
        <Link to="/courses" className="underline font-semibold hover:text-[#0FA3A3] hidden sm:inline">
          Explore Courses &rarr;
        </Link>
      </div>

      {/* Sticky Header Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-[#0E2A47] text-[#0FA3A3] flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
              <Activity className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-lg font-extrabold text-[#0E2A47] tracking-tight block leading-none">
                SAMS <span className="text-[#0FA3A3]">ACADEMY</span>
              </span>
              <span className="text-[10px] font-medium text-[#64748B] tracking-wider uppercase block mt-0.5">
                Medical Exam Prep
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors hover:text-[#0FA3A3] ${
                  isActive(link.path) ? "text-[#0FA3A3] font-semibold" : "text-[#1E293B]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated && user ? (
              <Button
                variant="teal"
                onClick={() => navigate(user.role === "admin" ? "/admin" : "/app")}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                {user.role === "admin" ? "Admin Portal" : "Student Portal"}
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/login")}>
                  Log In
                </Button>
                <Button variant="teal" onClick={() => navigate("/register")}>
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 focus:outline-none"
            aria-label="Toggle Navigation"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      <Drawer isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} title="SAMS Academy Navigation">
        <div className="flex flex-col gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`py-2 px-3 rounded-lg text-base font-medium transition-colors ${
                isActive(link.path) ? "bg-[#0FA3A3]/10 text-[#0FA3A3] font-semibold" : "text-[#1E293B] hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 border-t border-slate-200 flex flex-col gap-2.5">
            {isAuthenticated && user ? (
              <Button
                variant="teal"
                className="w-full"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  navigate(user.role === "admin" ? "/admin" : "/app");
                }}
              >
                Go to Portal
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate("/login");
                  }}
                >
                  Log In
                </Button>
                <Button
                  variant="teal"
                  className="w-full"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate("/register");
                  }}
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </Drawer>

      {/* Main Page Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Rich Footer */}
      <footer className="bg-[#0E2A47] text-white pt-12 pb-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 pb-10 border-b border-slate-750">
            {/* Col 1: Brand Info */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0FA3A3] text-white flex items-center justify-center">
                  <Activity className="w-5 h-5 stroke-[2.5]" />
                </div>
                <span className="text-xl font-extrabold tracking-tight text-white">
                  SAMS <span className="text-[#0FA3A3]">ACADEMY</span>
                </span>
              </div>
              <p className="text-sm text-slate-300 max-w-sm leading-relaxed">
                Pakistan's premier medical licensing exam platform preparing doctors and medical students for NRE Step 1, USMLE, SMLE, DHA, and MBBS board exams.
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#0FA3A3]" /> 100% Secure DRM</span>
                <span className="flex items-center gap-1.5"><Award className="w-4 h-4 text-[#0FA3A3]" /> PMDC & Gulf Aligned</span>
              </div>
            </div>

            {/* Col 2: Exam Programs */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-[#0FA3A3] uppercase tracking-wider">Exam Programs</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li><Link to="/courses?cat=NRE1" className="hover:text-white transition-colors">NRE Step 1 Course</Link></li>
                <li><Link to="/courses?cat=SMLE" className="hover:text-white transition-colors">SMLE Crash Course</Link></li>
                <li><Link to="/courses?cat=USMLE1" className="hover:text-white transition-colors">USMLE Step 1</Link></li>
                <li><Link to="/courses?cat=DHA" className="hover:text-white transition-colors">DHA & Prometric</Link></li>
                <li><Link to="/courses?cat=MBBS" className="hover:text-white transition-colors">MBBS Basic Sciences</Link></li>
              </ul>
            </div>

            {/* Col 3: Quick Links */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-[#0FA3A3] uppercase tracking-wider">Quick Links</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li><Link to="/qbank" className="hover:text-white transition-colors">Interactive QBank</Link></li>
                <li><Link to="/faculty" className="hover:text-white transition-colors">Expert Faculty</Link></li>
                <li><Link to="/faqs" className="hover:text-white transition-colors">Frequently Asked FAQs</Link></li>
                <li><Link to="/contact" className="hover:text-white transition-colors">Support & Contact</Link></li>
                <li><Link to="/ui-demo" className="hover:text-white transition-colors">UI Kit Showcase</Link></li>
              </ul>
            </div>

            {/* Col 4: Contact info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-[#0FA3A3] uppercase tracking-wider">Contact & Support</h4>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                  <span>+92 300 1234567</span>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                  <span>support@samsacademy.com</span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#0FA3A3] shrink-0 mt-0.5" />
                  <span>SAMS Tower, Main Boulevard, Gulberg III, Lahore, Pakistan</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Legal Bar */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
            <p>&copy; {new Date().getFullYear()} SAMS Academy. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link to="/about" className="hover:text-slate-200">About Us</Link>
              <Link to="/privacy" className="hover:text-slate-200">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-slate-200">Terms of Service</Link>
              <Link to="/refund" className="hover:text-slate-200">Refund Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
