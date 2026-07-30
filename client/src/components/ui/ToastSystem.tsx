import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { cn } from "../../utils/formatters";

export type ToastType = "success" | "danger" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  durationMs?: number;
}

interface ToastContextType {
  toast: (message: Omit<ToastMessage, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type, title, description, durationMs = 4000 }: Omit<ToastMessage, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastMessage = { id, type, title, description, durationMs };
      setToasts((prev) => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const success = useCallback((title: string, description?: string) => toast({ type: "success", title, description }), [toast]);
  const error = useCallback((title: string, description?: string) => toast({ type: "danger", title, description }), [toast]);
  const warning = useCallback((title: string, description?: string) => toast({ type: "warning", title, description }), [toast]);
  const info = useCallback((title: string, description?: string) => toast({ type: "info", title, description }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none p-4 sm:p-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-xl border bg-white transition-all animate-in slide-in-from-bottom-5 duration-200",
              t.type === "success" && "border-[#16A34A]/30 bg-emerald-50/50 text-[#16A34A]",
              t.type === "danger" && "border-[#DC2626]/30 bg-red-50/50 text-[#DC2626]",
              t.type === "warning" && "border-[#D97706]/30 bg-amber-50/50 text-[#D97706]",
              t.type === "info" && "border-[#0FA3A3]/30 bg-teal-50/50 text-[#0FA3A3]"
            )}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === "success" && <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />}
              {t.type === "danger" && <AlertCircle className="w-5 h-5 text-[#DC2626]" />}
              {t.type === "warning" && <AlertTriangle className="w-5 h-5 text-[#D97706]" />}
              {t.type === "info" && <Info className="w-5 h-5 text-[#0FA3A3]" />}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-[#1E293B] leading-tight">{t.title}</h4>
              {t.description && <p className="text-xs text-[#64748B] mt-0.5">{t.description}</p>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Standalone Toast Banner Component for inline alerts
export const Toast: React.FC<{
  message: string;
  onClose: () => void;
  type?: ToastType;
}> = ({ message, onClose, type = "success" }) => {
  return (
    <div
      className={cn(
        "p-4 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-xs mb-4",
        type === "success" && "bg-emerald-50 text-emerald-800 border-emerald-200",
        type === "danger" && "bg-red-50 text-red-800 border-red-200",
        type === "warning" && "bg-amber-50 text-amber-800 border-amber-200",
        type === "info" && "bg-teal-50 text-teal-800 border-teal-200"
      )}
    >
      <span>{message}</span>
      <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastSystem: React.FC<{
  toasts: ToastMessage[];
  onClose?: (id: string) => void;
}> = ({ toasts, onClose }) => {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "p-4 rounded-xl border flex items-center justify-between text-xs font-semibold",
            t.type === "success" && "bg-emerald-50 text-emerald-800 border-emerald-200",
            t.type === "danger" && "bg-red-50 text-red-800 border-red-200",
            t.type === "warning" && "bg-amber-50 text-amber-800 border-amber-200",
            t.type === "info" && "bg-teal-50 text-teal-800 border-teal-200"
          )}
        >
          <span>{t.title}</span>
          {onClose && (
            <button onClick={() => onClose(t.id)} className="text-slate-500 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
