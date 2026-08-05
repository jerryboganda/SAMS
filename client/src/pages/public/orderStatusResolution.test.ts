import { describe, it, expect } from "vitest";
import { resolveDisplayStatus, shouldContinuePolling } from "./orderStatusResolution";
import { Order } from "../../types";

function order(status: Order["status"]): Pick<Order, "status"> {
  return { status };
}

describe("resolveDisplayStatus", () => {
  it("maps paid -> paid", () => {
    expect(resolveDisplayStatus(order("paid"), { timedOut: false })).toEqual({ display: "paid" });
  });

  it("maps awaiting_verification -> awaiting_verification", () => {
    expect(resolveDisplayStatus(order("awaiting_verification"), { timedOut: false })).toEqual({
      display: "awaiting_verification",
    });
  });

  it("maps failed -> failed with failedReason 'failed'", () => {
    expect(resolveDisplayStatus(order("failed"), { timedOut: false })).toEqual({
      display: "failed",
      failedReason: "failed",
    });
  });

  it("maps cancelled -> failed-shaped card with failedReason 'cancelled'", () => {
    expect(resolveDisplayStatus(order("cancelled"), { timedOut: false })).toEqual({
      display: "failed",
      failedReason: "cancelled",
    });
  });

  it("maps refunded -> failed-shaped card with failedReason 'refunded'", () => {
    expect(resolveDisplayStatus(order("refunded"), { timedOut: false })).toEqual({
      display: "failed",
      failedReason: "refunded",
    });
  });

  it("pending while still polling -> pending (keeps showing the spinner)", () => {
    expect(resolveDisplayStatus(order("pending"), { timedOut: false })).toEqual({ display: "pending" });
  });

  it("pending after polling times out -> failed-shaped card with failedReason 'poll_timeout' (never claims a real decline)", () => {
    expect(resolveDisplayStatus(order("pending"), { timedOut: true })).toEqual({
      display: "failed",
      failedReason: "poll_timeout",
    });
  });

  it("null order (initial fetch itself failed) -> failed", () => {
    expect(resolveDisplayStatus(null, { timedOut: false })).toEqual({ display: "failed", failedReason: "failed" });
  });
});

describe("shouldContinuePolling", () => {
  it("keeps polling while status is pending and under the attempt cap", () => {
    expect(shouldContinuePolling("pending", 0, 24)).toBe(true);
    expect(shouldContinuePolling("pending", 23, 24)).toBe(true);
  });

  it("stops once the attempt cap is reached", () => {
    expect(shouldContinuePolling("pending", 24, 24)).toBe(false);
  });

  it("stops immediately for any terminal status regardless of attempt count", () => {
    expect(shouldContinuePolling("paid", 0, 24)).toBe(false);
    expect(shouldContinuePolling("failed", 0, 24)).toBe(false);
    expect(shouldContinuePolling("awaiting_verification", 0, 24)).toBe(false);
    expect(shouldContinuePolling("cancelled", 0, 24)).toBe(false);
    expect(shouldContinuePolling("refunded", 0, 24)).toBe(false);
  });

  it("treats an undefined status (order not loaded yet) as still-pollable under the cap", () => {
    expect(shouldContinuePolling(undefined, 0, 24)).toBe(true);
    expect(shouldContinuePolling(undefined, 24, 24)).toBe(false);
  });
});
