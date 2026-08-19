import React, { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Zap,
  Sparkles,
  Layers,
  TrendingUp,
  Search,
  LayoutGrid,
  List,
  Edit2,
  Trash2,
  Power,
  Clock,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  RefreshCw,
  Package,
} from "lucide-react";
import {
  StatCard,
  Button,
  Input,
  Badge,
  Table,
  ConfirmDialog,
  ToastSystem,
  EmptyState,
  Skeleton,
} from "../../components/ui";
import { PackageCard } from "../../components/admin/PackageCard";
import { PackageModal } from "../../components/admin/PackageModal";
import { adminApi } from "../../api/endpoints/admin";
import { Course, SubscriptionPackage } from "../../types";
import { formatPKR, cn } from "../../utils/formatters";
import { useAdminSearch } from "../../context/AdminSearchContext";

const CATEGORY_CHIPS = [
  { label: "All", value: "ALL" },
  { label: "NRE 1", value: "NRE1" },
  { label: "NRE 2", value: "NRE2" },
  { label: "USMLE", value: "USMLE" },
  { label: "SMLE", value: "SMLE" },
  { label: "All-Access Bundles", value: "BUNDLE" },
] as const;

export const SubscriptionsManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();

  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [packageToEdit, setPackageToEdit] = useState<SubscriptionPackage | null>(null);

  // Delete State
  const [packageToDelete, setPackageToDelete] = useState<SubscriptionPackage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast feedback state
  const [toasts, setToasts] = useState<{ id: string; type: "success" | "danger" | "warning" | "info"; title: string }[]>([]);

  const showToast = (title: string, type: "success" | "danger" | "warning" | "info" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [packagesData, coursesData] = await Promise.all([
        adminApi.getPackages(),
        adminApi.getCourses().catch(() => []),
      ]);
      setPackages(Array.isArray(packagesData) ? packagesData : []);
      setCourses(Array.isArray(coursesData) ? coursesData : []);
    } catch (err: any) {
      console.error("Failed to load subscription packages or courses:", err);
      setError(err.message || "Failed to load subscription packages. Please check server connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handler: Create package
  const handleOpenCreateModal = () => {
    setPackageToEdit(null);
    setIsModalOpen(true);
  };

  // Handler: Edit package
  const handleOpenEditModal = (pkg: SubscriptionPackage) => {
    setPackageToEdit(pkg);
    setIsModalOpen(true);
  };

  // Handler: Package saved callback from PackageModal
  const handlePackageSaved = (savedPkg: SubscriptionPackage) => {
    setPackages((prev) => {
      const exists = prev.some((p) => p.id === savedPkg.id);
      if (exists) {
        return prev.map((p) => (p.id === savedPkg.id ? savedPkg : p));
      }
      return [savedPkg, ...prev];
    });
    showToast(
      packageToEdit
        ? `Package "${savedPkg.title}" updated successfully.`
        : `New package "${savedPkg.title}" created successfully.`
    );
  };

  // Handler: Toggle active/draft status
  const handleToggleActive = async (id: number) => {
    try {
      const updated = await adminApi.togglePackageActive(id);
      setPackages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast(
        `Package "${updated.title}" is now ${updated.isActive ? "ACTIVE & Published" : "DRAFT"}.`,
        updated.isActive ? "success" : "info"
      );
    } catch (err: any) {
      console.error("Toggle active failed:", err);
      showToast(err.message || "Failed to toggle package status.", "danger");
    }
  };

  // Handler: Confirm delete package
  const handleConfirmDelete = async () => {
    if (!packageToDelete) return;
    setIsDeleting(true);
    try {
      await adminApi.deletePackage(packageToDelete.id);
      setPackages((prev) => prev.filter((p) => p.id !== packageToDelete.id));
      showToast(`Package "${packageToDelete.title}" deleted successfully.`);
      setPackageToDelete(null);
    } catch (err: any) {
      console.error("Delete package failed:", err);
      showToast(err.message || "Failed to delete package.", "danger");
    } finally {
      setIsDeleting(false);
    }
  };

  // KPI Computations
  const kpis = useMemo(() => {
    const total = packages.length;
    const active = packages.filter((p) => p.isActive).length;
    const activePkgs = packages.filter((p) => p.isActive);
    const avgPrice =
      activePkgs.length > 0
        ? Math.round(activePkgs.reduce((sum, p) => sum + (p.price || 0), 0) / activePkgs.length)
        : 0;
    const featured =
      packages.find((p) => p.isPopular && p.isActive) ||
      packages.find((p) => p.isPopular) ||
      packages.find((p) => Boolean(p.badge)) ||
      null;
    const bundles = packages.filter(
      (p) =>
        (p.includedCourseIds && p.includedCourseIds.length > 1) ||
        p.examCategory === "BUNDLE"
    ).length;

    return {
      activeCountText: `${active} Active / ${total} Total`,
      avgPriceFormatted: formatPKR(avgPrice),
      featuredPlanTitle: featured ? featured.title : "None Configured",
      featuredPlanBadge: featured?.badge || (featured?.isPopular ? "Most Popular" : null),
      multiCourseBundlesCount: bundles,
    };
  }, [packages]);

  // Filtered and Searched Packages
  const filteredPackages = useMemo(() => {
    const effectiveSearch = (searchQuery.trim() || globalSearch.trim()).toLowerCase();

    return packages.filter((pkg) => {
      // 1. Search Query
      if (effectiveSearch) {
        const titleMatch = pkg.title.toLowerCase().includes(effectiveSearch);
        const descMatch = (pkg.description || "").toLowerCase().includes(effectiveSearch);
        const catMatch = (pkg.examCategory || "").toLowerCase().includes(effectiveSearch);
        const slugMatch = (pkg.slug || "").toLowerCase().includes(effectiveSearch);
        if (!titleMatch && !descMatch && !catMatch && !slugMatch) {
          return false;
        }
      }

      // 2. Category Filter
      if (selectedCategory !== "ALL") {
        if (selectedCategory === "BUNDLE") {
          const isBundleCat = pkg.examCategory === "BUNDLE" || pkg.examCategory?.toLowerCase().includes("bundle");
          const isMultiCourse = pkg.includedCourseIds && pkg.includedCourseIds.length > 1;
          if (!isBundleCat && !isMultiCourse) return false;
        } else if (selectedCategory === "USMLE") {
          if (!pkg.examCategory?.toUpperCase().startsWith("USMLE")) return false;
        } else if (selectedCategory === "NRE1") {
          if (pkg.examCategory !== "NRE1" && !pkg.examCategory?.toLowerCase().includes("nre 1")) return false;
        } else if (selectedCategory === "NRE2") {
          if (pkg.examCategory !== "NRE2" && !pkg.examCategory?.toLowerCase().includes("nre 2")) return false;
        } else if (selectedCategory === "SMLE") {
          if (pkg.examCategory !== "SMLE" && !pkg.examCategory?.toLowerCase().includes("smle")) return false;
        } else {
          if (pkg.examCategory !== selectedCategory) return false;
        }
      }

      // 3. Status Filter
      if (statusFilter === "active" && !pkg.isActive) return false;
      if (statusFilter === "draft" && pkg.isActive) return false;

      return true;
    });
  }, [packages, searchQuery, globalSearch, selectedCategory, statusFilter]);

  // Helper for Table View: resolve course title lookup
  const getCourseTitles = (pkg: SubscriptionPackage): string[] => {
    const titles: string[] = [];
    if (pkg.includedCourseIds && pkg.includedCourseIds.length > 0) {
      for (const id of pkg.includedCourseIds) {
        const found = courses.find((c) => c.id === id);
        if (found) {
          titles.push(found.title);
        } else if (pkg.includedCourses) {
          const fallback = pkg.includedCourses.find((ic) => ic.id === id);
          if (fallback) titles.push(fallback.title);
        }
      }
    } else if (pkg.includedCourses && pkg.includedCourses.length > 0) {
      titles.push(...pkg.includedCourses.map((c) => c.title));
    }
    return titles;
  };

  // Table Columns Definition
  const tableColumns = [
    {
      key: "title",
      header: "Package Plan",
      render: (pkg: SubscriptionPackage) => {
        return (
          <div className="space-y-1 py-1 min-w-[220px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[#0E2A47] text-sm hover:text-[#0FA3A3] transition-colors">
                {pkg.title}
              </span>
              {pkg.badge && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                  {pkg.badge}
                </span>
              )}
              {pkg.isPopular && !pkg.badge && (
                <Badge variant="warning" size="sm">
                  Featured
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Badge variant="indigo" size="sm">
                {pkg.examCategory}
              </Badge>
              <span className="text-[11px] font-mono text-slate-400">/{pkg.slug}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "price",
      header: "Price & Savings",
      render: (pkg: SubscriptionPackage) => {
        const hasDiscount =
          pkg.originalPrice !== null &&
          pkg.originalPrice !== undefined &&
          pkg.originalPrice > pkg.price;
        const discountPct = hasDiscount
          ? Math.round(((pkg.originalPrice! - pkg.price) / pkg.originalPrice!) * 100)
          : 0;

        return (
          <div className="space-y-1">
            <div className="text-sm font-extrabold text-[#0E2A47]">{formatPKR(pkg.price)}</div>
            {hasDiscount ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="line-through text-slate-400">{formatPKR(pkg.originalPrice!)}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                  {discountPct}% OFF
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">Standard Rate</span>
            )}
          </div>
        );
      },
    },
    {
      key: "validity",
      header: "Validity",
      render: (pkg: SubscriptionPackage) => (
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
          <Clock className="w-3.5 h-3.5 text-[#0FA3A3]" />
          <span>{pkg.validityDays} Days</span>
        </div>
      ),
    },
    {
      key: "courses",
      header: "Included Courses & Modules",
      render: (pkg: SubscriptionPackage) => {
        const courseTitles = getCourseTitles(pkg);
        return (
          <div className="space-y-1 max-w-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded">
                <BookOpen className="w-3 h-3 text-[#0FA3A3]" />
                {courseTitles.length} {courseTitles.length === 1 ? "Course" : "Courses"}
              </span>
              {pkg.includesQbank && (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  QBank
                </span>
              )}
              {pkg.includesMockExams && (
                <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                  Mocks
                </span>
              )}
            </div>
            {courseTitles.length > 0 && (
              <p className="text-[11px] text-slate-500 truncate" title={courseTitles.join(", ")}>
                {courseTitles.slice(0, 2).join(", ")}
                {courseTitles.length > 2 && ` +${courseTitles.length - 2} more`}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (pkg: SubscriptionPackage) => (
        <Badge variant={pkg.isActive ? "teal" : "gray"} size="sm">
          {pkg.isActive ? "ACTIVE" : "DRAFT"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right" as const,
      render: (pkg: SubscriptionPackage) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => handleToggleActive(pkg.id)}
            className={cn(
              "p-1.5 rounded-lg border text-xs transition-colors cursor-pointer",
              pkg.isActive
                ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                : "text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100"
            )}
            title={pkg.isActive ? "Deactivate package" : "Activate package"}
          >
            <Power className="w-4 h-4" />
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleOpenEditModal(pkg)}
            className="p-1.5 text-slate-600 hover:text-[#0FA3A3] hover:bg-teal-50"
            title="Edit package"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPackageToDelete(pkg)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
            title="Delete package"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Feedback */}
      <ToastSystem toasts={toasts} onClose={removeToast} />

      {/* Page Header */}
      <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 border border-teal-100 text-[#0FA3A3]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#0E2A47] tracking-tight">
                Subscription & Pricing Packages
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Configure student enrollment plans, promotional bundles, validity periods, and DRM device limits.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadData}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="teal"
            size="md"
            onClick={handleOpenCreateModal}
            leftIcon={<Plus className="w-4 h-4" />}
            className="shadow-xs"
          >
            Create New Package
          </Button>
        </div>
      </div>

      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Packages"
          value={loading ? "..." : kpis.activeCountText}
          subtext="Live on public pricing portal"
          icon={<Zap className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          title="Top / Featured Plan"
          value={loading ? "..." : kpis.featuredPlanTitle}
          subtext={kpis.featuredPlanBadge ? `Badge: "${kpis.featuredPlanBadge}"` : "Featured Highlight"}
          icon={<Sparkles className="w-5 h-5 text-emerald-500" />}
          className="truncate"
        />
        <StatCard
          title="Average Package Price"
          value={loading ? "..." : kpis.avgPriceFormatted}
          subtext="Across published active tiers"
          icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          title="Multi-Course Bundles"
          value={loading ? "..." : kpis.multiCourseBundlesCount}
          subtext="Comprehensive multi-course passes"
          icon={<Layers className="w-5 h-5 text-purple-500" />}
        />
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search packages by title, category, slug..."
              className="w-full bg-slate-50 hover:bg-white focus:bg-white text-xs text-[#1E293B] pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#0FA3A3] focus:ring-2 focus:ring-[#0FA3A3]/20 transition-all focus:outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                  statusFilter === "all"
                    ? "bg-white text-[#0E2A47] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                  statusFilter === "active"
                    ? "bg-white text-emerald-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("draft")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                  statusFilter === "draft"
                    ? "bg-white text-slate-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Draft
              </button>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                  viewMode === "grid"
                    ? "bg-white text-[#0FA3A3] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
                title="Visual Tier Cards"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                  viewMode === "table"
                    ? "bg-white text-[#0FA3A3] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
                title="Data Table View"
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Category:
          </span>
          {CATEGORY_CHIPS.map((chip) => {
            const isSelected = selectedCategory === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setSelectedCategory(chip.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer border",
                  isSelected
                    ? "bg-[#0E2A47] text-white border-[#0E2A47] shadow-2xs"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Loading / Error / Empty / Grid / Table */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-20 w-full" />
              <div className="flex justify-between pt-4 border-t border-slate-100">
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadData}>
            Retry Loading Packages
          </Button>
        </div>
      ) : filteredPackages.length === 0 ? (
        <EmptyState
          icon={<Package className="w-10 h-10 text-slate-400" />}
          title="No Subscription Packages Found"
          description={
            searchQuery || selectedCategory !== "ALL" || statusFilter !== "all"
              ? "No subscription plans match your current search and filter criteria. Try resetting filters."
              : "No subscription pricing tiers have been created yet. Create your first package to enable student enrollments."
          }
          actionLabel={
            searchQuery || selectedCategory !== "ALL" || statusFilter !== "all"
              ? "Reset All Filters"
              : "Create First Package"
          }
          onAction={() => {
            if (searchQuery || selectedCategory !== "ALL" || statusFilter !== "all") {
              setSearchQuery("");
              setSelectedCategory("ALL");
              setStatusFilter("all");
            } else {
              handleOpenCreateModal();
            }
          }}
        />
      ) : viewMode === "grid" ? (
        /* Visual Tier Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPackages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              courses={courses}
              onEdit={handleOpenEditModal}
              onToggleActive={handleToggleActive}
              onDelete={setPackageToDelete}
            />
          ))}
        </div>
      ) : (
        /* Data Table View */
        <Table
          columns={tableColumns}
          data={filteredPackages}
          keyExtractor={(pkg) => pkg.id}
        />
      )}

      {/* Package Create / Edit Modal */}
      <PackageModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setPackageToEdit(null);
        }}
        onSaved={handlePackageSaved}
        packageToEdit={packageToEdit}
        courses={courses}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(packageToDelete)}
        onClose={() => setPackageToDelete(null)}
        onCancel={() => setPackageToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Subscription Package"
        message={`Are you sure you want to delete "${packageToDelete?.title}"? This action cannot be undone and will remove this pricing tier from the student portal.`}
        confirmLabel="Delete Package"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
