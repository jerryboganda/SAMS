// server/src/services/auditService.js
// Writes audit_logs rows. Kept as its own service (not inlined in the
// middleware) per docs/02_ARCHITECTURE.md's services/ list ("auditService")
// so later phases' admin CRUD can call it directly too, not just via the
// middleware wrapper in middleware/audit.js.
import logger from '../utils/logger.js';
import db from '../models/index.js';

const { AuditLog } = db;

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

export default writeAuditLog;
