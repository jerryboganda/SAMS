// server/src/models/Coupon.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: coupons). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Coupon extends Model {
    static associate(models) {
      associateCoupon(models, Coupon);
    }
  }

  Coupon.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    code: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.ENUM('percent', 'fixed'),
      allowNull: false,
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    courseId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    maxUses: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    usedCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    validUntil: {
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
      modelName: 'Coupon',
      tableName: 'coupons',
    }
  );

  return Coupon;
};

function associateCoupon(models, Coupon) {
  Coupon.belongsTo(models.Course, { as: 'course', foreignKey: 'courseId' });
  Coupon.hasMany(models.Order, { as: 'orders', foreignKey: 'couponId' });
}
