// server/src/models/UserDailyStat.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: user_daily_stats). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class UserDailyStat extends Model {
    static associate(models) {
      associateUserDailyStat(models, UserDailyStat);
    }
  }

  UserDailyStat.init(
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
    statDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    questionsAttempted: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    questionsCorrect: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    qbankSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    videoSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    },
    {
      sequelize,
      modelName: 'UserDailyStat',
      tableName: 'user_daily_stats',
      timestamps: false,
    }
  );

  return UserDailyStat;
};

function associateUserDailyStat(models, UserDailyStat) {
  UserDailyStat.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
}
