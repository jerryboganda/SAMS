// server/src/models/CourseSection.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: course_sections). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CourseSection extends Model {
    static associate(models) {
      associateCourseSection(models, CourseSection);
    }
  }

  CourseSection.init(
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
    title: {
      type: DataTypes.STRING(180),
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
      modelName: 'CourseSection',
      tableName: 'course_sections',
    }
  );

  return CourseSection;
};

function associateCourseSection(models, CourseSection) {
  CourseSection.belongsTo(models.Course, { as: 'course', foreignKey: 'courseId' });
  CourseSection.hasMany(models.Lecture, { as: 'lectures', foreignKey: 'sectionId' });
}
