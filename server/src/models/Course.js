// server/src/models/Course.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: courses). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Course extends Model {
    static associate(models) {
      associateCourse(models, Course);
    }
  }

  Course.init(
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
    slug: {
      type: DataTypes.STRING(190),
      allowNull: false,
      unique: true,
    },
    examCategory: {
      type: DataTypes.ENUM('NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'),
      allowNull: false,
    },
    shortDescription: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT('medium'),
      allowNull: true,
    },
    thumbnailUrl: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: 'PKR',
    },
    validityDays: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 180,
    },
    includesQbank: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
      modelName: 'Course',
      tableName: 'courses',
    }
  );

  return Course;
};

function associateCourse(models, Course) {
  Course.hasMany(models.CourseSection, { as: 'courseSections', foreignKey: 'courseId' });
  Course.hasMany(models.Lecture, { as: 'lectures', foreignKey: 'courseId' });
  Course.hasMany(models.Coupon, { as: 'coupons', foreignKey: 'courseId' });
  Course.hasMany(models.Order, { as: 'orders', foreignKey: 'courseId' });
  Course.hasMany(models.Enrollment, { as: 'enrollments', foreignKey: 'courseId' });
  Course.hasMany(models.Announcement, { as: 'announcements', foreignKey: 'courseId' });
}
