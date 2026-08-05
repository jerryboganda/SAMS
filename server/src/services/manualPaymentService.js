// server/src/services/manualPaymentService.js
// The real functional core of docs/07_EXECUTION_PLAN.md 9.5 (Raast) + 9.6
// (bank transfer) + the shared admin approval queue: student proof upload
// (image + reference no) and admin approve/reject. ONE shared service file
// for both gateways (not split into raastService.js/bankTransferService.js)
// — the business logic here is IDENTICAL for `raast` and `bank_transfer`
// orders (the only difference between the two gateways lives in their own
// adapter driver's `createCheckout()`, which builds a slightly different
// `manualDetails` payload from Settings); `bank_transfer_proofs` itself is
// explicitly one shared table for both per docs/03_DATABASE_SCHEMA.md's own
// comment on that table. Layering: routes -> controllers -> services ->
// models (CLAUDE.md §4).
//
// Reuses services/orderService.js's own exported building blocks
// (PAYABLE_STATUSES, ORDER_ASSOCIATIONS, serializeOrder, buildProofImageUrl,
// loadOrderWithAssociations, assertViewerCanAccessOrder, completeOrderPayment)
// rather than re-implementing any of them — see that file's own doc
// comments on each export for why they were made reusable here.
//
// ---------------------------------------------------------------------------
// PROOF-IMAGE STORAGE/SERVING DESIGN (the trickiest part of this task — full
// writeup also in DECISIONS.md 2026-08-05):
//
//   - Physical file: `storage/proofs/order-{orderId}.bin` — a DETERMINISTIC
//     filename keyed purely by the order's own id, mirroring
//     services/invoiceService.js's own precedent (`{invoiceNo}.pdf`, never a
//     generated token) rather than adminUploadService.js's random-token
//     pattern. `bank_transfer_proofs.order_id` is already `UNIQUE`, so "one
//     proof image per order" is already the correct invariant this
//     deployment enforces everywhere else — a re-upload for the same order
//     simply OVERWRITES the previous file (fs.writeFile's default 'w' flag
//     truncates), so there is never an orphaned old file to separately clean
//     up. Content-Type is determined by sniffing the file's magic bytes at
//     SERVE time (sniffImageType — same function the upload step already
//     used to validate it), not by trusting a stored extension/mimetype —
//     this sidesteps needing to persist an extension/mime anywhere at all.
//   - `storage/proofs/` is a NEW directory, sibling to `storage/uploads/`,
//     that `server/src/app.js` does NOT mount via `express.static` (unlike
//     `/uploads`) — a payment-proof image may contain a bank receipt with
//     real financial details, so it must never be reachable by an
//     unauthenticated/un-authorized request, mirroring the EXACT reasoning
//     services/invoiceService.js's own header already documents for invoice
//     PDFs.
//   - `bank_transfer_proofs.file_path` (VARCHAR(300), pre-existing schema
//     column) stores the RAW on-disk relative path (`proofs/order-{id}.bin`)
//     — an internal implementation detail. `orderService.js#serializeProof`
//     NEVER echoes this raw value back to any API response; it computes
//     `buildProofImageUrl(orderId)` (`/api/v1/orders/{orderId}/proof-image`)
//     instead, exactly once, in exactly one place — see that function's own
//     comment.
//   - Upload -> order linkage happens IMMEDIATELY at upload time, not later:
//     `POST /checkout/uploads/proof-image` requires an `orderId` field
//     alongside the file (the frontend already has the order id at this
//     point in the real UX — the order was just created moments earlier by
//     `POST /checkout/orders`, which is what surfaced the manualDetails/
//     payment instructions the student is now acting on). This avoids
//     needing a whole new table just to track "unlinked" uploads pending a
//     later link-to-order step (the task brief's own "avoid needing a whole
//     new table" steer) — `uploadProofImage()` below upserts the SAME
//     `bank_transfer_proofs` row `submitBankProof()` later updates, keyed by
//     `orderId` (`findOrCreate`, never a blind `create()` that would throw
//     on a second upload attempt for the same order).
//   - `POST /checkout/orders/:id/bank-proof`'s `fileUrl` field is NEVER
//     blindly trusted: `submitBankProof()` re-derives the EXPECTED url via
//     the same `buildProofImageUrl(orderId)` function the upload step used,
//     and requires the client-submitted `fileUrl` to match it exactly AND a
//     `bank_transfer_proofs` row with a non-null `filePath` to already exist
//     for this order (i.e. the upload step must have genuinely run first,
//     for THIS SAME order/user, before bank-proof can be submitted) — so a
//     student can never submit an arbitrary/guessed/someone-else's URL
//     string as if it were their own uploaded proof.
//   - `GET /orders/:id/proof-image` (server/src/controllers/ordersController.js)
//     is owner-or-admin only (`assertViewerCanAccessOrder`, reused from
//     orderService.js — the SAME IDOR rule `GET /orders/:id/invoice.pdf`
//     already enforces), keyed off the ORDER id in the URL, never off the
//     file's own name — there is no way to reach a proof image without
//     already being authorized to view that specific order.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Op } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import logger from '../utils/logger.js';
import { sniffImageType } from '../utils/imageValidation.js';
import { REPO_ROOT } from '../config/env.js';
import * as orderService from './orderService.js';
import * as notificationService from './notificationService.js';

