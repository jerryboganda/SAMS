// server/src/models/UserQuestionHistory.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: user_question_history). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class UserQuestionHistory extends Model {
    static associate(models) {
      associateUserQuestionHistory(models, UserQuestionHistory);
    }
  }

  UserQuestionHistory.init(
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
    questionId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    timesSeen: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    timesCorrect: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    lastResult: {
      type: DataTypes.ENUM('correct', 'incorrect', 'skipped'),
      allowNull: true,
      defaultValue: null,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'UserQuestionHistory',
      tableName: 'user_question_history',
      timestamps: false,
    }
  );

  return UserQuestionHistory;
};

function associateUserQuestionHistory(models, UserQuestionHistory) {
  UserQuestionHistory.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  UserQuestionHistory.belongsTo(models.Question, { as: 'question', foreignKey: 'questionId' });
}
