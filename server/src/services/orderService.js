// server/src/services/orderService.js
// Order creation, checkout-gateway orchestration, and — the single most
// important piece of reusable infrastructure this task builds — the SHARED
// PAYMENT-SUCCESS PATH every gateway driver's callback (mock now;
// jazzcash/easypaisa/raast/bank_transfer/payfast/safepay later,
// docs/07_EXECUTION_PLAN.md 9.3-9.6/9.5b) funnels through. Layering: routes
// -> controllers -> services -> models (CLAUDE.md §4).
//
// Entry points a controller calls:
//   getQuoteResponse({courseId, couponCode})                          - POST /checkout/quote
//   createOrder({userId, courseId, couponCode, gateway})               - POST /checkout/orders
//   handleGatewayReturn(gatewayCode, req) -> orderId|null              - GET  /checkout/return/:gateway
//   handleGatewayWebhook(gatewayCode, req)                             - POST /webhooks/payments/:gateway
//   listOrdersForUser(userId)                                          - GET  /orders
//   getOrderForViewer(orderId, viewer)                                 - GET  /orders/:id
//   getInvoiceFileForViewer(orderId, viewer)                           - GET  /orders/:id/invoice.pdf
//
// THE shared success path itself — what every future gateway driver's
// callback ultimately reaches — is `processGatewayCallback({gateway,
// callback})`, which always logs to payment_events and, only for a verified
// success, delegates to `completeOrderPayment({order, gateway, externalRef})`
// (idempotent, transactional). See that function's own doc comment for the
// exact contract future 9.3-9.6/9.5b drivers integrate against.
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import logger from '../utils/logger.js';
import { sendMail } from '../utils/mailer.js';
import { getPaymentGateway } from '../adapters/payments/index.js';
import * as couponService from './couponService.js';
import * as enrollmentService from './enrollmentService.js';
import * as invoiceService from './invoiceService.js';

const { Order, Coupon, Course, User, Enrollment, Notification, PaymentEvent, BankTransferProof, Setting, sequelize } = db;

const INVOICE_SEQ_KEY = 'invoice_seq';
// docs/03_DATABASE_SCHEMA.md's orders.status ENUM values an order can be in
// BEFORE a successful payment completes it — the only states
// completeOrderPayment() is willing to transition out of. Anything else
// ('paid', 'failed', 'cancelled', 'refunded') is treated as "already
// resolved, do not touch again" — this is what makes a replayed callback (or
// one arriving after e.g. a future admin refund-flag action) a safe no-op
// instead of double-processing. See completeOrderPayment()'s doc comment.
// Exported (docs/07_EXECUTION_PLAN.md 9.5/9.6) so
// services/manualPaymentService.js's own pre-checks (proof upload/submit,
// admin approve/reject) use this SAME list rather than a second, potentially
// drifting copy of it.
export const PAYABLE_STATUSES = ['pending', 'awaiting_verification'];

/**
 * `GET /orders/:id/proof-image`'s URL, keyed purely off `orderId` (never a
 * generated filename/token) — the client-facing counterpart of
 * services/manualPaymentService.js's deterministic on-disk
 * `storage/proofs/order-{orderId}.bin` naming. Exported so
 * manualPaymentService.js (the upload endpoint's `{url}` response AND the
 * bank-proof submit endpoint's `fileUrl`-matches-the-real-upload check) and
 * this file's own `serializeProof()` below compute the IDENTICAL string —
 * see DECISIONS.md 2026-08-05 for the full proof-image storage/serving
 * design writeup.
 */
export function buildProofImageUrl(orderId) {
  return `/api/v1/orders/${orderId}/proof-image`;
}

// ---------------------------------------------------------------------------
// Serialization — matches client/src/types/index.ts's `Order` interface
// exactly (CLAUDE.md §1a: prefer changing the backend to match the
// already-built frontend's existing TS types).
// ---------------------------------------------------------------------------

