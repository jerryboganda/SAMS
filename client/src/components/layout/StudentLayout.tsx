import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  FileQuestion,
  Award,
  BarChart3,
  Bookmark,
  ShoppingBag,
  Bell,
  User as UserIcon,
  LogOut,
  Search,
  Menu,
  X,
  Activity,
  ChevronDown,
  HelpCircle,
  Sparkles,
  Compass,
} from "lucide-react";
import { useAuth } from "../../stores/authStore";
import { Badge, Drawer } from "../ui";
import { studentApi } from "../../api/endpoints/student";
import { StudentGlobalSearch } from "../student/StudentGlobalSearch";
import { StudentGuidedTour } from "../student/StudentGuidedTour";

export const StudentLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  // Real unread count from GET /student/dashboard's `unreadNotificationsCount`
  // — there's no real `GET /notifications` list endpoint yet (only the
  // dashboard aggregate ships it), so this is the badge count only; the
  // popover below shows a count-based summary instead of fabricated
  // per-notification content. See DECISIONS.md's Phase 6.2-6.3 entry.
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await studentApi.getDashboardStats();
        if (!cancelled) setUnreadCount(stats.unreadNotificationsCount);
      } catch (err) {
        // Non-fatal — the badge just stays at 0 until the next successful load.
        console.error("Failed to load unread notification count", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sidebarNavItems = [
    { label: "Dashboard", path: "/app", icon: LayoutDashboard },
    { label: "My Courses", path: "/app/courses", icon: BookOpen },
    { label: "QBank Hub", path: "/app/qbank", icon: FileQuestion },
    { label: "Mock Exams", path: "/app/mock-exams", icon: Award },
    { label: "Analytics", path: "/app/analytics", icon: BarChart3 },
    { label: "Bookmarks", path: "/app/bookmarks", icon: Bookmark },
    { label: "My Orders", path: "/app/orders", icon: ShoppingBag },
    { label: "Notifications", path: "/app/notifications", icon: Bell, badge: unreadCount },
    { label: "My Profile", path: "/app/profile", icon: UserIcon },
  ];

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col md:flex-row text-[#1E293B]">
      {/* Desktop Left Sidebar */}
      <aside id="tour-sidebar-nav" className="hidden md:flex w-64 bg-[#0E2A47] text-white flex-col shrink-0 border-r border-slate-800">
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-750">
          <div className="w-9 h-9 rounded-xl bg-[#0FA3A3] text-white flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-base font-extrabold tracking-tight text-white block leading-none">
              SAMS <span className="text-[#0FA3A3]">ACADEMY</span>
            </span>
            <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase block mt-0.5">
              Student Portal
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          {sidebarNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const itemId = item.path === "/app/qbank" ? "tour-qbank-link" : undefined;
            return (
              <Link
                key={item.path}
                id={itemId}
                to={item.path}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-[#0FA3A3] text-white font-semibold shadow-xs"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? "text-white" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <Badge variant={active ? "navy" : "teal"} size="sm">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Student Profile Footer Card */}
        <div className="p-4 border-t border-slate-750 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#0FA3A3] text-white flex items-center justify-center font-bold text-sm shrink-0">
              {user?.name ? user.name.charAt(0) : "S"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name || "Student"}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Navigation */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          {/* Mobile hamburger + Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 focus:outline-none"
            >
              <Menu className="w-6 h-6" />
            </button>
            <StudentGlobalSearch />
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Guided Tour Trigger Button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("start-student-guided-tour"))}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0FA3A3] text-xs font-bold border border-teal-200/80 transition-all hover:shadow-2xs"
              title="Start Guided Portal Tour"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Take Tour</span>
            </button>

            {/* Notification Bell Dropdown */}
            <div id="tour-notifications" className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative p-2 text-slate-600 hover:text-[#0E2A47] hover:bg-slate-100 rounded-full transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#DC2626] ring-2 ring-white" />
                )}
              </button>

              {/* Notification Popover */}
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h4 className="text-sm font-bold text-[#0E2A47]">Notifications</h4>
                    <Link
                      to="/app/notifications"
                      onClick={() => setIsNotificationsOpen(false)}
                      className="text-xs text-[#0FA3A3] hover:underline font-semibold"
                    >
                      View All
                    </Link>
                  </div>
                  <div className="py-4 text-xs text-center">
                    {unreadCount > 0 ? (
                      <p className="text-[#1E293B]">
                        You have <span className="font-bold text-[#0E2A47]">{unreadCount}</span> unread notification
                        {unreadCount === 1 ? "" : "s"}.
                      </p>
                    ) : (
                      <p className="text-[#64748B]">You're all caught up — no new notifications.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div id="tour-profile-menu" className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none"
              >
                <div className="w-8 h-8 rounded-full bg-[#0E2A47] text-white font-bold flex items-center justify-center text-xs">
                  {user?.name ? user.name.charAt(0) : "S"}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-[#1E293B] leading-none">{user?.name || "Dr. Student"}</p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">NRE Candidate</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
                  <Link
                    to="/app/profile"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-[#1E293B] hover:bg-slate-50"
                  >
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    <span>My Profile & Devices</span>
                  </Link>
                  <Link
                    to="/app/orders"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-[#1E293B] hover:bg-slate-50"
                  >
                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                    <span>My Orders & Invoices</span>
                  </Link>
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      window.dispatchEvent(new CustomEvent("start-student-guided-tour"));
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[#0FA3A3] font-semibold hover:bg-teal-50 text-left"
                  >
                    <Compass className="w-4 h-4" />
                    <span>Restart Guided Tour</span>
                  </button>
                  <div className="border-t border-slate-100 my-1"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[#DC2626] hover:bg-red-50 text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        <Drawer
          isOpen={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          title="Student Portal Navigation"
          position="left"
        >
          <nav className="space-y-1.5">
            {sidebarNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                    active ? "bg-[#0FA3A3] text-white font-semibold" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <Badge variant={active ? "navy" : "teal"} size="sm">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>
        </Drawer>

        {/* Main Body Content View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* First-time Student Guided Tour Component */}
        <StudentGuidedTour />
      </div>
    </div>
  );
};
