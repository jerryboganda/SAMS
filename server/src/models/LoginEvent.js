// server/src/models/LoginEvent.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: login_events). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class LoginEvent extends Model {
    static associate() {
      // login_events: no FK relationships in either direction (see docs/03_DATABASE_SCHEMA.md).
    }
  }

  LoginEvent.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    emailTried: {
      type: DataTypes.STRING(190),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('success', 'failed', 'blocked', 'suspicious'),
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    country: {
      type: DataTypes.CHAR(2),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    fingerprintHash: {
      type: DataTypes.CHAR(64),
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'LoginEvent',
      tableName: 'login_events',
      timestamps: true,
      updatedAt: false,
    }
  );

  return LoginEvent;
};
