// server/src/models/Order.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: orders). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Order extends Model {
    static associate(models) {
      associateOrder(models, Order);
    }
  }

  Order.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    invoiceNo: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    userId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    courseId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    finalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: 'PKR',
    },
    couponId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    gateway: {
      type: DataTypes.ENUM('jazzcash', 'easypaisa', 'raast', 'payfast', 'safepay', 'bank_transfer', 'manual', 'mock'),
      allowNull: false,
    },
    gatewayRef: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'awaiting_verification', 'paid', 'failed', 'cancelled', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'Order',
      tableName: 'orders',
    }
  );

  return Order;
};

function associateOrder(models, Order) {
  Order.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  Order.belongsTo(models.Course, { as: 'course', foreignKey: 'courseId' });
  Order.belongsTo(models.Coupon, { as: 'coupon', foreignKey: 'couponId' });
  Order.hasMany(models.PaymentEvent, { as: 'paymentEvents', foreignKey: 'orderId' });
  Order.hasOne(models.BankTransferProof, { as: 'bankTransferProof', foreignKey: 'orderId' });
  Order.hasMany(models.Enrollment, { as: 'enrollments', foreignKey: 'orderId' });
}
