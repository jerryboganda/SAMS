// server/src/jobs/statsReconciliationCron.js
// node-cron SCHEDULING ONLY — the actual logic lives in
// services/statsService.js#reconcileUserDailyStats, unit-tested directly
// (server/tests/jobs/statsReconciliationCron.test.js). See that function's
// doc comment + DECISIONS.md's dated Phase 8.1 entry for the full "build vs
// skip" reasoning behind this job's existence and bounded scope
// (qbank-sourced user_daily_stats columns only, last 3 UTC days,
// video_seconds never touched). Nightly at 02:00 server time, ahead of
// questionDifficultyCron's 02:15 slot.
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { reconcileUserDailyStats } from '../services/statsService.js';

const SCHEDULE = '0 2 * * *'; // 02:00 daily
const DAYS_BACK = 3;

export function registerStatsReconciliationCron() {
  cron.schedule(SCHEDULE, async () => {
    try {
      await reconcileUserDailyStats(DAYS_BACK);
    } catch (err) {
      logger.error(`[cron] reconcileUserDailyStats failed: ${err.stack || err.message}`);
    }
  });
  logger.info(`[cron] registered statsReconciliationCron (schedule="${SCHEDULE}", daysBack=${DAYS_BACK}).`);
}

export default registerStatsReconciliationCron;
