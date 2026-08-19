// server/src/models/SubscriptionPackage.js
// SubscriptionPackage model for managing subscription and pricing packages.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class SubscriptionPackage extends Model {
    static associate(_models) {
      // Future associations can be registered here if needed
    }
  }

  SubscriptionPackage.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING(190),
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING(190),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      examCategory: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'NRE1',
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      originalPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'PKR',
      },
      validityDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 180,
      },
      includedCourseIds: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      includesQbank: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      includesMockExams: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      maxDevices: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
      },
      features: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      badge: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      isPopular: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'SubscriptionPackage',
      tableName: 'subscription_packages',
    }
  );

  return SubscriptionPackage;
};
