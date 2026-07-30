// server/src/models/Question.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: questions). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Question extends Model {
    static associate(models) {
      associateQuestion(models, Question);
    }
  }

  Question.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    examCategory: {
      type: DataTypes.ENUM('NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'),
      allowNull: false,
    },
    subjectId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    systemId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    stem: {
      type: DataTypes.TEXT('medium'),
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    explanation: {
      type: DataTypes.TEXT('medium'),
      allowNull: false,
    },
    referenceText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    difficulty: {
      type: DataTypes.ENUM('easy', 'medium', 'hard'),
      allowNull: false,
      defaultValue: 'medium',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    timesAttempted: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    timesCorrect: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    },
    {
      sequelize,
      modelName: 'Question',
      tableName: 'questions',
    }
  );

  return Question;
};

function associateQuestion(models, Question) {
  Question.belongsTo(models.Subject, { as: 'subject', foreignKey: 'subjectId' });
  Question.belongsTo(models.BodySystem, { as: 'system', foreignKey: 'systemId' });
  Question.hasMany(models.QuestionOption, { as: 'questionOptions', foreignKey: 'questionId' });
  Question.hasMany(models.MockExamQuestion, { as: 'mockExamQuestions', foreignKey: 'questionId' });
  Question.hasMany(models.TestAttemptQuestion, { as: 'testAttemptQuestions', foreignKey: 'questionId' });
  Question.hasMany(models.QuestionBookmark, { as: 'questionBookmarks', foreignKey: 'questionId' });
  Question.hasMany(models.UserQuestionHistory, { as: 'userQuestionHistories', foreignKey: 'questionId' });
  Question.belongsToMany(models.MockExam, { through: models.MockExamQuestion, as: 'mockExams', foreignKey: 'questionId', otherKey: 'mockExamId' });
}
