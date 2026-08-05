// client/src/pages/public/orderStatusResolution.ts
// Pure logic extracted from OrderStatusPage.tsx (docs/07_EXECUTION_PLAN.md 9.7) so it's
// unit-testable without rendering React — same pattern as
// client/src/utils/enrollments.test.ts / client/src/pages/public/loginErrorScreen.test.ts.
//
// Maps the REAL `Order.status` enum (server/docs/03_DATABASE_SCHEMA.md:
// pending|awaiting_verification|paid|failed|cancelled|refunded) onto
// OrderStatusPage.tsx's existing 3 visual card states (paid/awaiting_verification/failed),
// replacing the page's previous fake `setTimeout(2000)` "simulate polling" + manual
// dev-only status-toggle bar with a real, honest mapping of what the backend actually reports.
import { Order, OrderStatus } from "../../types";

export type DisplayStatus = "pending" | "paid" | "awaiting_verification" | "failed";

/**
 * Copy variant for the failed-shaped card — a genuinely-declined payment reads differently
 * from "still pending, but we stopped polling" or "cancelled/refunded" (none of those mean
 * "the gateway declined your card"), even though all 4 currently share the same failed-shaped
 * visual card (no new card was added — out of this task's "don't redesign" scope).
 */
export type FailedReason = "failed" | "cancelled" | "refunded" | "poll_timeout";

export interface DisplayStatusResult {
  display: DisplayStatus;
  failedReason?: FailedReason;
}

/**
 * Resolves what the page should actually show for a given real order + whether polling has
 * timed out. `order` may be null (e.g. the initial fetch itself failed) — treated as a generic
 * failure so the page never gets stuck without SOME terminal state.
 */
export function resolveDisplayStatus(order: Pick<Order, "status"> | null, opts: { timedOut: boolean }): DisplayStatusResult {
  if (!order) return { display: "failed", failedReason: "failed" };

  switch (order.status) {
    case "paid":
      return { display: "paid" };
    case "awaiting_verification":
      return { display: "awaiting_verification" };
    case "failed":
      return { display: "failed", failedReason: "failed" };
    case "cancelled":
      return { display: "failed", failedReason: "cancelled" };
    case "refunded":
      return { display: "failed", failedReason: "refunded" };
    case "pending":
    default:
      if (opts.timedOut) return { display: "failed", failedReason: "poll_timeout" };
      return { display: "pending" };
  }
}

/** True while a `pending` order should still be polled — false once it reaches ANY terminal status, or the attempt cap is hit. */
export function shouldContinuePolling(status: OrderStatus | undefined, attempt: number, maxAttempts: number): boolean {
  if (!status) return attempt < maxAttempts;
  if (status !== "pending") return false;
  return attempt < maxAttempts;
}
