// server/src/models/Enrollment.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: enrollments). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Enrollment extends Model {
    static associate(models) {
      associateEnrollment(models, Enrollment);
    }
  }

  Enrollment.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    courseId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    orderId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    source: {
      type: DataTypes.ENUM('purchase', 'manual'),
      allowNull: false,
      defaultValue: 'purchase',
    },
    startsAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'revoked'),
      allowNull: false,
      defaultValue: 'active',
    },
    // Dedup marker for the 9.9 7-day-expiring reminder sweep
    // (services/enrollmentLifecycleService.js#sendExpiringReminders) — set
    // the moment a reminder is sent so a later daily sweep never re-sends it.
    // Note: `active_slot` (the generated column backing the corrected
    // `uq_enr_active` unique index — see migration
    // 20260101000035-fix-enrollment-active-unique-and-reminder-column.cjs)
    // is DELIBERATELY not declared here: it's a DB-computed VIRTUAL column,
    // never written to directly, so Sequelize never needs to know about it.
    expiryReminderSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'Enrollment',
      tableName: 'enrollments',
    }
  );

  return Enrollment;
};

function associateEnrollment(models, Enrollment) {
  Enrollment.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  Enrollment.belongsTo(models.Course, { as: 'course', foreignKey: 'courseId' });
  Enrollment.belongsTo(models.Order, { as: 'order', foreignKey: 'orderId' });
}
