// server/src/services/adminOrderService.js
// Admin order management (docs/07_EXECUTION_PLAN.md 9.8, docs/04_API_SPEC.md
// §7 "Orders"). Reuses orderService.js's exported building blocks
// (serializeOrder, ORDER_ASSOCIATIONS, loadOrderWithAssociations,
// PAYABLE_STATUSES, completeOrderPayment) rather than duplicating any of
// that logic — see that file's own doc comments on each export for why they
// were made reusable. Layering: routes -> controllers -> services -> models
// (CLAUDE.md §4).
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import * as orderService from './orderService.js';

const { Order, PaymentEvent } = db;
const { ORDER_ASSOCIATIONS, PAYABLE_STATUSES, serializeOrder, loadOrderWithAssociations, completeOrderPayment } = orderService;

// ---------------------------------------------------------------------------
// GET /admin/orders
// ---------------------------------------------------------------------------

/**
 * client/src/pages/admin/OrdersManagementPage.tsx calls `GET /admin/orders`
 * with NO query params (client/src/api/endpoints/admin.ts#getOrders) and does
 * ALL searching/status/gateway filtering client-side over the full returned
 * array — confirmed by reading that page directly (task brief). CLAUDE.md
 * §4's "every list endpoint: pagination (page, limit <= 100)" convention is
 * written for the general case where the CALLER drives page/limit; here the
 * already-built, out-of-scope-to-edit frontend's contract is a flat,
 * unfiltered `Order[]` with zero query params (CLAUDE.md §1a: match the
 * frontend's existing contract). Rather than either (a) silently breaking
 * that contract by wrapping the response in a `{data, pagination}` envelope
 * the frontend never unwraps, or (b) returning truly unbounded rows forever,
 * this applies pagination's SPIRIT as a fixed safety cap instead of its
 * letter — the 200 most recent orders, newest first. See DECISIONS.md
 * 2026-08-05 for the full writeup (no prior exact precedent existed
 * elsewhere in this codebase for "frontend expects a flat array, not
 * paginated" at the time this was written).
 */
const ADMIN_ORDERS_LIST_CAP = 200;

export async function listAllOrders() {
  const orders = await Order.findAll({
    order: [['id', 'DESC']],
    include: ORDER_ASSOCIATIONS,
    limit: ADMIN_ORDERS_LIST_CAP,
  });
  return orders.map(serializeOrder);
}

// ---------------------------------------------------------------------------
// GET /admin/orders/:id
// ---------------------------------------------------------------------------

/** Admin detail view — owner-agnostic (any order, any student) by design; no IDOR check needed since this whole router is already admin-only (routes/v1/admin/index.js). */
export async function getOrderByIdForAdmin(orderId) {
  const order = await loadOrderWithAssociations(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  return serializeOrder(order);
}

// ---------------------------------------------------------------------------
// GET /admin/orders/:id/payment-events
// ---------------------------------------------------------------------------

/** Matches client/src/types/index.ts's `PaymentEvent` interface exactly (camelCase; `payload` passed through as-is, it's already JSON). */
function serializePaymentEvent(event) {
  return {
    id: event.id,
    orderId: event.orderId,
    gateway: event.gateway,
    eventType: event.eventType,
    externalRef: event.externalRef ?? undefined,
    payload: event.payload,
    signatureValid: Boolean(event.signatureValid),
    createdAt: event.createdAt,
  };
}

/** Chronological (oldest-first) timeline — the natural read order for "what happened to this order over time" (task brief). */
export async function getPaymentEventsForOrder(orderId) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  const events = await PaymentEvent.findAll({ where: { orderId }, order: [['id', 'ASC']] });
  return events.map(serializePaymentEvent);
}

// ---------------------------------------------------------------------------
// POST /admin/orders/:id/mark-paid
// ---------------------------------------------------------------------------

/**
 * Admin manually confirms a payment happened outside any gateway (e.g. cash,
 * a bank transfer the admin verified by phone rather than through the
 * `bank_transfer` proof-upload flow). Sets `orders.gateway = 'manual'`
 * (the orders.gateway ENUM's internal-only value reserved exactly for this,
 * docs/04_API_SPEC.md §7) and then goes through orderService.js's
 * `completeOrderPayment()` — THE shared success path (order->paid, coupon
 * redemption, enrollment, invoice PDF, notification+email) — with
 * `externalRef: null` (there is no gateway transaction id for a manual
 * mark-paid). Mirrors services/manualPaymentService.js#approveBankTransfer's
 * own "call the shared success path, don't reimplement it" discipline.
 *
 * Only valid for an order currently in `PAYABLE_STATUSES`
 * ('pending'/'awaiting_verification'); anything else (already
 * paid/failed/cancelled/refunded) is a clean 409 — unlike a replayed gateway
 * webhook (which silently no-ops on an already-resolved order, since a
 * replay is an expected occurrence), an ADMIN explicitly clicking "mark
 * paid" on an already-resolved order is almost certainly a mistake and
 * should be told so rather than silently swallowed.
 *
 * The admin's free-text `reason` is captured in the `audit_logs` row's
 * `summary` by routes/v1/admin/orders.js's `audit(...)` wiring — no new DB
 * column needed (task brief).
 */
export async function markOrderPaid({ orderId, reason: _reason, adminUserId: _adminUserId }) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  if (!PAYABLE_STATUSES.includes(order.status)) {
    throw new ApiError(
      409,
      'INVALID_ORDER_STATE',
      `Order #${order.id} is already "${order.status}" and cannot be marked paid.`
    );
  }

  order.gateway = 'manual';
  await order.save();

  const result = await completeOrderPayment({ order, gateway: 'manual', externalRef: null });
  if (result.alreadyProcessed) {
    // A concurrent action (e.g. a real gateway callback, or a second admin
    // click) resolved the order first, between our own precheck above and
    // completeOrderPayment()'s own row-locked check — surface the SAME 409
    // the precheck would have thrown, for a consistent contract.
    throw new ApiError(
      409,
      'INVALID_ORDER_STATE',
      `Order #${order.id} is already "${result.order.status}" and cannot be marked paid.`
    );
  }

  const fresh = await loadOrderWithAssociations(orderId);
  return serializeOrder(fresh);
}

// ---------------------------------------------------------------------------
// POST /admin/orders/:id/refund-flag
// ---------------------------------------------------------------------------

/**
 * A FLAG only — CLAUDE.md's scope explicitly excludes building a real
 * payment-reversal/refund-processing integration; this is just the status
 * transition + audit trail (task brief). Only valid for an order currently
 * `paid` (can't refund-flag something never paid). Deliberately does NOT
 * touch the enrollment — a judgment call, see DECISIONS.md 2026-08-05: revoking
 * access is a separate, more consequential decision better left to an
 * explicit admin enrollment-revoke action (not yet built — Phase 11 scope)
 * than an implicit side effect of this endpoint.
 */
export async function refundFlagOrder({ orderId, reason: _reason, adminUserId: _adminUserId }) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  if (order.status !== 'paid') {
    throw new ApiError(
      409,
      'INVALID_ORDER_STATE',
      `Order #${order.id} is "${order.status}", not "paid" — only a paid order can be flagged for refund.`
    );
  }

  order.status = 'refunded';
  await order.save();

  const fresh = await loadOrderWithAssociations(orderId);
  return serializeOrder(fresh);
}

export default {
  listAllOrders,
  getOrderByIdForAdmin,
  getPaymentEventsForOrder,
  markOrderPaid,
  refundFlagOrder,
};
