// server/src/models/Lecture.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: lectures). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Lecture extends Model {
    static associate(models) {
      associateLecture(models, Lecture);
    }
  }

  Lecture.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    courseId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    sectionId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    videoProvider: {
      type: DataTypes.ENUM('bunny', 'mock'),
      allowNull: false,
      defaultValue: 'bunny',
    },
    videoRef: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    durationSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    isFreePreview: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isPublished: {
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
      modelName: 'Lecture',
      tableName: 'lectures',
    }
  );

  return Lecture;
};

function associateLecture(models, Lecture) {
  Lecture.belongsTo(models.Course, { as: 'course', foreignKey: 'courseId' });
  Lecture.belongsTo(models.CourseSection, { as: 'section', foreignKey: 'sectionId' });
  Lecture.hasMany(models.LectureProgress, { as: 'lectureProgresses', foreignKey: 'lectureId' });
  Lecture.hasMany(models.LectureBookmark, { as: 'lectureBookmarks', foreignKey: 'lectureId' });
}
