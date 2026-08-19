import React, { useState, useEffect } from "react";
import {
  Sparkles,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  BookOpen,
  Layers,
  HelpCircle,
  Monitor,
  Flame,
  X,
  Tag,
  ShieldCheck,
} from "lucide-react";
import { Modal, Button, Input, Select, Textarea, Checkbox, Badge } from "../ui";
import { adminApi } from "../../api/endpoints/admin";
import { Course, SubscriptionPackage, CreatePackagePayload } from "../../types";
import { formatPKR, cn } from "../../utils/formatters";

export interface PackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (pkg: SubscriptionPackage) => void;
  packageToEdit?: SubscriptionPackage | null;
  courses: Course[];
}

const EXAM_CATEGORY_OPTIONS = [
  { value: "NRE1", label: "NRE Step 1 (NRE1)" },
  { value: "NRE2", label: "NRE Step 2 (NRE2)" },
  { value: "USMLE1", label: "USMLE Step 1 (USMLE1)" },
  { value: "USMLE2CK", label: "USMLE Step 2 CK (USMLE2CK)" },
  { value: "SMLE", label: "SMLE - Saudi Medical Licensing (SMLE)" },
  { value: "PLAB1", label: "PLAB 1 / UKMLA (PLAB1)" },
  { value: "BUNDLE", label: "Multi-Exam All-Access Bundle (BUNDLE)" },
  { value: "GENERAL", label: "General Medical Preparation (GENERAL)" },
];

const VALIDITY_PRESETS = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
  { label: "365d", days: 365 },
  { label: "730d", days: 730 },
];

const BADGE_PRESETS = [
  "None",
  "Most Popular",
  "Best Value",
  "Full Access Pass",
  "Limited Offer",
  "Recommended",
];

