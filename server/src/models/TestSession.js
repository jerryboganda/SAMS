// server/src/models/TestSession.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: test_sessions). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class TestSession extends Model {
    static associate(models) {
      associateTestSession(models, TestSession);
    }
  }

  TestSession.init(
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
    mode: {
      type: DataTypes.ENUM('practice', 'exam', 'mock'),
      allowNull: false,
    },
    mockExamId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    examCategory: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    filters: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    questionCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    timeLimitSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('in_progress', 'completed', 'abandoned'),
      allowNull: false,
      defaultValue: 'in_progress',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    correctCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    incorrectCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    skippedCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    scorePercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    passed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'TestSession',
      tableName: 'test_sessions',
    }
  );

  return TestSession;
};

function associateTestSession(models, TestSession) {
  TestSession.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  TestSession.belongsTo(models.MockExam, { as: 'mockExam', foreignKey: 'mockExamId' });
  TestSession.hasMany(models.TestAttemptQuestion, { as: 'testAttemptQuestions', foreignKey: 'testSessionId' });
}
