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
