// server/src/models/LectureBookmark.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: lecture_bookmarks). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class LectureBookmark extends Model {
    static associate(models) {
      associateLectureBookmark(models, LectureBookmark);
    }
  }

  LectureBookmark.init(
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
    lectureId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    },
    {
      sequelize,
      modelName: 'LectureBookmark',
      tableName: 'lecture_bookmarks',
      timestamps: true,
      updatedAt: false,
    }
  );

  return LectureBookmark;
};

function associateLectureBookmark(models, LectureBookmark) {
  LectureBookmark.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  LectureBookmark.belongsTo(models.Lecture, { as: 'lecture', foreignKey: 'lectureId' });
}
