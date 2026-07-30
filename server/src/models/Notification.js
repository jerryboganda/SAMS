// server/src/models/Notification.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: notifications). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Notification extends Model {
    static associate(models) {
      associateNotification(models, Notification);
    }
  }

  Notification.init(
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
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    link: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notifications',
      timestamps: true,
      updatedAt: false,
    }
  );

  return Notification;
};

function associateNotification(models, Notification) {
  Notification.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
}