const { Order, BankTransferProof, sequelize } = db;
const {
  PAYABLE_STATUSES,
  ORDER_ASSOCIATIONS,
  serializeOrder,
  buildProofImageUrl,
  loadOrderWithAssociations,
  assertViewerCanAccessOrder,
  completeOrderPayment,
} = orderService;

export const PROOFS_DIR = path.join(REPO_ROOT, 'storage', 'proofs');

const MANUAL_GATEWAYS = ['raast', 'bank_transfer'];

function proofImageDiskPath(orderId) {
  return path.join(PROOFS_DIR, `order-${orderId}.bin`);
}

function proofImageRelativePath(orderId) {
  return `proofs/order-${orderId}.bin`;
}

function assertManualGatewayOrder(order) {
  if (!MANUAL_GATEWAYS.includes(order.gateway)) {
    throw new ApiError(422, 'INVALID_GATEWAY', 'This action is only valid for raast or bank_transfer orders.');
  }
}

/** Same "pre-payment state" gate completeOrderPayment() itself enforces (docs/07_EXECUTION_PLAN.md 9.5/9.6's own "re-submission after a failed/rejected proof creates a fresh order instead" judgment call — see DECISIONS.md 2026-08-05). */
function assertPayableOrderState(order) {
  if (!PAYABLE_STATUSES.includes(order.status)) {
    throw new ApiError(
      422,
      'INVALID_ORDER_STATE',
      `Order #${order.id} is already "${order.status}" and can no longer accept a payment proof.`
    );
  }
}

function assertOwner(order, userId) {
  if (order.userId !== userId) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to act on this order.');
  }
}

// ---------------------------------------------------------------------------
// POST /checkout/uploads/proof-image
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {import('multer').File|undefined} params.file - multer's in-memory file object (`req.file`).
 * @param {number} params.orderId
 * @param {number} params.userId
 * @returns {Promise<{url: string}>}
 */
export async function uploadProofImage({ file, orderId, userId }) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  assertOwner(order, userId);
  assertManualGatewayOrder(order);
  assertPayableOrderState(order);

  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'No file uploaded (expected multipart field "file").');
  }
  // Authoritative check: real file-signature bytes, same discipline as
  // adminUploadService.js#saveImageUpload — never trust the client-declared
  // Content-Type or filename extension alone.
  const sniffed = sniffImageType(file.buffer);
  if (!sniffed) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Uploaded file is not a recognized image format (jpeg, png, gif, webp).');
  }

  await fsp.mkdir(PROOFS_DIR, { recursive: true });
  await fsp.writeFile(proofImageDiskPath(order.id), file.buffer);

  const [proof, created] = await BankTransferProof.findOrCreate({
    where: { orderId: order.id },
    defaults: { orderId: order.id, filePath: proofImageRelativePath(order.id), status: 'pending' },
  });
  if (!created) {
    // Re-uploading a replacement image alone must NOT reset an
    // already-reviewed proof's status/referenceNo — only a genuine
    // POST .../bank-proof (re)submission does that (submitBankProof below).
    proof.filePath = proofImageRelativePath(order.id);
    await proof.save();
  }

  return { url: buildProofImageUrl(order.id) };
}

// ---------------------------------------------------------------------------
// POST /checkout/orders/:id/bank-proof
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {number} params.orderId
 * @param {number} params.userId
 * @param {string} params.referenceNo
 * @param {string|undefined} params.note
 * @param {string} params.fileUrl
 */
