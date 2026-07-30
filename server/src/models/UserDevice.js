// server/src/models/UserDevice.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: user_devices). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class UserDevice extends Model {
    static associate(models) {
      associateUserDevice(models, UserDevice);
    }
  }

  UserDevice.init(
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
    deviceTokenHash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
    },
    fingerprintHash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
    },
    deviceName: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    lastIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    },
    {
      sequelize,
      modelName: 'UserDevice',
      tableName: 'user_devices',
    }
  );

  return UserDevice;
};

function associateUserDevice(models, UserDevice) {
  UserDevice.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  UserDevice.hasMany(models.RefreshToken, { as: 'refreshTokens', foreignKey: 'deviceId' });
}
