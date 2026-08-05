// client/src/utils/orders.ts
// Pure order-badge-state resolution extracted from OrdersPage.tsx
// (docs/07_EXECUTION_PLAN.md 9.7), so it's unit-testable without rendering React — same
// pattern as enrollments.ts/loginErrorScreen.ts.
//
// `orders.status` (docs/03_DATABASE_SCHEMA.md) has NO literal `'rejected'` value — the
// pre-existing `getStatusBadge`'s `case "rejected"` in OrdersPage.tsx was dead code that could
// never match a real order. A rejected manual payment is instead signaled by
// `order.status === 'failed'` PLUS `order.proof?.status === 'rejected'`
// (server/src/services/manualPaymentService.js#rejectBankTransfer sets both atomically) — this
// resolves that real signal into the 4 badge variants OrdersPage.tsx's UI already renders.
import { Order } from "../types";

export type OrderBadgeState = "paid" | "awaiting_verification" | "rejected" | "other";

export function resolveOrderBadgeState(order: Pick<Order, "status" | "proof">): OrderBadgeState {
  if (order.proof?.status === "rejected") return "rejected";
  if (order.status === "paid") return "paid";
  if (order.status === "awaiting_verification" || order.status === "pending") return "awaiting_verification";
  return "other";
}
