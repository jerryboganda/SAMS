import React, { useState, useEffect } from "react";
import { Terminal, Shield, User, WifiOff, Tv, RefreshCw, X, Check, ChevronUp } from "lucide-react";
import { CONFIG } from "../../config";
import { useAuth } from "../../stores/authStore";
import { useNavigate } from "react-router-dom";
import { Toast } from "../ui/ToastSystem";

export const DevPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const { user, login, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const isSlow = localStorage.getItem("sams_dev_slow_network") === "true";
    setIsSlowNetwork(isSlow);
  }, []);

  if (!CONFIG.USE_MOCK) return null;

  const toggleSlowNetwork = () => {
    const nextState = !isSlowNetwork;
    setIsSlowNetwork(nextState);
    localStorage.setItem("sams_dev_slow_network", String(nextState));
    setToastMsg(nextState ? "Slow network mode enabled (+2000ms delay)" : "Normal network latency restored");
  };

  const handleSimulateStreamTakeover = () => {
    window.dispatchEvent(new CustomEvent("sams_dev_stream_takeover"));
    setToastMsg("Simulated stream takeover event dispatched to Video Player!");
  };

  const handleResetMockData = () => {
    if (!window.confirm("Reset mock state and reload page with fresh seed data?")) return;
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  const handleSwitchRole = async (role: "student" | "admin" | "visitor") => {
    if (role === "visitor") {
      await logout();
      navigate("/");
      setToastMsg("Switched role to Visitor (Logged out)");
    } else if (role === "student") {
      try {
        await login("student@samsacademy.com", "Student@123");
        navigate("/app");
        setToastMsg("Switched role to Student (student@samsacademy.com)");
      } catch (err) {
        console.error(err);
      }
    } else if (role === "admin") {
      try {
        await login("admin@samsacademy.com", "Admin@12345");
        navigate("/admin");
        setToastMsg("Switched role to Admin (admin@samsacademy.com)");
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

      {/* Floating Toggle Button */}
      <div className="fixed bottom-4 right-4 z-[9999] print:hidden">
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            className="bg-[#0E2A47] hover:bg-[#0A1E33] text-[#0FA3A3] p-3 rounded-full shadow-2xl border-2 border-[#0FA3A3] flex items-center gap-2 group transition-all transform hover:scale-105"
            title="Open SAMS Academy DEV Control Panel"
          >
            <Terminal className="w-5 h-5 animate-pulse" />
            <span className="text-xs font-bold text-white pr-1 hidden sm:inline">DEV PANEL</span>
          </button>
        ) : (
          <div className="bg-[#0E2A47] text-white rounded-2xl shadow-2xl border-2 border-[#0FA3A3] w-80 p-5 space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#0FA3A3]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                  DEV Simulation Tools
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Active Role */}
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 text-xs flex items-center justify-between">
              <span className="text-slate-400 font-medium">Current User:</span>
              <span className="font-extrabold text-[#0FA3A3]">
                {user ? `${user.name} (${user.role.toUpperCase()})` : "Visitor (Guest)"}
              </span>
            </div>

            {/* Switch Role Buttons */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Switch Role / Context
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => handleSwitchRole("student")}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                    user?.role === "student"
                      ? "bg-[#0FA3A3] border-[#0FA3A3] text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Student
                </button>
                <button
                  onClick={() => handleSwitchRole("admin")}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                    user?.role === "admin"
                      ? "bg-[#0FA3A3] border-[#0FA3A3] text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Admin
                </button>
                <button
                  onClick={() => handleSwitchRole("visitor")}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                    !user
                      ? "bg-[#0FA3A3] border-[#0FA3A3] text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Visitor
                </button>
              </div>
            </div>

            {/* Simulation Switches */}
            <div className="space-y-2 pt-1 border-t border-slate-700">
              <div className="flex items-center justify-between bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold">Simulate Slow Network</span>
                </div>
                <input
                  type="checkbox"
                  checked={isSlowNetwork}
                  onChange={toggleSlowNetwork}
                  className="w-4 h-4 text-[#0FA3A3] rounded border-slate-600 focus:ring-[#0FA3A3] cursor-pointer"
                />
              </div>

              <button
                onClick={handleSimulateStreamTakeover}
                className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 p-2.5 rounded-xl border border-slate-700 text-xs font-bold text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Tv className="w-4 h-4 text-red-400" />
                  <span>Simulate Stream Takeover</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Trigger</span>
              </button>

              <button
                onClick={handleResetMockData}
                className="w-full flex items-center justify-between bg-red-950/40 hover:bg-red-900/60 p-2.5 rounded-xl border border-red-800/60 text-xs font-bold text-red-300 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-red-400" />
                  <span>Reset Mock Storage Data</span>
                </div>
                <span className="text-[10px] text-red-400 font-mono">Reset</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
