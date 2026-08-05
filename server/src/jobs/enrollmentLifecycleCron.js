// server/src/jobs/enrollmentLifecycleCron.js
// node-cron SCHEDULING ONLY (same pattern as statsReconciliationCron.js /
// questionDifficultyCron.js) — the actual logic lives in
// services/enrollmentLifecycleService.js#{expireStaleEnrollments,
// sendExpiringReminders}, unit-tested directly
// (server/tests/jobs/enrollmentLifecycleCron.test.js), never by exercising
// real node-cron scheduling. Both sweeps run back-to-back in ONE daily job
// (rather than two separate cron registrations) — simplest option, avoids a
// third schedule slot, and running the expiry flip immediately before the
// reminder sweep means the reminder query's `status='active'` filter always
// reflects the same run's freshly-expired rows. 02:30 daily — after
// statsReconciliationCron's 02:00 and questionDifficultyCron's 02:15 slots,
// so none of the three ever contend for the same connection-pool moment.
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { expireStaleEnrollments, sendExpiringReminders } from '../services/enrollmentLifecycleService.js';

const SCHEDULE = '30 2 * * *'; // 02:30 daily

export function registerEnrollmentLifecycleCron() {
  cron.schedule(SCHEDULE, async () => {
    try {
      await expireStaleEnrollments();
    } catch (err) {
      logger.error(`[cron] expireStaleEnrollments failed: ${err.stack || err.message}`);
    }
    try {
      await sendExpiringReminders();
    } catch (err) {
      logger.error(`[cron] sendExpiringReminders failed: ${err.stack || err.message}`);
    }
  });
  logger.info(`[cron] registered enrollmentLifecycleCron (schedule="${SCHEDULE}").`);
}

export default registerEnrollmentLifecycleCron;