const FEATURE_SUGGESTIONS = [
  "Full HD Video Curriculum",
  "5,000+ Verified QBank MCQs",
  "Timed Mock Exam Simulator",
  "DRM Multi-Device Access",
  "WhatsApp Doctor Community Support",
];

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const PackageModal: React.FC<PackageModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  packageToEdit,
  courses,
}) => {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isAutoSlug, setIsAutoSlug] = useState(true);
  const [examCategory, setExamCategory] = useState("NRE1");
  const [description, setDescription] = useState("");

  const [price, setPrice] = useState<number | string>(15000);
  const [originalPrice, setOriginalPrice] = useState<number | string>("");
  const [validityDays, setValidityDays] = useState<number>(180);

  const [includedCourseIds, setIncludedCourseIds] = useState<number[]>([]);
  const [includesQbank, setIncludesQbank] = useState(true);
  const [includesMockExams, setIncludesMockExams] = useState(true);
  const [maxDevices, setMaxDevices] = useState<number>(2);

  const [badge, setBadge] = useState<string>("");
  const [isPopular, setIsPopular] = useState(false);
  const [features, setFeatures] = useState<string[]>([
    "Full HD Video Curriculum",
    "5,000+ Verified QBank MCQs",
    "Timed Mock Exam Simulator",
  ]);
  const [newFeatureText, setNewFeatureText] = useState("");

  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState<number>(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (packageToEdit) {
        setTitle(packageToEdit.title || "");
        setSlug(packageToEdit.slug || "");
        setIsAutoSlug(false);
        setExamCategory(packageToEdit.examCategory || "NRE1");
        setDescription(packageToEdit.description || "");
        setPrice(packageToEdit.price !== undefined ? packageToEdit.price : 0);
        setOriginalPrice(
          packageToEdit.originalPrice !== null && packageToEdit.originalPrice !== undefined
            ? packageToEdit.originalPrice
            : ""
        );
        setValidityDays(packageToEdit.validityDays || 180);
        setIncludedCourseIds(packageToEdit.includedCourseIds ? [...packageToEdit.includedCourseIds] : []);
        setIncludesQbank(packageToEdit.includesQbank !== false);
        setIncludesMockExams(packageToEdit.includesMockExams !== false);
        setMaxDevices(packageToEdit.maxDevices || 2);
        setBadge(packageToEdit.badge || "");
        setIsPopular(Boolean(packageToEdit.isPopular));
        setFeatures(packageToEdit.features ? [...packageToEdit.features] : []);
        setIsActive(packageToEdit.isActive !== false);
        setSortOrder(packageToEdit.sortOrder ?? 0);
      } else {
        setTitle("");
        setSlug("");
        setIsAutoSlug(true);
        setExamCategory("NRE1");
        setDescription("");
        setPrice(15000);
        setOriginalPrice("");
        setValidityDays(180);
        setIncludedCourseIds(courses.length > 0 ? [courses[0].id] : []);
        setIncludesQbank(true);
        setIncludesMockExams(true);
        setMaxDevices(2);
        setBadge("");
        setIsPopular(false);
        setFeatures([
          "Full HD Video Curriculum",
          "5,000+ Verified QBank MCQs",
          "Timed Mock Exam Simulator",
        ]);
        setIsActive(true);
        setSortOrder(0);
      }
      setNewFeatureText("");
      setErrors({});
      setSubmitError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, packageToEdit, courses]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (isAutoSlug) {
      setSlug(slugify(val));
    }
    if (errors.title) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsAutoSlug(false);
    setSlug(e.target.value);
  };

  const toggleCourseSelection = (courseId: number) => {
    setIncludedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  const selectAllCourses = () => {
    setIncludedCourseIds(courses.map((c) => c.id));
  };

  const deselectAllCourses = () => {
    setIncludedCourseIds([]);
  };

  const handleAddFeature = () => {
    const trimmed = newFeatureText.trim();
    if (trimmed) {
      if (!features.includes(trimmed)) {
        setFeatures([...features, trimmed]);
      }
      setNewFeatureText("");
    }
  };

  const handleFeatureKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddFeature();
    }
  };

  const handleRemoveFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const handleAddSuggestion = (text: string) => {
    if (!features.includes(text)) {
      setFeatures([...features, text]);
    }
  };

  const numPrice = Number(price);
  const numOrigPrice = Number(originalPrice);
  const hasSavings =
    !isNaN(numPrice) &&
    !isNaN(numOrigPrice) &&
    originalPrice !== "" &&
    numOrigPrice > numPrice &&
    numPrice >= 0;
  const savingsAmount = hasSavings ? numOrigPrice - numPrice : 0;
  const savingsPercentage = hasSavings ? Math.round((savingsAmount / numOrigPrice) * 100) : 0;

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = "Package title is required.";
    }

    if (price === "" || isNaN(Number(price)) || Number(price) < 0) {
      newErrors.price = "A valid non-negative price is required.";
    }

    if (originalPrice !== "" && (isNaN(Number(originalPrice)) || Number(originalPrice) < 0)) {
      newErrors.originalPrice = "Original price must be a valid non-negative number.";
    }

    if (!validityDays || isNaN(Number(validityDays)) || Number(validityDays) <= 0) {
      newErrors.validityDays = "Validity duration must be greater than 0 days.";
    }

    if (maxDevices < 1) {
      newErrors.maxDevices = "Maximum devices must be at least 1.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreatePackagePayload = {
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        description: description.trim() || null,
        examCategory,
        price: Number(price),
        originalPrice: originalPrice !== "" && originalPrice !== null ? Number(originalPrice) : null,
        currency: "PKR",
        validityDays: Number(validityDays),
        includedCourseIds,
        includesQbank,
        includesMockExams,
        maxDevices: Number(maxDevices) || 2,
        features: features.filter((f) => f.trim().length > 0),
        badge: badge.trim() && badge !== "None" ? badge.trim() : null,
        sortOrder: Number(sortOrder) || 0,
        isActive,
        isPopular,
      };

      let result: SubscriptionPackage;
      if (packageToEdit) {
        result = await adminApi.updatePackage(packageToEdit.id, payload);
      } else {
        result = await adminApi.createPackage(payload);
      }

      onSaved(result);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to save subscription package. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={packageToEdit ? "Edit Subscription Package" : "Create New Subscription Package"}
      description="Configure pricing tiers, bundled courses, validity duration, and promotional features."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="package-form"
            variant="teal"
            isLoading={isSubmitting}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            Save Package Configuration
          </Button>
        </>
      }
    >
      <form id="package-form" onSubmit={handleSubmit} className="space-y-6">
        {submitError && (
          <div className="flex items-center gap-2 p-3.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Section 1: Plan Information */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-[#0E2A47] font-semibold text-sm">
            <Tag className="w-4 h-4 text-[#0FA3A3]" />
            <span>Section 1: Plan Information</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Package Title *"
                value={title}
                onChange={handleTitleChange}
                placeholder="e.g. NRE Step 1 Comprehensive Mastery Package"
                error={errors.title}
                required
              />
            </div>

            <div>
              <Input
                label="URL Slug"
                value={slug}
                onChange={handleSlugChange}
                placeholder="e.g. nre-step-1-mastery"
                helperText="Auto-generated URL identifier"
              />
            </div>

            <div>
              <Select
                label="Primary Exam Category"
                value={examCategory}
                onChange={(e) => setExamCategory(e.target.value)}
                options={EXAM_CATEGORY_OPTIONS}
              />
            </div>

            <div className="md:col-span-2">
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short overview of what students will achieve with this package..."
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Pricing & Validity Duration */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-[#0E2A47] font-semibold text-sm">
            <Clock className="w-4 h-4 text-[#0FA3A3]" />
            <span>Section 2: Pricing & Validity Duration</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label="Sale Price (PKR) *"
                type="number"
                min="0"
                step="100"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (errors.price) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.price;
                      return next;
                    });
                  }
                }}
                placeholder="e.g. 15000"
                error={errors.price}
                required
              />
            </div>

            <div>
              <Input
                label="Original / Regular Price (PKR)"
                type="number"
                min="0"
                step="100"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="e.g. 20000 (Optional for strikethrough)"
                error={errors.originalPrice}
                helperText="Leave empty if no promotional discount"
              />
            </div>
          </div>

          {/* Real-time Savings Banner */}
          {hasSavings && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Promotional Savings:</strong> Save {formatPKR(savingsAmount)} ({savingsPercentage}% OFF)
                </span>
              </div>
              <Badge variant="emerald" size="sm">
                {savingsPercentage}% OFF
              </Badge>
            </div>
          )}

          {/* Validity Days */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#1E293B]">
              Validity Duration (Days) *
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {VALIDITY_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => setValidityDays(preset.days)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                    validityDays === preset.days
                      ? "bg-[#0E2A47] text-white border-[#0E2A47] shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
                  )}
                >
                  {preset.label} ({preset.days} days)
                </button>
              ))}
            </div>

            <div className="w-full sm:w-48 pt-2">
              <Input
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(parseInt(e.target.value, 10) || 0)}
                placeholder="Custom days"
                error={errors.validityDays}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Course & Feature Inclusions */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2 text-[#0E2A47] font-semibold text-sm">
              <Layers className="w-4 h-4 text-[#0FA3A3]" />
              <span>Section 3: Course & Feature Inclusions</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllCourses}
                className="text-[#0FA3A3] hover:underline font-medium cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={deselectAllCourses}
                className="text-slate-500 hover:underline font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Courses Multi-Select Checklist */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#1E293B]">
              Bundled Video Courses ({includedCourseIds.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-white rounded-lg border border-slate-200">
              {courses.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">No courses available in catalog.</p>
              ) : (
                courses.map((course) => {
                  const isSelected = includedCourseIds.includes(course.id);
                  return (
                    <div
                      key={course.id}
                      onClick={() => toggleCourseSelection(course.id)}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all",
                        isSelected
                          ? "bg-teal-50/50 border-[#0FA3A3] text-[#0E2A47]"
                          : "border-slate-100 hover:border-slate-200 bg-white"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-all",
                            isSelected
                              ? "bg-[#0FA3A3] border-[#0FA3A3] text-white"
                              : "border-slate-300 bg-white"
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-xs font-medium text-slate-800">{course.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="indigo" size="sm">
                          {course.examCategory}
                        </Badge>
                        <span className="text-[11px] text-slate-400">
                          {formatPKR(course.price)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Module Inclusions Checkboxes & Device Limit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-3 bg-white rounded-lg border border-slate-200 flex flex-col justify-center">
              <Checkbox
                label={
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    Full QBank Access
                  </span>
                }
                checked={includesQbank}
                onChange={(e) => setIncludesQbank(e.target.checked)}
              />
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200 flex flex-col justify-center">
              <Checkbox
                label={
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                    Mock Exam Simulator
                  </span>
                }
                checked={includesMockExams}
                onChange={(e) => setIncludesMockExams(e.target.checked)}
              />
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <Input
                label="Max Devices"
                type="number"
                min="1"
                max="10"
                value={maxDevices}
                onChange={(e) => setMaxDevices(parseInt(e.target.value, 10) || 1)}
                error={errors.maxDevices}
                helperText="Simultaneous DRM logins"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Marketing Badges & Features Checklist */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-[#0E2A47] font-semibold text-sm">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Section 4: Marketing Badges & Features Checklist</span>
          </div>

          {/* Promotional Badge Chips */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#1E293B]">
              Promotional Ribbon / Badge
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {BADGE_PRESETS.map((preset) => {
                const isSelected = preset === "None" ? !badge : badge === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBadge(preset === "None" ? "" : preset)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer",
                      isSelected
                        ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
                    )}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            <div className="w-full sm:w-64 pt-2">
              <Input
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="Or custom badge text..."
                helperText="Displayed prominently on the pricing card"
              />
            </div>
          </div>

          {/* Popular Highlight Checkbox */}
          <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/70">
            <Checkbox
              label={
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-amber-900">
                    Feature this package prominently (Most Popular Highlight)
                  </span>
                  <span className="text-[11px] text-amber-700">
                    Card will render with a vibrant glow, accent border, and priority ranking.
                  </span>
                </div>
              }
              checked={isPopular}
              onChange={(e) => setIsPopular(e.target.checked)}
            />
          </div>

          {/* Feature Bullet Points Manager */}
          <div className="space-y-3 pt-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#1E293B]">
              Bullet Features Checklist ({features.length} items)
            </label>

            {/* Quick Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Quick add:</span>
              {FEATURE_SUGGESTIONS.map((sugg) => (
                <button
                  key={sugg}
                  type="button"
                  onClick={() => handleAddSuggestion(sugg)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700 border border-slate-200 transition-colors cursor-pointer"
                >
                  + {sugg}
                </button>
              ))}
            </div>

            {/* Feature Input */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  value={newFeatureText}
                  onChange={(e) => setNewFeatureText(e.target.value)}
                  onKeyDown={handleFeatureKeyDown}
                  placeholder="e.g. 24/7 Clinical Mentor WhatsApp Group"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddFeature}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Bullet
              </Button>
            </div>

            {/* Feature List */}
            <div className="space-y-1.5 max-h-44 overflow-y-auto p-2 bg-white rounded-lg border border-slate-200">
              {features.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">No feature bullets added yet.</p>
              ) : (
                features.map((feature, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-md bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all text-xs text-slate-800"
                  >
                    <div className="flex items-center gap-2 flex-1 pr-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{feature}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFeature(idx)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                      aria-label="Remove feature"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Section 5: Publication Status */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-[#0E2A47] font-semibold text-sm">
            <ShieldCheck className="w-4 h-4 text-[#0FA3A3]" />
            <span>Section 5: Publication Status</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <Checkbox
                label={
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">
                      Active & Published
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Visible to students for purchase on the pricing page.
                    </span>
                  </div>
                }
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
            </div>

            <div>
              <Input
                label="Sort Order Priority"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                helperText="Lower numbers appear first (e.g. 1, 2, 3)"
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};