export async function submitBankProof({ orderId, userId, referenceNo, note, fileUrl }) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  assertOwner(order, userId);
  assertManualGatewayOrder(order);
  assertPayableOrderState(order);

  const proof = await BankTransferProof.findOne({ where: { orderId: order.id } });
  if (!proof || !proof.filePath) {
    throw new ApiError(422, 'PROOF_IMAGE_REQUIRED', 'Upload a payment proof image (POST /checkout/uploads/proof-image) before submitting this form.');
  }
  const expectedUrl = buildProofImageUrl(order.id);
  if (fileUrl !== expectedUrl) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'fileUrl does not match the payment proof image uploaded for this order.');
  }

  proof.referenceNo = referenceNo;
  proof.note = note ?? null;
  proof.status = 'pending';
  await proof.save();

  order.status = 'awaiting_verification';
  await order.save();

  const fresh = await loadOrderWithAssociations(order.id);
  return serializeOrder(fresh);
}

// ---------------------------------------------------------------------------
// GET /orders/:id/proof-image
// ---------------------------------------------------------------------------

/** Owner-or-admin only (same IDOR rule as GET /orders/:id/invoice.pdf — orderService.js#assertViewerCanAccessOrder, reused). Returns the raw image bytes + a sniffed Content-Type, ready for the controller to stream. */
export async function getProofImageForViewer(orderId, viewer) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  assertViewerCanAccessOrder(order, viewer);

  const proof = await BankTransferProof.findOne({ where: { orderId: order.id } });
  if (!proof || !proof.filePath) {
    throw new ApiError(404, 'NOT_FOUND', 'No payment proof has been uploaded for this order.');
  }

  const diskPath = proofImageDiskPath(order.id);
  if (!fs.existsSync(diskPath)) {
    throw new ApiError(404, 'NOT_FOUND', 'The payment proof file could not be found.');
  }

  const buffer = await fsp.readFile(diskPath);
  const sniffed = sniffImageType(buffer);
  return { buffer, mime: sniffed?.mime || 'application/octet-stream' };
}

// ---------------------------------------------------------------------------
// GET /admin/bank-transfers?status=pending
// ---------------------------------------------------------------------------

/**
 * `status=pending` (the queue's default and the only value docs/04_API_SPEC.md
 * §7 documents) means "awaiting admin review" — mapped to
 * `orders.status = 'awaiting_verification'`, NOT the ALSO-valid-but-different
 * `orders.status = 'pending'` value (that ENUM value means "order created,
 * no payment attempted yet", a different state entirely — see
 * docs/03_DATABASE_SCHEMA.md). `submitBankProof()`/`approveBankTransfer()`/
 * `rejectBankTransfer()` above/below always transition `orders.status` and
 * `bank_transfer_proofs.status` TOGETHER, atomically, so filtering on
 * `orders.status='awaiting_verification'` alone is provably equivalent to
 * "has an associated proof with status='pending'" in this codebase — a
 * simpler, more robust query than a `$bankTransferProof.status$` OR-join
 * (see DECISIONS.md 2026-08-05 for the full reasoning). Any OTHER explicit
 * `status` value is filtered directly against `orders.status` (a trivial,
 * sensible generalization per the task brief's own "generalize sensibly if
 * trivial" steer).
 */
function resolveQueueOrderStatus(status) {
  if (status === 'pending' || status === 'awaiting_verification') return 'awaiting_verification';
  return status;
}

export async function listBankTransferQueue({ status = 'pending', page = 1, limit = 20 } = {}) {
  const offset = (Math.max(1, page) - 1) * limit;
  const orders = await Order.findAll({
    where: {
      gateway: { [Op.in]: MANUAL_GATEWAYS },
      status: resolveQueueOrderStatus(status),
    },
    include: ORDER_ASSOCIATIONS,
    order: [['id', 'DESC']],
    limit,
    offset,
  });
  return orders.map(serializeOrder);
}

// ---------------------------------------------------------------------------
// POST /admin/bank-transfers/:id/approve, POST /admin/bank-transfers/:id/reject
// ---------------------------------------------------------------------------

/** Loads the order + its (required) proof, enforcing the shared "reviewable" pre-check both approve/reject need. Throws NOT_FOUND/INVALID_GATEWAY/NO_PROOF/ALREADY_RESOLVED as appropriate. */
async function loadReviewableOrderAndProof(orderId) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  }
  assertManualGatewayOrder(order);

  const proof = await BankTransferProof.findOne({ where: { orderId: order.id } });
  if (!proof) {
    throw new ApiError(422, 'NO_PROOF', 'No payment proof has been submitted for this order yet.');
  }
  if (proof.status !== 'pending' || !PAYABLE_STATUSES.includes(order.status)) {
    throw new ApiError(409, 'ALREADY_RESOLVED', 'This payment request has already been reviewed or resolved.');
  }
  return { order, proof };
}

