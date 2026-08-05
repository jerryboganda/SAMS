// server/src/services/invoiceService.js
// Invoice PDF generation (docs/07_EXECUTION_PLAN.md 9.2) via `pdfkit` (new
// dependency — CLAUDE.md explicitly names it as the lightweight, pure-JS
// (no native binaries — Hostinger shared-hosting safe) choice for this).
// Files are written under storage/invoices/ (gitignored, see .gitignore),
// named deterministically from the order's invoice_no.
//
// SECURITY NOTE (task brief): invoice numbers ARE sequential by design
// (SAMS-2026-00001, ...), so the on-disk FILE must never be reachable via a
// public/guessable static path — unlike storage/uploads (served statically
// by app.js), storage/invoices/ has NO express.static mount. The only way to
// read a PDF is through the authenticated `GET /orders/:id/invoice.pdf`
// route (server/src/controllers/ordersController.js), which checks
// owner-or-admin BEFORE ever calling into this file — see
// orderService.js#getInvoiceFileForViewer.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { REPO_ROOT } from '../config/env.js';

export const INVOICES_DIR = path.join(REPO_ROOT, 'storage', 'invoices');

/** `invoiceNo` is our own generator's output (`SAMS-{year}-{seq}`, already filename-safe) — sanitized defensively anyway before touching the filesystem. */
function invoiceFilePath(invoiceNo) {
  const safe = String(invoiceNo).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(INVOICES_DIR, `${safe}.pdf`);
}

/** Renders and writes a simple, functional invoice PDF for `order` to disk. Overwrites if one already exists (e.g. regenerating after a manual admin correction). */
export async function generateInvoicePdf({ order, course, user }) {
  await fsp.mkdir(INVOICES_DIR, { recursive: true });
  const filePath = invoiceFilePath(order.invoiceNo);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    doc.fontSize(20).text('SAMS Academy', { align: 'left' });
    doc.fontSize(10).fillColor('#555').text('Secure medical exam-prep LMS', { align: 'left' });
    doc.moveDown(1.5);

    doc.fillColor('#000').fontSize(14).text('Invoice', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Invoice No: ${order.invoiceNo}`);
    doc.text(`Date: ${new Date(order.paidAt || order.createdAt).toUTCString()}`);
    doc.text(`Status: ${order.status}`);
    doc.moveDown(1);

    doc.text('Billed To:');
    doc.text(`${user?.name || 'Student'}`);
    doc.text(`${user?.email || ''}`);
    doc.moveDown(1);

    doc.text('Course:');
    doc.text(`${course?.title || `Course #${order.courseId}`}`);
    doc.moveDown(1);

    doc.text(`Amount: ${order.amount} ${order.currency}`);
    doc.text(`Discount: ${order.discountAmount} ${order.currency}`);
    doc.fontSize(13).text(`Total Paid: ${order.finalAmount} ${order.currency}`, { underline: true });
    doc.moveDown(1);

    doc.fontSize(9).fillColor('#777').text(`Payment gateway: ${order.gateway}${order.gatewayRef ? ` (ref: ${order.gatewayRef})` : ''}`);

    doc.end();
  });

  return filePath;
}

/**
 * Returns the on-disk path to `order`'s invoice PDF, generating it on first
 * access if it doesn't exist yet — self-healing if the automatic
 * post-payment generation (orderService.js's finalizeSuccessfulOrder) ever
 * failed (e.g. a transient disk error), since a caller can simply request
 * the PDF again later and it will be built then. `course`/`user` are passed
 * in by the caller (orderService already has/needs them) rather than
 * re-queried here.
 */
export async function getOrCreateInvoicePdfPath(order, course, user) {
  const filePath = invoiceFilePath(order.invoiceNo);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return generateInvoicePdf({ order, course, user });
}

export default { generateInvoicePdf, getOrCreateInvoicePdfPath, INVOICES_DIR };
