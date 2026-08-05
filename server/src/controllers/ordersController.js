// server/src/controllers/ordersController.js
// GET /orders, GET /orders/:id, GET /orders/:id/invoice.pdf
// (docs/04_API_SPEC.md §5). Thin per docs/02_ARCHITECTURE.md: validate(zod)
// -> service -> respond. No SQL/ORM calls live here — see
// services/orderService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as orderService from '../services/orderService.js';
import * as manualPaymentService from '../services/manualPaymentService.js';

const orderIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

export const listMyOrders = asyncHandler(async (req, res) => {
  const data = await orderService.listOrdersForUser(req.user.id);
  ok(res, data);
});

export const getOrder = asyncHandler(async (req, res) => {
  const { id } = validateBody(orderIdParamSchema, req.params);
  const data = await orderService.getOrderForViewer(id, req.user);
  ok(res, data);
});

/**
 * GET /orders/:id/invoice.pdf — owner or admin only (IDOR check lives in
 * orderService.getInvoiceFileForViewer). Streams the REAL PDF file through
 * this authenticated route; the file itself is never reachable via a public
 * static path (see services/invoiceService.js's header) — invoice numbers
 * ARE sequential by design, so access control has to happen here, not via
 * an unguessable filename.
 */
export const downloadInvoice = asyncHandler(async (req, res) => {
  const { id } = validateBody(orderIdParamSchema, req.params);
  const { order, filePath } = await orderService.getInvoiceFileForViewer(id, req.user);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${order.invoiceNo}.pdf"`);
  res.sendFile(filePath);
});

/**
 * GET /orders/:id/proof-image (docs/07_EXECUTION_PLAN.md 9.5/9.6) — owner or
 * admin only (IDOR check lives in orderService.assertViewerCanAccessOrder,
 * reused by manualPaymentService.getProofImageForViewer). Mirrors
 * downloadInvoice() above exactly: the real image bytes are only ever
 * reachable through this authenticated route, never a public static path
 * (services/manualPaymentService.js's own header has the full design
 * writeup) — served as a plain `res.send(buffer)` so a browser `<img src>`
 * request works directly (same-origin httpOnly auth cookies are sent
 * automatically on an `<img>` request, no Authorization header needed).
 */
export const getProofImage = asyncHandler(async (req, res) => {
  const { id } = validateBody(orderIdParamSchema, req.params);
  const { buffer, mime } = await manualPaymentService.getProofImageForViewer(id, req.user);
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
});

export default { listMyOrders, getOrder, downloadInvoice, getProofImage };
