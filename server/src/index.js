// server/src/index.js
// Boot sequence: env -> db connect attempt (non-fatal) -> cron placeholder
// -> express.listen. Reads PORT from env, binds 0.0.0.0, trusts the
// reverse proxy (Hostinger sits behind one) so rate-limit/IP logging see
// real client IPs.
import app from './app.js';
import { checkDbConnection } from './db/sequelize.js';
import { env } from './config/env.js';
import { registerCronJobs } from './jobs/index.js';
import logger from './utils/logger.js';

app.set('trust proxy', 1);

async function start() {
  // Non-fatal: the app must boot and serve /api/v1/health (db:false) even
  // if MySQL is unreachable — never crash the process over a DB outage.
  const dbConnected = await checkDbConnection();
  logger.info(`[db] initial connection check: ${dbConnected ? 'connected' : 'unreachable (continuing anyway)'}`);

  // Phase 8.1: question-difficulty denormalization + bounded user_daily_stats
  // reconciliation (server/src/jobs/index.js). Skipped in NODE_ENV=test —
  // the jest/supertest suite imports app.js directly, never this file, so
  // this guard is defense-in-depth against any future test entry point that
  // might import index.js, not something the current suite relies on.
  // Remaining docs/02_ARCHITECTURE.md §2 `jobs/` items (expiry reminders,
  // cleanup, backups) are still unbuilt — later phases.
  if (env.NODE_ENV !== 'test') {
    registerCronJobs();
  } else {
    logger.info('[cron] NODE_ENV=test — cron jobs not registered.');
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`[server] SAMS Academy API listening on 0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  });
}

start().catch((err) => {
  logger.error(`[server] fatal error during startup: ${err.stack || err.message}`);
  process.exit(1);
});
