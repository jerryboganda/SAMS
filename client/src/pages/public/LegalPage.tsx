import React, { useCallback, useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { FileText, AlertTriangle } from "lucide-react";
import { Card, Badge, Skeleton, EmptyState } from "../../components/ui";
import { publicApi, PageContent } from "../../api/endpoints/public";
import { legalPathToPageKey } from "./legalPageUtils";

export const LegalPage: React.FC = () => {
  const location = useLocation();
  const pageKey = legalPathToPageKey(location.pathname);

  const [page, setPage] = useState<PageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await publicApi.getPage(pageKey);
      setPage(data);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load this document. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [pageKey]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const docType: "terms" | "privacy" | "refund" =
    pageKey === "legal.privacy" ? "privacy" : pageKey === "legal.refund" ? "refund" : "terms";

  return (
    <div className="space-y-10 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
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
          Applicable to all registered students and visitors across Pakistan and International regions.
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

      {/* Document Body — sourced from the admin-editable Settings row for
          this key (GET /public/pages/:key). The AI-Studio export's original
          multi-section layout + scroll-spy table of contents assumed
          hand-authored HTML sections that the real content model (a single
          plain-text field per document) doesn't provide, so it's been
          replaced by a single content card; see DECISIONS.md 2026-07-31
          (Phase 3.2-3.4). */}
      {isLoading && (
        <Card className="p-8 border-slate-200 space-y-4 bg-white">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      )}

      {!isLoading && loadError && (
        <Card className="p-12 text-center border-rose-200 bg-rose-50/40">
          <EmptyState
            icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
            title="Couldn't Load This Document"
            description={loadError}
            actionText="Try Again"
            onAction={loadPage}
          />
        </Card>
      )}

      {!isLoading && !loadError && page && !page.content && (
        <Card className="p-12 text-center border-slate-200">
          <EmptyState
            icon={<FileText className="w-10 h-10 text-slate-400" />}
            title="Document Not Yet Published"
            description="This document is still being prepared. Please check back soon."
          />
        </Card>
      )}

      {!isLoading && !loadError && page && page.content && (
        <Card className="p-8 border-slate-200 space-y-4 text-sm text-slate-700 leading-relaxed bg-white">
          <div className="flex items-center gap-2 text-[#0E2A47] font-bold text-base border-b border-slate-100 pb-3">
            <FileText className="w-5 h-5 text-[#0FA3A3]" />
            {page.title}
          </div>
          <p className="whitespace-pre-line">{page.content}</p>
        </Card>
      )}
    </div>
  );
};
