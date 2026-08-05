// server/src/services/auditService.js
// Writes audit_logs rows. Kept as its own service (not inlined in the
// middleware) per docs/02_ARCHITECTURE.md's services/ list ("auditService")
// so later phases' admin CRUD can call it directly too, not just via the
// middleware wrapper in middleware/audit.js.
//
// Also home to `listAuditLogs()` (docs/07_EXECUTION_PLAN.md 11.5 — GET
// /admin/audit-logs, the audit-log-viewer half of that task) — added
// alongside `writeAuditLog` in this SAME file rather than a separate one,
// per that task's own explicit instruction.
import logger from '../utils/logger.js';
import db from '../models/index.js';

const { AuditLog, User } = db;

/**
 * Best-effort audit write — never throws (a logging failure must not break
 * the mutation it's describing). Callers that need a guarantee should await
 * it and treat a thrown error as a signal, but the default fire-and-forget
 * use from middleware/audit.js intentionally swallows errors here.
 */
export async function writeAuditLog({ actorUserId = null, action, entityType, entityId = null, summary = null, meta = null, ip = null }) {
  try {
    await AuditLog.create({ actorUserId, action, entityType, entityId, summary, meta, ip });
  } catch (err) {
    logger.error(`[audit] failed to write audit log action=${action} entityType=${entityType}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/audit-logs
// ---------------------------------------------------------------------------

// client/src/pages/admin/AuditLogManagementPage.tsx calls `adminApi.getAuditLogs()`
// with ZERO arguments and does all actor/action/entity/id filtering
// client-side over the full returned array (task brief, confirmed by reading
// that page directly) — same "frontend expects a flat, unfiltered array, not
// a paginated envelope" contract services/adminOrderService.js#listAllOrders
// already established and documented (see that file's own doc comment for
// the full reasoning), reused here rather than re-derived: a fixed safety
// cap applies pagination's SPIRIT without breaking the frontend's existing,
// out-of-scope-to-edit contract.
const ADMIN_AUDIT_LOGS_LIST_CAP = 200;

/**
 * Matches client/src/types/index.ts's `AuditLog` interface exactly:
 * `{ id, actorUserId, actorName, action, entityType, entityId, summary, ip,
 * createdAt }`. `summary`/`ip` are coerced to `""` when the DB column is
 * NULL — the frontend's TS type declares both as required non-optional
 * `string` and AuditLogManagementPage.tsx calls `row.summary.toLowerCase()`
 * unconditionally, so a raw `null` would throw client-side (task brief).
 * `actorName` is left `undefined` (not coerced) for a `null` actorUserId
 * (e.g. a system-triggered audit row) — the TS type itself declares
 * `actorName?: string` as optional, unlike `summary`/`ip`.
 */
function serializeAuditLog(row) {
  return {
    id: row.id,
    actorUserId: row.actorUserId ?? undefined,
    actorName: row.actor?.name ?? undefined,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? undefined,
    summary: row.summary ?? '',
    ip: row.ip ?? '',
    createdAt: row.createdAt,
  };
}

/** Newest-first, capped flat array — see ADMIN_AUDIT_LOGS_LIST_CAP's own doc comment above for why a flat array (not a {data,pagination} envelope) is the correct contract here. */
export async function listAuditLogs() {
  const rows = await AuditLog.findAll({
    include: [{ model: User, as: 'actor', attributes: ['id', 'name'] }],
    order: [['id', 'DESC']],
    limit: ADMIN_AUDIT_LOGS_LIST_CAP,
  });
  return rows.map(serializeAuditLog);
}

export default writeAuditLog;
