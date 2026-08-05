// server/src/controllers/adminQuestionImportController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/adminQuestionImportService.js.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js;
// audit() applied per-route at routes/v1/admin/questionImport.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminQuestionImportService from '../services/adminQuestionImportService.js';

// --- Schemas -----------------------------------------------------------

// Row shape is intentionally loose (`z.any()`) — the frontend's hand-rolled
// CSV parser produces plain objects keyed by whatever header cells the
// uploaded file happened to have (client/src/pages/admin/
// QBankImportPage.tsx#parseCsvText); adminQuestionImportService.js's
// validateRow() defensively reads every field via optional chaining and
// treats anything missing/malformed as a validation error rather than
// crashing, so no stricter per-field zod shape is needed (or safe — a
// too-strict shape here would reject a row the service could otherwise
// cleanly flag with a human-readable `reason`).
const dryRunBodySchema = z.object({
  parsedRows: z.array(z.any()).max(5000, 'Too many rows in one batch (max 5000).'),
});

const commitBodySchema = z.object({
  validRows: z.array(z.any()).max(5000, 'Too many rows in one batch (max 5000).'),
});

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const dryRunImport = asyncHandler(async (req, res) => {
  const { parsedRows } = validateBody(dryRunBodySchema, req.body);
  const data = await adminQuestionImportService.dryRunImport(parsedRows);
  ok(res, data);
});

export const commitImport = asyncHandler(async (req, res) => {
  const { validRows } = validateBody(commitBodySchema, req.body);
  const data = await adminQuestionImportService.commitImport(validRows);
  ok(res, data);
});

export const getImportTemplate = asyncHandler(async (req, res) => {
  const csv = adminQuestionImportService.getImportTemplate();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="qbank-import-template.csv"');
  res.status(200).send(csv);
});

export default { dryRunImport, commitImport, getImportTemplate };
