// server/src/models/QuestionOption.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: question_options). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class QuestionOption extends Model {
    static associate(models) {
      associateQuestionOption(models, QuestionOption);
    }
  }

  QuestionOption.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    questionId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    optionText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sortOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    },
    {
      sequelize,
      modelName: 'QuestionOption',
      tableName: 'question_options',
    }
  );

  return QuestionOption;
};

function associateQuestionOption(models, QuestionOption) {
  QuestionOption.belongsTo(models.Question, { as: 'question', foreignKey: 'questionId' });
}
