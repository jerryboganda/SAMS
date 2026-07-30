// server/src/models/TestAttemptQuestion.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: test_attempt_questions). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class TestAttemptQuestion extends Model {
    static associate(models) {
      associateTestAttemptQuestion(models, TestAttemptQuestion);
    }
  }

  TestAttemptQuestion.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    testSessionId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    questionId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    sortOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    selectedOptionId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    isCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    isFlagged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    timeSpentSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    answeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'TestAttemptQuestion',
      tableName: 'test_attempt_questions',
      timestamps: false,
    }
  );

  return TestAttemptQuestion;
};

function associateTestAttemptQuestion(models, TestAttemptQuestion) {
  TestAttemptQuestion.belongsTo(models.TestSession, { as: 'testSession', foreignKey: 'testSessionId' });
  TestAttemptQuestion.belongsTo(models.Question, { as: 'question', foreignKey: 'questionId' });
}
