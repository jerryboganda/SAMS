import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "../ui";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F5F7FA] text-[#1E293B] flex flex-col items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto text-[#DC2626]">
              <AlertTriangle className="w-8 h-8 stroke-[2]" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-extrabold text-[#0E2A47]">Unexpected Application Error</h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                An unexpected interface error occurred. SAMS Academy system state and candidate records remain safe.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                  Error Diagnostic
                </div>
                <div className="text-xs font-mono text-red-600 line-clamp-3 break-all">
                  {this.state.error.toString()}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="teal"
                fullWidth
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
              <Button
                variant="outline"
                fullWidth
                icon={<Home className="w-4 h-4 text-[#0FA3A3]" />}
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Return Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
