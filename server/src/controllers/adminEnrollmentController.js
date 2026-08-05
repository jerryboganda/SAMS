// server/src/controllers/adminEnrollmentController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond. No
// SQL/ORM calls live here — see services/adminStudentService.js's
// extendEnrollment/revokeEnrollment exports.
// auth/deviceCheck/requireRole('admin') applied at routes/v1/admin/index.js.
//
// Audit wiring judgment call: `PATCH /admin/enrollments/:id` is ONE route
// handling two discriminated actions (`extend`|`revoke` — see
// `enrollmentPatchSchema` below), per docs/04_API_SPEC.md §7's exact
// documented shape ("PATCH /admin/enrollments/:id (extend/revoke)") and the
// task brief's explicit "one route, two actions" instruction.
// middleware/audit.js's `audit(action, entityType, opts)` only accepts a
// STATIC `action` string bound at route-registration time — it can't express
// "log 'enrollment.extend' OR 'enrollment.revoke' depending on what's in
// THIS request's body". Rather than splitting into two sub-path routes
// (which would drift from the single-PATCH-route contract above) or bolting
// a conditional onto audit.js itself (out of this task's file scope), the
// audit write happens directly here via services/auditService.js's
// `writeAuditLog` — the exact same underlying write audit() itself calls
// (docs/02_ARCHITECTURE.md's services/ list explicitly anticipates this:
// "later phases' admin CRUD can call it directly too, not just via the
// middleware wrapper"). Written only after the service call succeeds, same
// "only audit a genuine success" guarantee audit() provides.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as adminStudentService from '../services/adminStudentService.js';
import writeAuditLog from '../services/auditService.js';

// --- Schemas -----------------------------------------------------------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const enrollmentPatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('extend'), days: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('revoke') }),
]);

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ------------------------------------------------------------

export const updateEnrollment = asyncHandler(async (req, res) => {
  const { id } = validateBody(idParamSchema, req.params);
  const body = validateBody(enrollmentPatchSchema, req.body);

  const data =
    body.action === 'extend'
      ? await adminStudentService.extendEnrollment({ enrollmentId: id, days: body.days })
      : await adminStudentService.revokeEnrollment(id);

  await writeAuditLog({
    actorUserId: req.user?.id ?? null,
    action: body.action === 'extend' ? 'enrollment.extend' : 'enrollment.revoke',
    entityType: 'Enrollment',
    entityId: id,
    summary:
      body.action === 'extend'
        ? `Extended enrollment #${id} by +${body.days} days.`
        : `Revoked enrollment #${id}.`,
    ip: req.ip,
  });

  ok(res, data);
});

export default { updateEnrollment };
