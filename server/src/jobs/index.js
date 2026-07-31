// server/src/jobs/index.js
// Single entry point index.js's boot sequence calls to register every
// node-cron job (docs/02_ARCHITECTURE.md §2's `jobs/` directory). Phase
// 8.1 adds the first two real jobs; earlier phases left this a placeholder
// (see index.js's former "cron placeholder" log line). Registration only —
// node-cron itself keeps each job alive for the life of the process, nothing
// further to await here.
import { registerQuestionDifficultyCron } from './questionDifficultyCron.js';
import { registerStatsReconciliationCron } from './statsReconciliationCron.js';

export function registerCronJobs() {
  registerQuestionDifficultyCron();
  registerStatsReconciliationCron();
}

export default registerCronJobs;