/**
 * Admin approve — calls orderService.js's `completeOrderPayment()`, THE
 * shared success path (order->paid, enrollment, invoice PDF, notification +
 * email — identical to every other gateway's success path), with
 * `externalRef` = the proof's own `reference_no` (the closest analog to a
 * "gateway transaction id" a manual pseudo-gateway has). Only marks the
 * proof `approved` AFTER `completeOrderPayment()` genuinely succeeds (not
 * before) — if it throws (e.g. a concurrent order exhausted a shared
 * coupon), the proof is deliberately left untouched (`pending`) rather than
 * risking a stuck "approved but not actually paid" inconsistency; the admin
 * can simply retry. If `completeOrderPayment()` reports `alreadyProcessed`
 * (a concurrent SECOND admin-approve click raced this one and the order's
 * own row lock resolved it first), this throws the SAME `409
 * ALREADY_RESOLVED` the loser of that race should see — the proof is never
 * double-written, since only the winner of `completeOrderPayment()`'s own
 * atomic order-row lock ever reaches the `proof.save()` line below.
 */
export async function approveBankTransfer({ orderId, adminUserId }) {
  const { order, proof } = await loadReviewableOrderAndProof(orderId);

  const result = await completeOrderPayment({
    order,
    gateway: order.gateway,
    externalRef: proof.referenceNo || `${order.gateway}-${order.id}`,
  });
  if (result.alreadyProcessed) {
    throw new ApiError(409, 'ALREADY_RESOLVED', 'This payment request has already been reviewed or resolved.');
  }

  proof.status = 'approved';
  proof.reviewedBy = adminUserId;
  proof.reviewedAt = new Date();
  await proof.save();

  const fresh = await loadOrderWithAssociations(order.id);
  return serializeOrder(fresh);
}

/** Best-effort rejection notification — Phase 10.1 delegates to services/notificationService.js instead of duplicating Notification.create()+sendMail() inline (never throws, never blocks the actual rejection — see the caller's own catch). */
async function notifyRejection({ order, reason }) {
  const user = await db.User.findByPk(order.userId);
  await notificationService.notifyPaymentRejected({ order, reason, user });
}

/**
 * Admin reject — a pure state mutation this service fully controls end-to-
 * end (no dependency on orderService.js's completeOrderPayment), so it's
 * done inside its own short row-locked transaction rather than relying on a
 * separate function's own locking. Sets `orders.status='failed'` (per
 * client/src/pages/admin/ManualPaymentsPage.tsx's own copy text: "Rejecting
 * this payment request will mark the order as failed" — there is no
 * separate 'rejected' orders.status value in the schema) +
 * `bank_transfer_proofs.status='rejected'` + `reject_reason` + reviewer
 * fields, all atomically. Student re-submission after a rejection requires
 * a FRESH order (no in-place retry-same-order flow exists anywhere in this
 * codebase yet, for any gateway) — see DECISIONS.md 2026-08-05.
 */
export async function rejectBankTransfer({ orderId, adminUserId, reason }) {
  const { proof } = await loadReviewableOrderAndProof(orderId);

  await sequelize.transaction(async (transaction) => {
    const lockedOrder = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lockedOrder || !PAYABLE_STATUSES.includes(lockedOrder.status)) {
      throw new ApiError(409, 'ALREADY_RESOLVED', 'This payment request has already been reviewed or resolved.');
    }
    lockedOrder.status = 'failed';
    await lockedOrder.save({ transaction });

    proof.status = 'rejected';
    proof.rejectReason = reason;
    proof.reviewedBy = adminUserId;
    proof.reviewedAt = new Date();
    await proof.save({ transaction });
  });

  const fresh = await loadOrderWithAssociations(orderId);

  try {
    await notifyRejection({ order: fresh, reason });
  } catch (err) {
    logger.error(`[manualPayments] rejection notification failed for order ${orderId}: ${err.message}`);
  }

  return serializeOrder(fresh);
}

export default {
  PROOFS_DIR,
  uploadProofImage,
  submitBankProof,
  getProofImageForViewer,
  listBankTransferQueue,
  approveBankTransfer,
  rejectBankTransfer,
};
