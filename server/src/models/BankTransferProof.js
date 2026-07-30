// server/src/models/BankTransferProof.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: bank_transfer_proofs). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class BankTransferProof extends Model {
    static associate(models) {
      associateBankTransferProof(models, BankTransferProof);
    }
  }

  BankTransferProof.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    orderId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      unique: true,
    },
    filePath: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    referenceNo: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    note: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    reviewedBy: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejectReason: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'BankTransferProof',
      tableName: 'bank_transfer_proofs',
    }
  );

  return BankTransferProof;
};

function associateBankTransferProof(models, BankTransferProof) {
  BankTransferProof.belongsTo(models.Order, { as: 'order', foreignKey: 'orderId' });
  BankTransferProof.belongsTo(models.User, { as: 'reviewer', foreignKey: 'reviewedBy' });
}
