import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { adminApi } from "./admin";
import { publicApi } from "./public";
import { MOCK_PACKAGES, MOCK_AUDIT_LOGS } from "../../mock-data";
import { CONFIG } from "../../config";
import { CreatePackagePayload } from "../../types";

function mockJsonResponse(body: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

describe("Subscription Packages API Endpoints", () => {
  describe("Mock Mode (CONFIG.USE_MOCK = true)", () => {
    const originalUseMock = CONFIG.USE_MOCK;

    beforeEach(() => {
      CONFIG.USE_MOCK = true;
    });

    afterEach(() => {
      CONFIG.USE_MOCK = originalUseMock;
    });

    it("publicApi.getPublicPackages returns active packages sorted by sortOrder", async () => {
      const packages = await publicApi.getPublicPackages();
      expect(packages.length).toBeGreaterThan(0);
      packages.forEach((pkg) => {
        expect(pkg.isActive).toBe(true);
      });
      for (let i = 1; i < packages.length; i++) {
        expect(packages[i].sortOrder).toBeGreaterThanOrEqual(packages[i - 1].sortOrder);
      }
    });

    it("adminApi.getPackages returns all packages", async () => {
      const initialCount = MOCK_PACKAGES.length;
      const packages = await adminApi.getPackages();
      expect(packages.length).toBe(initialCount);
    });

    it("adminApi.getPackageById returns package by numeric id and string id/slug", async () => {
      const pkg = await adminApi.getPackageById(1);
      expect(pkg).not.toBeNull();
      expect(pkg?.id).toBe(1);
      expect(pkg?.slug).toBe("nre-step-1-mastery");

      const pkgBySlug = await adminApi.getPackageById("nre-step-1-mastery");
      expect(pkgBySlug).not.toBeNull();
      expect(pkgBySlug?.id).toBe(1);

      const nonExistent = await adminApi.getPackageById(99999);
      expect(nonExistent).toBeNull();
    });

    it("adminApi.createPackage creates a new package and logs audit record", async () => {
      const auditCountBefore = MOCK_AUDIT_LOGS.length;
      const payload: CreatePackagePayload = {
        title: "Test Special Package",
        slug: "test-special-package",
        description: "A test package for vitest",
        examCategory: "NRE1",
        price: 19999,
        originalPrice: 24999,
        currency: "PKR",
        validityDays: 90,
        includedCourseIds: [1],
        includesQbank: true,
        includesMockExams: true,
        maxDevices: 2,
        features: ["Feature A", "Feature B"],
        badge: "Special",
        sortOrder: 10,
        isActive: true,
        isPopular: false,
      };

      const created = await adminApi.createPackage(payload);
      expect(created.id).toBeDefined();
      expect(created.title).toBe("Test Special Package");
      expect(created.slug).toBe("test-special-package");
      expect(created.price).toBe(19999);
      expect(created.includedCourses?.length).toBe(1);
      expect(MOCK_PACKAGES[0].id).toBe(created.id);
      expect(MOCK_AUDIT_LOGS.length).toBe(auditCountBefore + 1);
      expect(MOCK_AUDIT_LOGS[0].action).toBe("package.create");
    });

    it("adminApi.updatePackage updates existing package fields and logs audit record", async () => {
      const auditCountBefore = MOCK_AUDIT_LOGS.length;
      const targetId = MOCK_PACKAGES[0].id;
      const updated = await adminApi.updatePackage(targetId, {
        title: "Updated Title for Package",
        price: 29999,
      });

      expect(updated.title).toBe("Updated Title for Package");
      expect(updated.price).toBe(29999);
      expect(MOCK_AUDIT_LOGS.length).toBe(auditCountBefore + 1);
      expect(MOCK_AUDIT_LOGS[0].action).toBe("package.update");
    });

    it("adminApi.togglePackageActive flips isActive status and logs audit record", async () => {
      const auditCountBefore = MOCK_AUDIT_LOGS.length;
      const target = MOCK_PACKAGES[0];
      const initialActive = target.isActive;

      const toggled = await adminApi.togglePackageActive(target.id);
      expect(toggled.isActive).toBe(!initialActive);
      expect(MOCK_AUDIT_LOGS.length).toBe(auditCountBefore + 1);
      expect(MOCK_AUDIT_LOGS[0].action).toBe("package.toggle");
    });

    it("adminApi.deletePackage removes package and logs audit record", async () => {
      const auditCountBefore = MOCK_AUDIT_LOGS.length;
      const target = MOCK_PACKAGES[0];
      const targetId = target.id;

      const res = await adminApi.deletePackage(targetId);
      expect(res.success).toBe(true);
      expect(MOCK_PACKAGES.some((p) => p.id === targetId)).toBe(false);
      expect(MOCK_AUDIT_LOGS.length).toBe(auditCountBefore + 1);
      expect(MOCK_AUDIT_LOGS[0].action).toBe("package.delete");
    });
  });

  describe("Live Mode (CONFIG.USE_MOCK = false)", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    const originalUseMock = CONFIG.USE_MOCK;

    beforeEach(() => {
      CONFIG.USE_MOCK = false;
      fetchSpy = vi.spyOn(global, "fetch");
    });

    afterEach(() => {
      CONFIG.USE_MOCK = originalUseMock;
      fetchSpy.mockRestore();
    });

    it("publicApi.getPublicPackages calls GET /packages", async () => {
      const mockResult = [{ id: 1, title: "Test Pkg" }];
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: mockResult }));

      const res = await publicApi.getPublicPackages();
      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith("/api/v1/packages", expect.objectContaining({ credentials: "include" }));
    });

    it("adminApi.getPackages calls GET /admin/packages", async () => {
      const mockResult = [{ id: 1, title: "Test Pkg" }];
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: mockResult }));

      const res = await adminApi.getPackages();
      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith("/api/v1/admin/packages", expect.objectContaining({ credentials: "include" }));
    });

    it("adminApi.getPackageById calls GET /admin/packages/:id", async () => {
      const mockResult = { id: 1, title: "Test Pkg" };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: mockResult }));

      const res = await adminApi.getPackageById(1);
      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith("/api/v1/admin/packages/1", expect.objectContaining({ credentials: "include" }));
    });

    it("adminApi.createPackage calls POST /admin/packages with payload", async () => {
      const payload: CreatePackagePayload = {
        title: "New Plan",
        price: 10000,
      };
      const mockResult = { id: 5, title: "New Plan", price: 10000 };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: mockResult }));

      const res = await adminApi.createPackage(payload);
      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/admin/packages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
        })
      );
    });

    it("adminApi.updatePackage calls PUT /admin/packages/:id with payload", async () => {
      const payload = { title: "Updated Plan" };
      const mockResult = { id: 1, title: "Updated Plan" };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: mockResult }));

      const res = await adminApi.updatePackage(1, payload);
      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/admin/packages/1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(payload),
        })
      );
    });

    it("adminApi.togglePackageActive calls POST /admin/packages/:id/toggle", async () => {
      const mockResult = { id: 1, isActive: false };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: mockResult }));

      const res = await adminApi.togglePackageActive(1);
      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/admin/packages/1/toggle",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("adminApi.deletePackage calls DELETE /admin/packages/:id", async () => {
      const mockResult = { success: true, message: "Package deleted" };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: mockResult }));

      const res = await adminApi.deletePackage(1);
      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/admin/packages/1",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });
});
