import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, ChevronUp, HelpCircle, AlertTriangle } from "lucide-react";
import { Card, Input, Badge, Skeleton, EmptyState } from "../../components/ui";
import { publicApi } from "../../api/endpoints/public";
import { FAQ } from "../../types";

export const FaqsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [openFaqId, setOpenFaqId] = useState<number | null>(null);

  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFaqs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await publicApi.getFAQs();
      setFaqs(data);
      setOpenFaqId(data.length > 0 ? data[0].id : null);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load FAQs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFaqs();
  }, [loadFaqs]);

  // NOTE: the real `Faq` model (server/src/db/migrations/*-create-faqs.cjs)
  // has no `category` column — the AI-Studio-exported UI's category-pill
  // filter bar (Courses/Payments/Devices/QBank) filtered on a field the
  // backend simply doesn't have, so it's been dropped in favor of the
  // search-only filtering the real data actually supports. See DECISIONS.md
  // 2026-07-31 (Phase 3.2-3.4).
  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) return faqs;
    const q = searchQuery.toLowerCase().trim();
    return faqs.filter(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
    );
  }, [faqs, searchQuery]);

  const toggleFaq = (id: number) => {
    setOpenFaqId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-12 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Header Banner */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl text-center space-y-4 shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <Badge variant="teal">Help Center & FAQs</Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Frequently Asked Questions</h1>
        <p className="text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Find instant answers to questions regarding course enrollments, JazzCash & Raast payment activation, 2-device limits, and QBank practice modes.
        </p>

        {/* Search Bar */}
        <div className="max-w-xl mx-auto pt-2">
          <Input
            placeholder="Search FAQs by topic or keyword (e.g. Raast, 2-device, QBank)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-4 h-4 text-slate-400" />}
            className="bg-white text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && loadError && (
        <Card className="p-12 text-center border-rose-200 bg-rose-50/40">
          <EmptyState
            icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
            title="Couldn't Load FAQs"
            description={loadError}
            actionText="Try Again"
            onAction={loadFaqs}
          />
        </Card>
      )}

      {!isLoading && !loadError && (
        <>
          {/* Search Results Summary */}
          <div className="text-xs text-slate-500 flex items-center justify-between px-1">
            <span>Showing <strong>{filteredFaqs.length}</strong> of <strong>{faqs.length}</strong> questions</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-[#0FA3A3] font-semibold hover:underline cursor-pointer"
              >
                Reset Search
              </button>
            )}
          </div>

          {/* Accordion List */}
          <div className="space-y-4">
            {faqs.length === 0 ? (
              <Card className="p-12 text-center border-slate-200">
                <EmptyState
                  icon={<HelpCircle className="w-10 h-10 text-slate-400" />}
                  title="No FAQs Published Yet"
                  description="Check back soon — our help center is being populated."
                />
              </Card>
            ) : filteredFaqs.length === 0 ? (
              <Card className="p-12 text-center text-slate-500 border-slate-200">
                <p className="text-sm font-semibold">No questions matched your query.</p>
                <p className="text-xs mt-1 text-slate-400">Try searching for broader keywords.</p>
              </Card>
            ) : (
              filteredFaqs.map((faq) => {
                const isOpen = openFaqId === faq.id;
                return (
                  <Card key={faq.id} className="border-slate-200 overflow-hidden shadow-xs">
                    <button
                      onClick={() => toggleFaq(faq.id)}
                      className="w-full p-5 text-left bg-white hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span className="text-sm font-bold text-[#0E2A47] flex items-center gap-2.5">
                        <HelpCircle className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                        {faq.question}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 bg-slate-50/80 border-t border-slate-100 text-xs text-slate-600 leading-relaxed pl-11">
                        {faq.answer}
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};
