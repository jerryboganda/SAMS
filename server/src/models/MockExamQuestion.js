// server/src/models/MockExamQuestion.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: mock_exam_questions). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class MockExamQuestion extends Model {
    static associate(models) {
      associateMockExamQuestion(models, MockExamQuestion);
    }
  }

  MockExamQuestion.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    mockExamId: {
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
      defaultValue: 0,
    },
    },
    {
      sequelize,
      modelName: 'MockExamQuestion',
      tableName: 'mock_exam_questions',
      timestamps: false,
    }
  );

  return MockExamQuestion;
};

function associateMockExamQuestion(models, MockExamQuestion) {
  MockExamQuestion.belongsTo(models.MockExam, { as: 'mockExam', foreignKey: 'mockExamId' });
  MockExamQuestion.belongsTo(models.Question, { as: 'question', foreignKey: 'questionId' });
}
