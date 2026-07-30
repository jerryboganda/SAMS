// server/src/models/RefreshToken.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: refresh_tokens). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class RefreshToken extends Model {
    static associate(models) {
      associateRefreshToken(models, RefreshToken);
    }
  }

  RefreshToken.init(
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
    deviceId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    tokenHash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    replacedBy: {
      type: DataTypes.CHAR(64),
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'RefreshToken',
      tableName: 'refresh_tokens',
    }
  );

  return RefreshToken;
};

function associateRefreshToken(models, RefreshToken) {
  RefreshToken.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  RefreshToken.belongsTo(models.UserDevice, { as: 'device', foreignKey: 'deviceId' });
}
