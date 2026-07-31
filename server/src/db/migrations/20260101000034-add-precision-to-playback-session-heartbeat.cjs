'use strict';

/**
 * Security audit 2026-07-31, Finding 2 (Medium) follow-up: `heartbeat()`
 * (server/src/services/videoService.js) now cross-checks the client-claimed
 * `delta` against real wall-clock time elapsed since `playback_sessions.
 * last_heartbeat_at`. Plain `DATETIME` (no fractional seconds) truncates to
 * whole-second precision, which made that cross-check systematically
 * OVER-estimate elapsed time by up to just-under 1 second on every write
 * (each stored timestamp can be up to ~1s earlier than the real moment it
 * was written) — harmless for the real ~15s player cadence, but let rapid
 * back-to-back calls accumulate up to ~1s of phantom "elapsed" credit per
 * call (confirmed by server/tests/student/video/heartbeatElapsedTime.test.js
 * failing pre-migration with ~8s of phantom credit across 8 rapid calls).
 * `DATETIME(3)` (millisecond precision) closes that gap. Scoped to only this
 * one column — it's the only DATETIME in the schema fed into a sub-second
 * arithmetic comparison; every other DATETIME column in this schema is used
 * for ordering/filtering only, where whole-second precision is fine.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('playback_sessions', 'last_heartbeat_at', {
      type: Sequelize.DATE(3),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('playback_sessions', 'last_heartbeat_at', {
      type: Sequelize.DATE,
      allowNull: false,
    });
  },
};