export function serializeProof(proof) {
  if (!proof) return undefined;
  return {
    id: proof.id,
    orderId: proof.orderId,
    // The RAW `proof.filePath` DB value (services/manualPaymentService.js's
    // internal, deterministic on-disk filename — never a browser-reachable
    // URL, see that file's header) is intentionally NEVER echoed back here.
    // The client only ever gets the authenticated route's URL, computed
    // fresh from `orderId` — this is the exact same "raw disk location is
    // an internal implementation detail, never exposed" discipline
    // services/invoiceService.js already established for invoice PDFs.
    filePath: proof.filePath ? buildProofImageUrl(proof.orderId) : undefined,
    referenceNo: proof.referenceNo ?? undefined,
    note: proof.note ?? undefined,
    status: proof.status,
    reviewedBy: proof.reviewedBy != null ? String(proof.reviewedBy) : undefined,
    reviewedAt: proof.reviewedAt ?? undefined,
    rejectReason: proof.rejectReason ?? undefined,
    createdAt: proof.createdAt,
  };
}

export function serializeOrder(order) {
  return {
    id: order.id,
    invoiceNo: order.invoiceNo,
    userId: order.userId,
    userName: order.user?.name ?? undefined,
    userEmail: order.user?.email ?? undefined,
    courseId: order.courseId,
    courseTitle: order.course?.title ?? undefined,
    amount: Number(order.amount),
    discountAmount: Number(order.discountAmount),
    finalAmount: Number(order.finalAmount),
    currency: order.currency,
    couponId: order.couponId ?? undefined,
    couponCode: order.coupon?.code ?? undefined,
    gateway: order.gateway,
    gatewayRef: order.gatewayRef ?? undefined,
    status: order.status,
    paidAt: order.paidAt ?? undefined,
    createdAt: order.createdAt,
    proof: serializeProof(order.bankTransferProof),
  };
}

// Exported (docs/07_EXECUTION_PLAN.md 9.5/9.6) so
// services/manualPaymentService.js's own queries (the admin queue list,
// reloading an order after approve/reject) include the SAME association set
// `serializeOrder()` expects — a second, independently-maintained copy of
// this list would silently drift the moment a new association is added here.
export const ORDER_ASSOCIATIONS = [
  { model: Course, as: 'course' },
  { model: Coupon, as: 'coupon' },
  { model: User, as: 'user' },
  { model: BankTransferProof, as: 'bankTransferProof' },
];

export async function loadOrderWithAssociations(orderId) {
  return Order.findOne({ where: { id: orderId }, include: ORDER_ASSOCIATIONS });
}

// ---------------------------------------------------------------------------
// POST /checkout/quote
// ---------------------------------------------------------------------------

export async function getQuoteResponse({ courseId, couponCode }) {
  const { course, coupon, price, discount, final } = await couponService.getQuote({ courseId, couponCode });
  return {
    courseId: course.id,
    originalPrice: Number(price),
    discountAmount: Number(discount),
    finalAmount: Number(final),
    couponCode: coupon ? coupon.code : undefined,
    currency: course.currency,
  };
}

// ---------------------------------------------------------------------------
// POST /checkout/orders
// ---------------------------------------------------------------------------

/**
 * ALREADY_ENROLLED gate — same NOT_ENROLLED-adjacent pattern as
 * services/videoService.js#assertEnrolled / studentCourseService.js's local
 * copy, inverted: throws when the user DOES currently have an
 * active-and-unexpired enrollment (a user can have more than one enrollment
 * row for the same course over time — repurchase after expiry, manual admin
 * grant, ... — so this must check ALL of them, not just the latest).
 */
async function assertNotAlreadyEnrolled(userId, courseId) {
  const enrollments = await Enrollment.findAll({ where: { userId, courseId } });
  const now = new Date();
  const active = enrollments.find((e) => e.status === 'active' && new Date(e.expiresAt) > now);
  if (active) {
    throw new ApiError(409, 'ALREADY_ENROLLED', 'You already have an active enrollment for this course.');
  }
}

/** First-ever call for a fresh DB lazily creates the counter row (idempotent under a unique-PK race — see catch below). Must run OUTSIDE the locking transaction below so the row is guaranteed to exist before that transaction's `SELECT ... FOR UPDATE`. */
async function ensureInvoiceSeqRowExists() {
  const existing = await Setting.findByPk(INVOICE_SEQ_KEY);
  if (existing) return;
  try {
    await Setting.create({ key: INVOICE_SEQ_KEY, value: { year: new Date().getUTCFullYear(), seq: 0 } });
  } catch (err) {
    // Unique-PK race: another concurrent caller created the row first,
    // between our findByPk and this create() — the row exists either way,
    // which is all this function promises. Any OTHER error is real.
    if (err?.name !== 'SequelizeUniqueConstraintError') throw err;
  }
}

