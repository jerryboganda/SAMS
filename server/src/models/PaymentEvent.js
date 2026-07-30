// server/src/models/PaymentEvent.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: payment_events). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PaymentEvent extends Model {
    static associate(models) {
      associatePaymentEvent(models, PaymentEvent);
    }
  }

  PaymentEvent.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    orderId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    gateway: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    eventType: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    externalRef: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    signatureValid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    },
    {
      sequelize,
      modelName: 'PaymentEvent',
      tableName: 'payment_events',
      timestamps: true,
      updatedAt: false,
    }
  );

  return PaymentEvent;
};

function associatePaymentEvent(models, PaymentEvent) {
  PaymentEvent.belongsTo(models.Order, { as: 'order', foreignKey: 'orderId' });
}
