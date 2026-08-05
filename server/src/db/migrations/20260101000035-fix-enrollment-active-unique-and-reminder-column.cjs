'use strict';

/**
 * Phase 9.9 bug fix + 9.9 reminder-dedup column.
 *
 * === THE BUG ===
 * `enrollments.uq_enr_active` (added in
 * 20260101000015-create-enrollments.cjs) is `UNIQUE (user_id, course_id,
 * status)` — a genuine 3-column composite unique key, not a partial/filtered
 * index. That means AT MOST ONE ROW total can exist for a given
 * `(user_id, course_id, status)` triple, for ANY status value, not just
 * `'active'`. `enrollmentService.js#createEnrollmentFromOrder`'s
 * "flip the current active row to expired, then insert a new active row"
 * repurchase logic works for exactly ONE repurchase-after-expiry cycle. A
 * SECOND cycle collides: buy course X (row A, active) -> A expires (flipped
 * to 'expired') -> repurchase X (row A already 'expired'; a NEW row B is
 * created 'active') -> B ALSO eventually expires -> flipping B's status to
 * 'expired' now collides with row A, which already occupies
 * `(user_id, course_id, 'expired')` from the FIRST cycle ->
 * `SequelizeUniqueConstraintError`. This never surfaced before because
 * nothing ever proactively flipped active->expired until this task's own
 * expiry cron existed to actually exercise the path twice for the same
 * (user, course).
 *
 * === THE FIX ===
 * MySQL 8 has no Postgres-style partial/filtered unique index, but supports
 * the standard workaround: a generated column that is non-NULL only for the
 * rows you actually want to be unique, combined with a unique index on that
 * generated column — MySQL (like every SQL engine) treats NULL as "not equal
 * to any other NULL" in a unique index, so any number of NULL rows are
 * allowed. `active_slot` is a VIRTUAL generated column
 * (`IF(status = 'active', 1, NULL)`) — VIRTUAL (not STORED) because it's
 * never queried directly, only indexed. The new `uq_enr_active` unique index
 * covers `(user_id, course_id, active_slot)`: at most one row with
 * `active_slot = 1` (i.e. `status = 'active'`) per (user, course), while an
 * unlimited number of `expired`/`revoked` rows (both `active_slot = NULL`)
 * are allowed for the same pair — the actually-intended invariant (the
 * schema doc's own inline comment already says "-- one active per course",
 * confirming this was always the intended semantics, just implemented one
 * degree too strict).
 *
 * Sequelize's migration DSL has no "generated column" DataType, so the
 * `active_slot` column is added via raw SQL (`queryInterface.sequelize.query`)
 * — the only raw-SQL statement in this migration; every other statement uses
 * the normal `queryInterface` API.
 *
 * === ALSO IN THIS MIGRATION ===
 * `expiry_reminder_sent_at` (nullable DATETIME) — dedup marker for the 9.9
 * 7-day-expiring reminder sweep (services/enrollmentLifecycleService.js#
 * sendExpiringReminders), so a daily cron sweep never emails/notifies the
 * same enrollment's upcoming expiry twice.
 *
 * See DECISIONS.md 2026-08-05 for the full writeup.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `enrollments` ADD COLUMN `active_slot` TINYINT GENERATED ALWAYS AS (IF(`status` = 'active', 1, NULL)) VIRTUAL NULL AFTER `status`"
    );

    // The old `uq_enr_active` (user_id, course_id, status) is InnoDB's ONLY
    // supporting index for `fk_e_user` (user_id has no other index of its
    // own — course_id/order_id each already have their own dedicated
    // fk_e_course/fk_e_order index). MySQL refuses to drop an index that's
    // still the sole supporting index for a foreign key
    // ("Cannot drop index 'uq_enr_active': needed in a foreign key
    // constraint" — reproduced while writing this migration), so the new
    // index must be created FIRST (under a temporary name, since the final
    // name is still occupied), then the old one dropped, then the new one
    // renamed into the old one's name — at every intermediate step
    // `fk_e_user` always has at least one valid supporting index.
    await queryInterface.addIndex('enrollments', ['user_id', 'course_id', 'active_slot'], {
      name: 'uq_enr_active_new',
      unique: true,
    });

    await queryInterface.removeIndex('enrollments', 'uq_enr_active');

    await queryInterface.sequelize.query('ALTER TABLE `enrollments` RENAME INDEX `uq_enr_active_new` TO `uq_enr_active`');

    await queryInterface.addColumn('enrollments', 'expiry_reminder_sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('enrollments', 'expiry_reminder_sent_at');

    // The whole POINT of up() is to allow MULTIPLE (user_id, course_id,
    // 'expired') rows to coexist -- a state the old, stricter
    // UNIQUE(user_id, course_id, status) key can never represent by
    // definition. So the instant any real data exists that only the fixed
    // schema can hold (e.g. two full purchase-expire cycles for the same
    // (user, course) -- exactly what this migration was written to allow,
    // and exactly what its own regression test in
    // tests/jobs/enrollmentLifecycleCron.test.js creates), re-adding the old
    // 3-column unique index below would itself fail with a duplicate-key
    // error -- reproduced while writing this migration, and specifically
    // what broke server/tests/globalSetup.cjs's mandatory
    // "db:migrate:undo:all then db:migrate" full-reset cycle the FIRST time
    // this migration's own regression test data was still sitting in the
    // test DB from a prior run (globalSetup's undo:all swallows any error
    // and proceeds straight to migrate regardless, silently leaving the
    // schema in a half-reverted, SequelizeMeta-inconsistent state --
    // reproduced and fixed during this task, see DECISIONS.md 2026-08-05).
    // A clean rollback to the OLD (stricter) schema is therefore only
    // possible by first collapsing any now-illegal duplicate
    // (user_id, course_id, status) groups down to one row each (keeping the
    // highest `id` -- the most recent -- per group, discarding the rest).
    // This is a real, deliberate, and irreversible data loss on downgrade —
    // an acceptable, clearly-documented trade-off for a `down()` whose only
    // real caller in this codebase is globalSetup's TEST-DB reset cycle
    // (production never runs `db:migrate:undo`, per CLAUDE.md §1's
    // "Never sync({force}) outside tests" spirit and this project's
    // migrate-forward deployment model) -- and is fundamentally the only
    // way to honor the old constraint's shape at all once data has outgrown
    // it, no matter how it's implemented.
    await queryInterface.sequelize.query(
      `DELETE e1 FROM enrollments e1
       INNER JOIN enrollments e2
         ON e1.user_id = e2.user_id
        AND e1.course_id = e2.course_id
        AND e1.status = e2.status
        AND e1.id < e2.id`
    );

    // Same "always keep a supporting index for fk_e_user" ordering as up().
    await queryInterface.addIndex('enrollments', ['user_id', 'course_id', 'status'], {
      name: 'uq_enr_active_old',
      unique: true,
    });

    await queryInterface.removeIndex('enrollments', 'uq_enr_active');

    await queryInterface.sequelize.query('ALTER TABLE `enrollments` RENAME INDEX `uq_enr_active_old` TO `uq_enr_active`');

    await queryInterface.sequelize.query('ALTER TABLE `enrollments` DROP COLUMN `active_slot`');
  },
};
