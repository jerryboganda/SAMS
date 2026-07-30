// server/src/models/AuditLog.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: audit_logs). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class AuditLog extends Model {
    static associate(models) {
      associateAuditLog(models, AuditLog);
    }
  }

  AuditLog.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    actorUserId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    summary: {
      type: DataTypes.STRING(400),
      allowNull: true,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      timestamps: true,
      updatedAt: false,
    }
  );

  return AuditLog;
};

function associateAuditLog(models, AuditLog) {
  AuditLog.belongsTo(models.User, { as: 'actor', foreignKey: 'actorUserId' });
}
