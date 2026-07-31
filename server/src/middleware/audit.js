// server/src/middleware/audit.js
// Writes an audit_logs row AFTER a mutation succeeds (docs/02_ARCHITECTURE.md
// §3: "Admin mutations additionally pass `audit` middleware (writes
// audit_logs after success)"). Phase 2 has no admin routes yet (Phase 4+), so
// per the task brief this is wired onto two security-sensitive *self-service*
// mutations instead — POST /auth/2fa/disable and POST /auth/logout-all — see
// DECISIONS.md for why those two were chosen as this phase's real usage.
//
// Implementation: wraps res.json so it only fires for a genuine
// `{success:true, ...}` response in the 2xx range — a thrown ApiError never
// reaches this wrapper (errorHandler.js sends its own res.json first), so
// failed mutations are correctly never audited as successes.
//
// The write is awaited before the response is actually flushed (res.json is
// allowed to return a Promise here — Express doesn't inspect its return
// value, and route handlers never await it either). writeAuditLog() never
// throws (see auditService.js), so this can't hang or turn a mutation into a
// 500 — it just guarantees the audit_logs row exists before the client (or
// a test asserting on it) sees the response, instead of racing an
// unawaited fire-and-forget write against the response being sent.
import writeAuditLog from '../services/auditService.js';

export function audit(action, entityType, opts = {}) {
  return function auditMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body && body.success !== false) {
        const entityId = typeof opts.entityId === 'function' ? opts.entityId(req, body) : (req.user?.id ?? null);
        const summary = typeof opts.summary === 'function' ? opts.summary(req, body) : opts.summary ?? null;
        await writeAuditLog({
          actorUserId: req.user?.id ?? null,
          action,
          entityType,
          entityId,
          summary,
          ip: req.ip,
        });
      }
      return originalJson(body);
    };
    next();
  };
}

export default audit;
