// server/src/models/QuestionBookmark.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: question_bookmarks). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class QuestionBookmark extends Model {
    static associate(models) {
      associateQuestionBookmark(models, QuestionBookmark);
    }
  }

  QuestionBookmark.init(
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
    },
    {
      sequelize,
      modelName: 'QuestionBookmark',
      tableName: 'question_bookmarks',
      timestamps: true,
      updatedAt: false,
    }
  );

  return QuestionBookmark;
};

function associateQuestionBookmark(models, QuestionBookmark) {
  QuestionBookmark.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  QuestionBookmark.belongsTo(models.Question, { as: 'question', foreignKey: 'questionId' });
}
