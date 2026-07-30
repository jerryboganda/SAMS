import React, { useState, useRef, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileQuestion,
  Award,
  ShoppingBag,
  Ticket,
  Bell,
  BarChart3,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  Activity,
  ArrowLeft,
  CreditCard,
  HelpCircle,
  MessageSquare,
  History,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "../../stores/authStore";
import { Badge, Drawer } from "../ui";
import { AdminSearchProvider, useAdminSearch } from "../../context/AdminSearchContext";

const AdminHeaderSearch: React.FC = () => {
  const { globalSearch, setGlobalSearch, clearGlobalSearch } = useAdminSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex-1 max-w-md mx-2 sm:mx-6 relative">
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={globalSearch}
        onChange={(e) => setGlobalSearch(e.target.value)}
        placeholder="Global Search (Name, ID, Email, Ref...)..."
        className="w-full bg-slate-100 hover:bg-slate-50 focus:bg-white text-xs text-[#1E293B] pl-9 pr-14 py-2 rounded-xl border border-slate-200 focus:border-[#0FA3A3] focus:ring-2 focus:ring-[#0FA3A3]/20 transition-all focus:outline-none placeholder:text-slate-400"
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {globalSearch ? (
          <button
            onClick={clearGlobalSearch}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs">
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
};

export const AdminLayoutContent: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const adminNavItems = [
    { label: "Overview", path: "/admin", icon: LayoutDashboard },
    { label: "Students", path: "/admin/students", icon: Users },
    { label: "Manual Payments", path: "/admin/manual-payments", icon: CreditCard },
    { label: "Orders & Revenue", path: "/admin/orders", icon: ShoppingBag },
    { label: "Coupons & Discounts", path: "/admin/coupons", icon: Ticket },
    { label: "Course Management", path: "/admin/courses", icon: BookOpen },
    { label: "QBank Questions", path: "/admin/qbank", icon: FileQuestion },
    { label: "Mock Exam Manager", path: "/admin/mock-exams", icon: Award },
    { label: "Announcements", path: "/admin/announcements", icon: Bell },
    { label: "Faculty Roster", path: "/admin/faculty", icon: ShieldCheck },
    { label: "FAQs Manager", path: "/admin/faqs", icon: HelpCircle },
    { label: "Contact Inbox", path: "/admin/messages", icon: MessageSquare },
    { label: "Analytics & Reports", path: "/admin/analytics", icon: BarChart3 },
    { label: "System Audit Log", path: "/admin/audit-log", icon: History },
    { label: "System Settings", path: "/admin/settings", icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col md:flex-row text-[#1E293B]">
      {/* Desktop Admin Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#0E2A47] text-white flex-col shrink-0 border-r border-slate-800">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-750">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-bold">
            <Activity className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-base font-extrabold tracking-tight text-white block leading-none">
              SAMS <span className="text-amber-400">ADMIN</span>
            </span>
            <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase block mt-0.5">
              Management Portal
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? "text-slate-950" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Switch to Student Portal / Logout Footer */}
        <div className="p-4 border-t border-slate-750 bg-slate-900/80 space-y-2">
          <Link
            to="/app"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#0FA3A3]" />
            <span>Switch to Student View</span>
          </Link>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-xs">
                A
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white leading-none">{user?.name || "Administrator"}</p>
                <Badge variant="warning" size="sm" className="mt-1 text-[9px] px-1.5 py-0">
                  SUPER ADMIN
                </Badge>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Body */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-base font-bold text-[#0E2A47] hidden lg:block">SAMS Admin Dashboard</h1>
          </div>

          {/* Real-Time Global Search Bar */}
          <AdminHeaderSearch />

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/app"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0FA3A3] bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> View App
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </header>

        <Drawer
          isOpen={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          title="Admin Portal Navigation"
          position="left"
        >
          <nav className="space-y-1.5">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                    active ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </Drawer>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export const AdminLayout: React.FC = () => {
  return (
    <AdminSearchProvider>
      <AdminLayoutContent />
    </AdminSearchProvider>
  );
};

