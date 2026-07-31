// server/src/jobs/questionDifficultyCron.js
// node-cron SCHEDULING ONLY (docs/02_ARCHITECTURE.md §1/§2 "Cron via
// `node-cron` inside the process") — the actual aggregation/update logic
// lives in services/statsService.js#recomputeQuestionDifficulty, which is
// what gets unit-tested directly (server/tests/jobs/
// questionDifficultyCron.test.js). Nightly at 02:15 server time (server
// timezone — no explicit `timezone` option set, matching this app's
// single-region Hostinger deployment; see DECISIONS.md) — a quiet off-peak
// hour, staggered a few minutes after statsReconciliationCron's 02:00 slot so
// the two never contend for the same connection-pool moment.
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { recomputeQuestionDifficulty } from '../services/statsService.js';

const SCHEDULE = '15 2 * * *'; // 02:15 daily

export function registerQuestionDifficultyCron() {
  cron.schedule(SCHEDULE, async () => {
    try {
      await recomputeQuestionDifficulty();
    } catch (err) {
      logger.error(`[cron] recomputeQuestionDifficulty failed: ${err.stack || err.message}`);
    }
  });
  logger.info(`[cron] registered questionDifficultyCron (schedule="${SCHEDULE}").`);
}

export default registerQuestionDifficultyCron;