/**
 * Locked read-modify-write invoice number generator
 * (docs/03_DATABASE_SCHEMA.md "Integrity & operational rules": "orders.invoice_no
 * generated inside a transaction from settings['invoice_seq'] (locked
 * read-modify-write)"). MUST be called from inside an already-open
 * `transaction` — takes a `SELECT ... FOR UPDATE` row lock
 * (`lock: transaction.LOCK.UPDATE`, same mechanism as
 * services/videoService.js's per-user `acquirePlaybackSession` lock) on the
 * single `settings` row keyed `invoice_seq`, so concurrent order-creation
 * calls SERIALIZE on this one row and can never hand out the same/duplicate
 * number, no matter how many race to create an order at once.
 *
 * Assigned at ORDER-CREATION time, not payment-success time (see
 * DECISIONS.md 2026-08-01 for the reasoning) — `orders.invoice_no` is
 * `NOT NULL UNIQUE` from the moment the row is inserted.
 *
 * Format: `SAMS-{year}-{seq, 5-digit zero-padded}`. `seq` resets to 1 on the
 * first invoice of a new UTC calendar year — a judgment call (the schema's
 * own example `SAMS-2026-00001` doesn't state whether numbering is per-year
 * or lifetime-monotonic; per-year is the more common real-world invoicing
 * convention) — see DECISIONS.md 2026-08-01.
 *
 * PRECONDITION: the caller must have already awaited
 * `ensureInvoiceSeqRowExists()` BEFORE opening `transaction` — deliberately
 * NOT called from in here. `ensureInvoiceSeqRowExists()` doesn't participate
 * in `transaction` (it needs to run and commit on its own, before the locked
 * read starts), so calling it from inside an already-open transaction's
 * callback would need a SECOND pool connection while the first is still held
 * open — under enough concurrent order-creation calls that reliably
 * exhausts/deadlocks a bounded connection pool (reproduced during this
 * task's own concurrency test: every request blocked at
 * `acquire: 30000`-ms pool-checkout, mirroring exactly the "second
 * connection needed while the first is held" shape — see DECISIONS.md
 * 2026-08-01).
 */
