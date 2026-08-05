// server/src/jobs/backupCron.js
// node-cron SCHEDULING ONLY (same pattern as enrollmentLifecycleCron.js /
// statsReconciliationCron.js / questionDifficultyCron.js) — the actual dump
// + rotate logic lives in services/backupService.js#runDatabaseBackup,
// unit-tested directly (server/tests/jobs/backupCron.test.js), never by
// exercising real node-cron scheduling. Weekly, Sunday 03:00 server time
// ('0 3 * * 0'): a slow off-peak moment (later than the three existing
// daily 02:00/02:15/02:30 jobs, so it never contends with them for the same
// connection-pool moment) and weekly matches docs/09_DEPLOYMENT_HOSTINGER.md
// / docs/10_SECURITY_CHECKLIST.md §H's "weekly mysqldump" requirement
// exactly — a full logical dump running daily would be unnecessary I/O and
// rotation churn for an LMS whose Hostinger host already takes its own
// daily backups per that same deployment doc ("Weekly mysqldump ... plus
// rely on Hostinger daily backups").
//
// Registration only reaches this file's schedule when NODE_ENV !== 'test'
// — server/index.js only calls jobs/index.js#registerCronJobs() outside
// NODE_ENV=test, so this weekly schedule is never armed during the test
// suite; services/backupService.js#runDatabaseBackup itself additionally
// picks DB_NAME vs DB_NAME_test based on NODE_ENV, so even a direct
// function call (as the test suite makes) always targets the correct
// database.
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { runDatabaseBackup } from '../services/backupService.js';

const SCHEDULE = '0 3 * * 0'; // 03:00 every Sunday
const KEEP = 4;

export function registerDatabaseBackupCron() {
  cron.schedule(SCHEDULE, async () => {
    try {
      const result = await runDatabaseBackup({ keep: KEEP });
      if (!result.success) {
        logger.error('[cron] runDatabaseBackup did not produce a backup this run (see prior [backup] log line).');
      }
    } catch (err) {
      logger.error(`[cron] runDatabaseBackup failed: ${err.stack || err.message}`);
    }
  });
  logger.info(`[cron] registered backupCron (schedule="${SCHEDULE}", keep=${KEEP}).`);
}

export default registerDatabaseBackupCron;
