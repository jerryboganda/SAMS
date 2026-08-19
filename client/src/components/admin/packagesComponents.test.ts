import { describe, it, expect, vi } from "vitest";
import { SubscriptionPackage, Course } from "../../types";
import { formatPKR } from "../../utils/formatters";

describe("Subscription Packages Components Logic", () => {
  const mockCourses: Course[] = [
    {
      id: 1,
      title: "NRE Step 1 Masterclass",
      slug: "nre-step-1",
      examCategory: "NRE1",
      shortDescription: "Complete NRE 1",
      description: "Description",
      thumbnailUrl: "/thumb1.jpg",
      price: 10000,
      currency: "PKR",
      validityDays: 180,
      includesQBank: true,
      isPublished: true,
      sortOrder: 1,
    },
    {
      id: 2,
      title: "SMLE Crash Course",
      slug: "smle-crash",
      examCategory: "SMLE",
      shortDescription: "Saudi Medical Licensing",
      description: "Description",
      thumbnailUrl: "/thumb2.jpg",
      price: 12000,
      currency: "PKR",
      validityDays: 120,
      includesQBank: true,
      isPublished: true,
      sortOrder: 2,
    },
  ];

  const mockPackage: SubscriptionPackage = {
    id: 1,
    title: "NRE Step 1 Mastery Package",
    slug: "nre-step-1-mastery",
    description: "Complete preparation package",
    examCategory: "NRE1",
    price: 15000,
    originalPrice: 20000,
    currency: "PKR",
    validityDays: 180,
    includedCourseIds: [1],
    includedCourses: [
      {
        id: 1,
        title: "NRE Step 1 Masterclass",
        examCategory: "NRE1",
        validityDays: 180,
      },
    ],
    includesQbank: true,
    includesMockExams: true,
    maxDevices: 2,
    features: [
      "Full 180 Days Access",
      "5,000+ Verified QBank MCQs",
      "Timed Mock Exam Simulator",
    ],
    badge: "Most Popular",
    sortOrder: 1,
    isActive: true,
    isPopular: true,
  };

  it("calculates promotional savings and discount percentages accurately", () => {
    const originalPrice = mockPackage.originalPrice!;
    const salePrice = mockPackage.price;
    const savings = originalPrice - salePrice;
    const discountPct = Math.round((savings / originalPrice) * 100);

    expect(savings).toBe(5000);
    expect(discountPct).toBe(25);
    expect(formatPKR(savings)).toBe("Rs 5,000");
    expect(formatPKR(salePrice)).toBe("Rs 15,000");
    expect(formatPKR(originalPrice)).toBe("Rs 20,000");
  });

  it("resolves bundled course metadata from courses prop and fallbacks", () => {
    const resolved = mockPackage.includedCourseIds.map((courseId) => {
      const found = mockCourses.find((c) => c.id === courseId);
      if (found) return { id: found.id, title: found.title, category: found.examCategory };
      const fallback = mockPackage.includedCourses?.find((ic) => ic.id === courseId);
      return fallback ? { id: fallback.id, title: fallback.title, category: fallback.examCategory } : null;
    }).filter(Boolean);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.title).toBe("NRE Step 1 Masterclass");
    expect(resolved[0]?.category).toBe("NRE1");
  });

  it("generates clean URL slugs from titles", () => {
    const slugify = (text: string): string => {
      return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    expect(slugify("NRE Step 1 Comprehensive Mastery Package")).toBe(
      "nre-step-1-comprehensive-mastery-package"
    );
    expect(slugify("USMLE & SMLE Combo -- 2026 Edition!!")).toBe(
      "usmle-smle-combo-2026-edition"
    );
  });

  it("exports PackageModal and PackageCard from the admin components index", async () => {
    const adminExports = await import("./index");
    expect(adminExports.PackageModal).toBeDefined();
    expect(adminExports.PackageCard).toBeDefined();
    expect(adminExports.AddStudentModal).toBeDefined();
    expect(adminExports.EditStudentModal).toBeDefined();
    expect(adminExports.PostCreateCredentialsModal).toBeDefined();
  });

  it("calculates subscription KPI metrics correctly across packages", () => {
    const pkgs: SubscriptionPackage[] = [
      mockPackage,
      {
        ...mockPackage,
        id: 2,
        title: "SMLE Pro Package",
        price: 25000,
        isActive: true,
        isPopular: false,
        includedCourseIds: [1, 2],
      },
      {
        ...mockPackage,
        id: 3,
        title: "Draft Tier",
        price: 5000,
        isActive: false,
        isPopular: false,
        includedCourseIds: [2],
      },
    ];

    const total = pkgs.length;
    const active = pkgs.filter((p) => p.isActive).length;
    const activePkgs = pkgs.filter((p) => p.isActive);
    const avgPrice = Math.round(
      activePkgs.reduce((sum, p) => sum + p.price, 0) / activePkgs.length
    );
    const featured = pkgs.find((p) => p.isPopular);
    const bundles = pkgs.filter((p) => p.includedCourseIds.length > 1).length;

    expect(active).toBe(2);
    expect(total).toBe(3);
    expect(avgPrice).toBe(20000); // (15000 + 25000) / 2
    expect(featured?.title).toBe("NRE Step 1 Mastery Package");
    expect(bundles).toBe(1);
  });

  it("resolves package 1-click apply courses and sets default validity for AddStudentModal", () => {
    const bundlePkg: SubscriptionPackage = {
      ...mockPackage,
      id: 10,
      validityDays: 365,
      includedCourseIds: [1, 2],
    };

    let selectedCourses: { courseId: number; validityOption: string }[] = [];

    const applyPackage = (pkg: SubscriptionPackage) => {
      const next = [...selectedCourses];
      for (const cid of pkg.includedCourseIds) {
        const existingIdx = next.findIndex((sc) => sc.courseId === cid);
        if (existingIdx >= 0) {
          next[existingIdx] = { ...next[existingIdx], validityOption: String(pkg.validityDays) };
        } else {
          next.push({ courseId: cid, validityOption: String(pkg.validityDays) });
        }
      }
      selectedCourses = next;
    };

    applyPackage(bundlePkg);

    expect(selectedCourses).toHaveLength(2);
    expect(selectedCourses[0]).toEqual({ courseId: 1, validityOption: "365" });
    expect(selectedCourses[1]).toEqual({ courseId: 2, validityOption: "365" });
  });

  it("exports SubscriptionsManagementPage from admin pages", async () => {
    const pageModule = await import("../../pages/admin/SubscriptionsManagementPage");
    expect(pageModule.SubscriptionsManagementPage).toBeDefined();
  });
});
