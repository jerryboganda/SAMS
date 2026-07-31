import { describe, it, expect } from "vitest";
import { Enrollment } from "../types";
import { isEnrollmentActive, isEnrollmentExpired, splitEnrollmentsByStatus } from "./enrollments";

function enrollment(overrides: Partial<Enrollment> & { id: number }): Enrollment {
  return {
    userId: 1,
    courseId: 1,
    source: "purchase",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-12-31T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

describe("isEnrollmentActive / isEnrollmentExpired", () => {
  it("treats status=active with remainingDays > 0 as active only", () => {
    const e = enrollment({ id: 1, status: "active", remainingDays: 30 });
    expect(isEnrollmentActive(e)).toBe(true);
    expect(isEnrollmentExpired(e)).toBe(false);
  });

  it("treats status=active with remainingDays undefined as active (no expiry signal yet)", () => {
    const e = enrollment({ id: 2, status: "active", remainingDays: undefined });
    expect(isEnrollmentActive(e)).toBe(true);
    expect(isEnrollmentExpired(e)).toBe(false);
  });

  it("treats status=expired as expired regardless of remainingDays", () => {
    const e = enrollment({ id: 3, status: "expired", remainingDays: 5 });
    expect(isEnrollmentExpired(e)).toBe(true);
    expect(isEnrollmentActive(e)).toBe(false);
  });

  it("treats status=active with remainingDays <= 0 as expired, not active (date caught up before status flipped)", () => {
    const zero = enrollment({ id: 4, status: "active", remainingDays: 0 });
    const negative = enrollment({ id: 5, status: "active", remainingDays: -2 });
    expect(isEnrollmentExpired(zero)).toBe(true);
    expect(isEnrollmentActive(zero)).toBe(false);
    expect(isEnrollmentExpired(negative)).toBe(true);
    expect(isEnrollmentActive(negative)).toBe(false);
  });

  it("treats status=revoked as neither active nor expired (inherited behavior, not introduced here)", () => {
    const e = enrollment({ id: 6, status: "revoked", remainingDays: 10 });
    expect(isEnrollmentActive(e)).toBe(false);
    expect(isEnrollmentExpired(e)).toBe(false);
  });
});

describe("splitEnrollmentsByStatus", () => {
  it("returns empty active/expired arrays for an empty input (freshly-registered student)", () => {
    expect(splitEnrollmentsByStatus([])).toEqual({ active: [], expired: [] });
  });

  it("splits a mixed list into active and expired buckets, preserving order", () => {
    const activeOne = enrollment({ id: 1, status: "active", remainingDays: 120 });
    const expiringSoon = enrollment({ id: 2, status: "active", remainingDays: 3 });
    const expiredByStatus = enrollment({ id: 3, status: "expired", remainingDays: undefined });
    const expiredByDate = enrollment({ id: 4, status: "active", remainingDays: 0 });

    const { active, expired } = splitEnrollmentsByStatus([activeOne, expiringSoon, expiredByStatus, expiredByDate]);

    expect(active.map((e) => e.id)).toEqual([1, 2]);
    expect(expired.map((e) => e.id)).toEqual([3, 4]);
  });

  it("drops revoked enrollments from both buckets rather than fabricating a status for them", () => {
    const revoked = enrollment({ id: 7, status: "revoked", remainingDays: 45 });
    const { active, expired } = splitEnrollmentsByStatus([revoked]);
    expect(active).toEqual([]);
    expect(expired).toEqual([]);
  });
});
