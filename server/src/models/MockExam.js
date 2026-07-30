// server/src/models/MockExam.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: mock_exams). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class MockExam extends Model {
    static associate(models) {
      associateMockExam(models, MockExam);
    }
  }

  MockExam.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(180),
      allowNull: false,
    },
    examCategory: {
      type: DataTypes.ENUM('NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'),
      allowNull: false,
    },
    durationMinutes: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    passPercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 60,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    },
    {
      sequelize,
      modelName: 'MockExam',
      tableName: 'mock_exams',
    }
  );

  return MockExam;
};

function associateMockExam(models, MockExam) {
  MockExam.hasMany(models.MockExamQuestion, { as: 'mockExamQuestions', foreignKey: 'mockExamId' });
  MockExam.hasMany(models.TestSession, { as: 'testSessions', foreignKey: 'mockExamId' });
  MockExam.belongsToMany(models.Question, { through: models.MockExamQuestion, as: 'questions', foreignKey: 'mockExamId', otherKey: 'questionId' });
}
