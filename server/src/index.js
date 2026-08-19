// server/src/index.js
// Boot sequence: env -> db connect attempt (non-fatal) -> cron registration
// -> express.listen. Reads PORT from env, binds 0.0.0.0, trusts the
// reverse proxy (Hostinger sits behind one) so rate-limit/IP logging see
// real client IPs. Also owns process-level lifecycle: graceful shutdown on
// SIGTERM/SIGINT + uncaught-exception/unhandled-rejection handlers (Phase
// 12.3, docs/10_SECURITY_CHECKLIST.md §H: "Graceful shutdown (finish
// requests, close DB); global unhandled-rejection handler"). Note: the
// jest/supertest suite imports app.js directly, never this file (per
// app.js's own header comment), so none of the code below is exercised by
// `npm run test` — it's verified by careful reading + manual smoke-testing
// a running dev server (see this file's own PR/task notes), not automated
// coverage.
import app from './app.js';
import { checkDbConnection, sequelize } from './db/sequelize.js';
import { env } from './config/env.js';
import { registerCronJobs } from './jobs/index.js';
import logger from './utils/logger.js';

app.set('trust proxy', 1);

let server;
let shuttingDown = false;

/**
 * Graceful shutdown: stop accepting new connections, let in-flight
 * requests finish (server.close()'s own callback semantics), close the DB
 * pool, then exit cleanly. A hard timeout guarantees the process never
 * hangs forever if a connection gets stuck open (e.g. a slow client on a
 * keep-alive socket) — `server.close()`'s callback only fires once every
 * open connection has ended.
 */
async function shutdown(signal) {
  if (shuttingDown) return; // SIGTERM+SIGINT racing each other, or a double signal — only run once
  shuttingDown = true;

  logger.info(`[server] received ${signal} — starting graceful shutdown.`);

  const forceExitTimer = setTimeout(() => {
    logger.error('[server] graceful shutdown timed out after 10s — forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref?.(); // never itself keep the process alive if everything else already finished

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info('[server] HTTP server closed — no longer accepting new connections.');
    }

    await sequelize.close();
    logger.info('[db] connection pool closed.');

    clearTimeout(forceExitTimer);
    logger.info('[server] graceful shutdown complete.');
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExitTimer);
    logger.error(`[server] error during graceful shutdown: ${err.stack || err.message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An uncaught synchronous exception means some code ran outside any
// try/catch and the process's in-memory state (open transactions, request
// contexts, etc.) is now unknown/unreliable — Node's own docs are explicit
// that resuming normal operation after this is unsafe. Log with full stack,
// then exit immediately (no attempt at graceful shutdown — the process
// state that graceful shutdown itself relies on, e.g. the DB pool, may be
// exactly what's corrupted) and let the process manager (Hostinger's
// Node.js app runner / pm2-equivalent) restart the process fresh.
process.on('uncaughtException', (err) => {
  logger.error(`[server] uncaughtException — exiting: ${err.stack || err.message}`);
  process.exit(1);
});

// Judgment call (docs/10_SECURITY_CHECKLIST.md §H only requires this
// handler to exist and log — it doesn't mandate exiting): log and KEEP
// RUNNING rather than exit. Reasoning: (1) this codebase's own
// utils/logger.js already sets winston's `exitOnError: false`, signaling an
// established "log loudly, keep serving where possible" philosophy for
// this single-process/no-hot-standby Hostinger deployment — there is no
// second instance to fail over to, so an unnecessary exit here is a full
// outage, not a safe failover. (2) Unlike uncaughtException, an unhandled
// promise rejection is scoped to whatever single async operation rejected
// (e.g. one request's awaited call, one cron tick) — it does not imply the
// same process-wide corrupted state a synchronous uncaught exception does,
// so unrelated in-flight requests are very likely still safe to keep
// serving. This does trade off Node's newer guidance (unhandled rejections
// will eventually crash the process by default in future Node versions) for
// availability today; the log line here is what makes any real occurrence
// visible so it gets fixed at the source rather than silently ignored.
process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  logger.error(`[server] unhandledRejection: ${detail}`);
});

async function start() {
  // Non-fatal: the app must boot and serve /api/v1/health (db:false) even
  // if MySQL is unreachable — never crash the process over a DB outage.
  const dbConnected = await checkDbConnection();
  logger.info(`[db] initial connection check: ${dbConnected ? 'connected' : 'unreachable (continuing anyway)'}`);

  if (dbConnected && env.NODE_ENV !== 'test') {
    try {
      const { runAutoMigrations } = await import('./db/autoMigrate.js');
      await runAutoMigrations();
    } catch (err) {
      logger.error(`[db] auto-migration error on startup: ${err.message}`);
    }
  }

  // Phase 8.1+/12.3: question-difficulty denormalization, bounded
  // user_daily_stats reconciliation, enrollment lifecycle sweeps, and the
  // weekly DB backup (server/src/jobs/index.js). Skipped in NODE_ENV=test —
  // the jest/supertest suite imports app.js directly, never this file, so
  // this guard is defense-in-depth against any future test entry point that
  // might import index.js, not something the current suite relies on.
  if (env.NODE_ENV !== 'test') {
    registerCronJobs();
  } else {
    logger.info('[cron] NODE_ENV=test — cron jobs not registered.');
  }

  server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`[server] SAMS Academy API listening on 0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  });
}

start().catch((err) => {
  logger.error(`[server] fatal error during startup: ${err.stack || err.message}`);
  process.exit(1);
});
