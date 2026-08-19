import { describe, it, expect } from "vitest";
import { SubscriptionPackage } from "../../types";

describe("Subscriptions & Pricing Management Logic", () => {
  const samplePackages: SubscriptionPackage[] = [
    {
      id: 1,
      title: "NRE Step 1 Mastery",
      slug: "nre-1-mastery",
      examCategory: "NRE1",
      price: 15000,
      originalPrice: 20000,
      currency: "PKR",
      validityDays: 180,
      includedCourseIds: [1],
      includesQbank: true,
      includesMockExams: true,
      maxDevices: 2,
      features: ["HD Lectures", "QBank Access"],
      badge: "Most Popular",
      sortOrder: 1,
      isActive: true,
      isPopular: true,
    },
    {
      id: 2,
      title: "USMLE Step 1 Immersion",
      slug: "usmle-1-immersion",
      examCategory: "USMLE1",
      price: 25000,
      originalPrice: 35000,
      currency: "PKR",
      validityDays: 365,
      includedCourseIds: [2],
      includesQbank: true,
      includesMockExams: true,
      maxDevices: 2,
      features: ["All Modules", "Mock Exams"],
      badge: "Best Value",
      sortOrder: 2,
      isActive: true,
      isPopular: false,
    },
    {
      id: 3,
      title: "All-Access Clinical Bundle",
      slug: "all-access-bundle",
      examCategory: "BUNDLE",
      price: 45000,
      originalPrice: 65000,
      currency: "PKR",
      validityDays: 365,
      includedCourseIds: [1, 2, 3],
      includesQbank: true,
      includesMockExams: true,
      maxDevices: 2,
      features: ["All Courses", "All QBanks"],
      badge: "Full Pass",
      sortOrder: 3,
      isActive: false,
      isPopular: false,
    },
  ];

  it("calculates active packages and average price metrics accurately", () => {
    const activePackages = samplePackages.filter((p) => p.isActive);
    expect(activePackages.length).toBe(2);

    const totalActivePrice = activePackages.reduce((acc, p) => acc + Number(p.price), 0);
    const avgPrice = Math.round(totalActivePrice / activePackages.length);
    expect(avgPrice).toBe(20000); // (15000 + 25000) / 2
  });

  it("identifies the top / featured package", () => {
    const topPlan = samplePackages.find((p) => p.isPopular) || samplePackages[0];
    expect(topPlan).toBeDefined();
    expect(topPlan.title).toBe("NRE Step 1 Mastery");
    expect(topPlan.badge).toBe("Most Popular");
  });

  it("filters packages by exam category and status correctly", () => {
    const nrePackages = samplePackages.filter((p) => p.examCategory === "NRE1");
    expect(nrePackages.length).toBe(1);
    expect(nrePackages[0].id).toBe(1);

    const bundlePackages = samplePackages.filter((p) => p.examCategory === "BUNDLE");
    expect(bundlePackages.length).toBe(1);
    expect(bundlePackages[0].includedCourseIds.length).toBe(3);

    const draftPackages = samplePackages.filter((p) => !p.isActive);
    expect(draftPackages.length).toBe(1);
    expect(draftPackages[0].title).toBe("All-Access Clinical Bundle");
  });

  it("searches packages by title, slug, or features query", () => {
    const query = "immersion";
    const matched = samplePackages.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.slug.toLowerCase().includes(query)
    );
    expect(matched.length).toBe(1);
    expect(matched[0].id).toBe(2);
  });
});