async function generateInvoiceNo(transaction) {
  const row = await Setting.findOne({
    where: { key: INVOICE_SEQ_KEY },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const currentYear = new Date().getUTCFullYear();
  const current = row.value && typeof row.value === 'object' ? row.value : {};
  let year = current.year ?? currentYear;
  let seq = current.seq ?? 0;
  if (year !== currentYear) {
    year = currentYear;
    seq = 0;
  }
  seq += 1;

  await row.update({ value: { year, seq } }, { transaction });
  return `SAMS-${year}-${String(seq).padStart(5, '0')}`;
}

/**
 * POST /checkout/orders. Creates a `pending` order using the EXACT SAME
 * quote math as getQuoteResponse() (both ultimately call
 * couponService.resolveCoupon + couponService.computeQuoteAmounts — see
 * couponService.js's header), then calls the resolved gateway driver's
 * `createCheckout(order)`.
 *
 * Check order: gateway availability (cheapest, zero DB queries) -> course
 * exists+published -> ALREADY_ENROLLED -> coupon resolution -> the
 * invoice-numbered order INSERT (its own short transaction) -> the gateway's
 * `createCheckout` call (deliberately OUTSIDE that transaction — a real
 * driver may do real network I/O here, which must never hold a DB
 * transaction/row-lock open).
 */
export async function createOrder({ userId, courseId, couponCode, gateway }) {
  const paymentGateway = getPaymentGateway(gateway);

  const course = await Course.findOne({ where: { id: courseId, isPublished: true } });
  if (!course) {
    throw new ApiError(404, 'NOT_FOUND', 'Course not found.');
  }

  await assertNotAlreadyEnrolled(userId, courseId);

  const coupon = await couponService.resolveCoupon(couponCode, course.id);
  const amounts = couponService.computeQuoteAmounts(course.price, coupon);

  // Must complete (its own, separate, already-committed operation) BEFORE
  // the transaction below opens — see generateInvoiceNo's doc comment for
  // why nesting this inside that transaction's callback is a connection-pool
  // deadlock risk under concurrency, not just a style preference.
  await ensureInvoiceSeqRowExists();

  const createdOrder = await sequelize.transaction(async (transaction) => {
    const invoiceNo = await generateInvoiceNo(transaction);
    return Order.create(
      {
        invoiceNo,
        userId,
        courseId: course.id,
        amount: amounts.price,
        discountAmount: amounts.discount,
        finalAmount: amounts.final,
        currency: course.currency,
        couponId: coupon ? coupon.id : null,
        gateway,
        status: 'pending',
      },
      { transaction }
    );
  });

  const checkoutResult = await paymentGateway.createCheckout(createdOrder);

  const fullOrder = await loadOrderWithAssociations(createdOrder.id);
  return { order: serializeOrder(fullOrder), ...checkoutResult };
}

// ---------------------------------------------------------------------------
// GET /orders, GET /orders/:id, GET /orders/:id/invoice.pdf
// ---------------------------------------------------------------------------

export async function listOrdersForUser(userId) {
  const orders = await Order.findAll({
    where: { userId },
    order: [['id', 'DESC']],
    include: ORDER_ASSOCIATIONS,
  });
  return orders.map(serializeOrder);
}

/**
 * IDOR check shared by getOrderForViewer/getInvoiceFileForViewer: owner or
 * admin only. Exported (docs/07_EXECUTION_PLAN.md 9.5/9.6) so
 * services/manualPaymentService.js's own `GET /orders/:id/proof-image`
 * viewer check reuses this SAME rule rather than a second, subtly-different
 * copy of it.
 */
export function assertViewerCanAccessOrder(order, viewer) {
  if (viewer.role === 'admin') return;
  if (order.userId !== viewer.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to view this order.');
  }
}

export async function getOrderForViewer(orderId, viewer) {
  const order = await loadOrderWithAssociations(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  assertViewerCanAccessOrder(order, viewer);
  return serializeOrder(order);
}

/**
 * GET /orders/:id/invoice.pdf's business logic. The PDF is generated
 * on-demand (self-healing — see invoiceService.js#getOrCreateInvoicePdfPath)
 * regardless of the order's current status; invoice_no exists from order
 * CREATION (see generateInvoiceNo's doc comment), so there is always a
 * well-defined filename to look up even for a still-pending order.
 */
export async function getInvoiceFileForViewer(orderId, viewer) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  assertViewerCanAccessOrder(order, viewer);
  const course = await Course.findByPk(order.courseId);
  const user = await User.findByPk(order.userId);
  const filePath = await invoiceService.getOrCreateInvoicePdfPath(order, course, user);
  return { order, filePath };
}

// ---------------------------------------------------------------------------
// THE SHARED PAYMENT-SUCCESS PATH
// ---------------------------------------------------------------------------

// MINIMAL Phase 9.2 "purchase confirmed" notification — docs/07_EXECUTION_PLAN.md
// 10.1 builds the real notificationService (create+email TEMPLATES for every
// trigger: purchase, bank approve/reject, expiry, new-device,
// password-changed) and should refactor THIS call site to go through it
// instead of duplicating logic — this is deliberately just enough to satisfy
// this phase's own "purchase confirmed" AC (task brief), not that service.
async function sendPurchaseConfirmation({ order, course, user }) {
  await Notification.create({
    userId: order.userId,
    type: 'purchase_paid',
    title: 'Purchase confirmed',
    body: `Your enrollment in "${course?.title ?? `course #${order.courseId}`}" is now active. Invoice ${order.invoiceNo}.`,
    link: `/order/${order.id}/status`,
    isRead: false,
  });

  if (user?.email) {
    await sendMail({
      to: user.email,
      subject: 'Your SAMS Academy purchase is confirmed',
      text:
        `Hi ${user.name},\n\n` +
        `Thanks for your purchase! Your enrollment in "${course?.title ?? `course #${order.courseId}`}" is now active.\n\n` +
        `Invoice: ${order.invoiceNo}\n` +
        `Amount paid: ${order.finalAmount} ${order.currency}\n\n` +
        `You can view your invoice any time from your Orders page.`,
    });
  }
}

/** Runs strictly AFTER completeOrderPayment's DB transaction has committed — invoice PDF generation is file I/O and email is network I/O, neither should hold a DB transaction/row-lock open. Failures here are logged, not thrown — the order/enrollment/coupon-redemption already committed successfully and must not be undone just because, say, disk was briefly full. GET /orders/:id/invoice.pdf self-heals via invoiceService's get-or-create if this step's PDF generation failed. */
async function finalizeSuccessfulOrder(order, course) {
  const user = await User.findByPk(order.userId);
  await invoiceService.getOrCreateInvoicePdfPath(order, course, user);
  await sendPurchaseConfirmation({ order, course, user });
}

/**
 * THE single shared success path (docs/02_ARCHITECTURE.md §7: "On verified
 * success (single code path for all gateways): mark order paid -> create
 * enrollment -> generate invoice PDF -> notification + email"). Called ONLY
 * for an already-verified successful payment (caller — processGatewayCallback
 * below — has already confirmed `status==='success' && signatureValid`).
 *
 * Idempotent / replay-safe: everything that mutates state (order status,
 * coupon.used_count, enrollment creation) happens inside ONE transaction
 * that row-locks the order FIRST (`SELECT ... FOR UPDATE`), then only
 * proceeds if the order is still in a pre-payment state
 * (`PAYABLE_STATUSES` — 'pending' or 'awaiting_verification'). Any other
 * current status (already 'paid' — the ordinary replayed-callback case; or
 * 'failed'/'cancelled'/'refunded' — e.g. a stale success callback arriving
 * AFTER a future admin refund-flag action) is treated as "already resolved,
 * do NOT run the side effects again" and returns `alreadyProcessed: true`
 * with zero writes.
 *
 * (docs/04_API_SPEC.md §8 / this task's brief describe idempotency as keyed
 * on `(gateway, external_ref)`; this implementation achieves that same
 * guarantee via the order's own row-locked status instead of a uniqueness
 * check against `payment_events` — deliberately, because
 * `payment_events.idx_pe_ext (gateway, external_ref)` is a plain INDEX, not
 * a UNIQUE constraint: the schema intentionally allows multiple event rows
 * per (gateway, external_ref) so replays/attempts stay fully audit-logged
 * rather than being silently rejected at the DB level. See DECISIONS.md
 * 2026-08-01.)
 *
 * Coupon redemption race safety: if `order.couponId` is set, the coupon row
 * is ALSO locked (`SELECT ... FOR UPDATE`) inside the same transaction and
 * re-checked against `max_uses` — a coupon that a CONCURRENT order's success
 * path fully redeemed in the gap between this order's creation and this
 * payment completing throws `409 COUPON_EXHAUSTED` here, rolling back this
 * whole transaction (the order is left exactly as it was — NOT marked paid,
 * NOT enrolled — see processGatewayCallback's catch for how this surfaces to
 * the caller without ever crashing a webhook/return route).
 *
 * @param {object} params
 * @param {import('../models/Order.js').default} params.order - the order row (may be stale; re-fetched+locked inside the transaction)
 * @param {string} params.gateway - gateway code, e.g. 'mock' | 'jazzcash' | ...
 * @param {string|null} [params.externalRef] - the gateway's own transaction/reference id, stored onto `orders.gateway_ref`
 * @returns {Promise<{order: import('../models/Order.js').default, enrollment?: object, course?: object, alreadyProcessed: boolean}>}
 */
export async function completeOrderPayment({ order, gateway: _gateway, externalRef }) {
  const txResult = await sequelize.transaction(async (transaction) => {
    const lockedOrder = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lockedOrder) {
      throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    }

    if (!PAYABLE_STATUSES.includes(lockedOrder.status)) {
      return { order: lockedOrder, alreadyProcessed: true, enrollment: null, course: null };
    }

    let coupon = null;
    if (lockedOrder.couponId) {
      coupon = await Coupon.findByPk(lockedOrder.couponId, { transaction, lock: transaction.LOCK.UPDATE });
      if (coupon && coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        throw new ApiError(
          409,
          'COUPON_EXHAUSTED',
          'This coupon was fully redeemed by a concurrent order before this payment could be completed.'
        );
      }
    }

    lockedOrder.status = 'paid';
    lockedOrder.paidAt = new Date();
    if (externalRef) lockedOrder.gatewayRef = externalRef;
    await lockedOrder.save({ transaction });

    if (coupon) {
      coupon.usedCount += 1;
      await coupon.save({ transaction });
    }

    const course = await Course.findByPk(lockedOrder.courseId, { transaction });
    const enrollment = await enrollmentService.createEnrollmentFromOrder({ order: lockedOrder, course, transaction });

    return { order: lockedOrder, enrollment, course, alreadyProcessed: false };
  });

  if (!txResult.alreadyProcessed) {
    try {
      await finalizeSuccessfulOrder(txResult.order, txResult.course);
    } catch (err) {
      logger.error(`[orders] post-payment finalize (invoice/email/notification) failed for order ${txResult.order.id}: ${err.message}`);
    }
  }

  return txResult;
}

/**
 * Single entry point every controller (checkout-return handler, webhook
 * handler) calls for EVERY gateway callback result — success or failure,
 * verified or not. ALWAYS logs to `payment_events` (raw payload + the
 * `signature_valid` flag the driver reported) exactly once per call — this
 * is what satisfies "log every payment event... to payment_events" even for
 * forged/failed attempts. Only for a genuinely verified success
 * (`status==='success' && signatureValid && orderRef resolves to a real
 * order`) does it go on to run completeOrderPayment(). Never throws — a
 * route calling this must always be able to respond gracefully to the
 * gateway/browser regardless of internal outcome (docs/04_API_SPEC.md §5:
 * webhook "Always 200 to gateway").
 */
export async function processGatewayCallback({ gateway, callback }) {
  const { orderRef, status, externalRef, signatureValid, raw, eventType } = callback;

  const order = orderRef ? await Order.findByPk(orderRef) : null;

  await PaymentEvent.create({
    orderId: order ? order.id : null,
    gateway,
    eventType: eventType || (status === 'success' ? 'payment.success' : 'payment.failed'),
    externalRef: externalRef ?? null,
    payload: raw ?? {},
    signatureValid: Boolean(signatureValid),
  });

  if (status !== 'success' || !signatureValid || !order) {
    return { order, processed: false };
  }

  try {
    const result = await completeOrderPayment({ order, gateway, externalRef });
    return { order: result.order, enrollment: result.enrollment, processed: !result.alreadyProcessed };
  } catch (err) {
    logger.error(`[orders] completeOrderPayment failed for order ${order.id} (gateway=${gateway}): ${err.message}`);
    return { order, processed: false, error: err };
  }
}

// ---------------------------------------------------------------------------
// GET /checkout/return/:gateway, POST /webhooks/payments/:gateway
// ---------------------------------------------------------------------------

/**
 * GET /checkout/return/:gateway's business logic. Resolves the driver,
 * verifies+processes the callback via processGatewayCallback(), and returns
 * the order id the controller should redirect the browser to
 * (`/order/:id/status`) — or `null` if nothing usable could be recovered at
 * all (unknown/unconfigured gateway, or the callback carried no order
 * reference whatsoever), in which case the controller falls back to
 * redirecting to `/checkout`. NEVER throws — a browser-facing return route
 * must always end in a redirect, never a raw JSON error page.
 */
export async function handleGatewayReturn(gatewayCode, req) {
  let orderIdForRedirect = req.query?.orderId ?? req.body?.orderId ?? null;
  try {
    const driver = getPaymentGateway(gatewayCode);
    const callback = await driver.handleCallback(req);
    orderIdForRedirect = callback.orderRef ?? orderIdForRedirect;
    await processGatewayCallback({ gateway: gatewayCode, callback });
  } catch (err) {
    logger.warn(`[orders] return handler failed for gateway=${gatewayCode}: ${err.message}`);
  }
  return orderIdForRedirect ? String(orderIdForRedirect) : null;
}

/** POST /webhooks/payments/:gateway's business logic. NEVER throws — the controller must always respond 200 to the gateway regardless of internal outcome (docs/04_API_SPEC.md §5). */
export async function handleGatewayWebhook(gatewayCode, req) {
  try {
    const driver = getPaymentGateway(gatewayCode);
    const callback = await driver.handleCallback(req);
    await processGatewayCallback({ gateway: gatewayCode, callback });
  } catch (err) {
    logger.warn(`[orders] webhook handler failed for gateway=${gatewayCode}: ${err.message}`);
  }
}

export default {
  getQuoteResponse,
  createOrder,
  listOrdersForUser,
  getOrderForViewer,
  getInvoiceFileForViewer,
  completeOrderPayment,
  processGatewayCallback,
  handleGatewayReturn,
  handleGatewayWebhook,
  // Reused by services/manualPaymentService.js (docs/07_EXECUTION_PLAN.md 9.5/9.6) —
  // see each export's own doc comment above.
  PAYABLE_STATUSES,
  ORDER_ASSOCIATIONS,
  serializeOrder,
  serializeProof,
  buildProofImageUrl,
  loadOrderWithAssociations,
  assertViewerCanAccessOrder,
};
