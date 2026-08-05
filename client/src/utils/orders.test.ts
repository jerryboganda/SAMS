import { describe, it, expect } from "vitest";
import { Order } from "../types";
import { resolveOrderBadgeState } from "./orders";

function order(overrides: Partial<Pick<Order, "status" | "proof">>): Pick<Order, "status" | "proof"> {
  return { status: "paid", ...overrides };
}

describe("resolveOrderBadgeState", () => {
  it("resolves status=paid to 'paid'", () => {
    expect(resolveOrderBadgeState(order({ status: "paid" }))).toBe("paid");
  });

  it("resolves status=awaiting_verification to 'awaiting_verification'", () => {
    expect(resolveOrderBadgeState(order({ status: "awaiting_verification" }))).toBe("awaiting_verification");
  });

  it("resolves status=pending to 'awaiting_verification' (same visual bucket as awaiting_verification)", () => {
    expect(resolveOrderBadgeState(order({ status: "pending" }))).toBe("awaiting_verification");
  });

  it("resolves a rejected manual proof (status=failed + proof.status=rejected) to 'rejected', NOT the dead literal orders.status='rejected'", () => {
    const result = resolveOrderBadgeState(
      order({
        status: "failed",
        proof: {
          id: 1,
          orderId: 1,
          filePath: "/api/v1/orders/1/proof-image",
          status: "rejected",
          rejectReason: "Reference number mismatch",
          createdAt: "2026-08-05T00:00:00.000Z",
        },
      })
    );
    expect(result).toBe("rejected");
  });

  it("resolves a plain failed order with no proof to 'other'", () => {
    expect(resolveOrderBadgeState(order({ status: "failed" }))).toBe("other");
  });

  it("resolves cancelled/refunded to 'other'", () => {
    expect(resolveOrderBadgeState(order({ status: "cancelled" }))).toBe("other");
    expect(resolveOrderBadgeState(order({ status: "refunded" }))).toBe("other");
  });

  it("a proof with status=pending (not yet reviewed) does NOT trigger the rejected badge", () => {
    const result = resolveOrderBadgeState(
      order({
        status: "awaiting_verification",
        proof: {
          id: 1,
          orderId: 1,
          filePath: "/api/v1/orders/1/proof-image",
          status: "pending",
          createdAt: "2026-08-05T00:00:00.000Z",
        },
      })
    );
    expect(result).toBe("awaiting_verification");
  });
});
