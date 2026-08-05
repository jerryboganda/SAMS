// server/src/routes/v1/admin/bankTransfers.js
// GET /admin/bank-transfers, POST /admin/bank-transfers/:id/approve|reject
// (docs/07_EXECUTION_PLAN.md 9.5/9.6, docs/04_API_SPEC.md §7). auth/
// deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js.
// approve/reject are audited (CLAUDE.md §6: "audit-log every admin
// mutation") — wiring copied from routes/v1/admin/settings.js's own
// audit(...) usage.
import { Router } from 'express';
import * as adminBankTransferController from '../../../controllers/adminBankTransferController.js';
import { audit } from '../../../middleware/audit.js';

const router = Router();

router.get('/bank-transfers', adminBankTransferController.listQueue);

router.post(
  '/bank-transfers/:id/approve',
  audit('bank_transfer.approve', 'order', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Approved manual payment for order #${req.params.id}`,
  }),
  adminBankTransferController.approve
);

router.post(
  '/bank-transfers/:id/reject',
  audit('bank_transfer.reject', 'order', {
    entityId: (req) => Number(req.params.id),
    summary: (req) => `Rejected manual payment for order #${req.params.id}: "${req.body?.reason ?? ''}"`,
  }),
  adminBankTransferController.reject
);

export default router;
