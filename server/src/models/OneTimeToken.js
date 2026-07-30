// server/src/models/OneTimeToken.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: one_time_tokens). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class OneTimeToken extends Model {
    static associate(models) {
      associateOneTimeToken(models, OneTimeToken);
    }
  }

  OneTimeToken.init(
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
    purpose: {
      type: DataTypes.ENUM('verify_email', 'reset_password', 'reverify_login'),
      allowNull: false,
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
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'OneTimeToken',
      tableName: 'one_time_tokens',
      timestamps: true,
      updatedAt: false,
    }
  );

  return OneTimeToken;
};

function associateOneTimeToken(models, OneTimeToken) {
  OneTimeToken.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
}
