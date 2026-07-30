// server/src/models/Announcement.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: announcements). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Announcement extends Model {
    static associate(models) {
      associateAnnouncement(models, Announcement);
    }
  }

  Announcement.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    audience: {
      type: DataTypes.ENUM('all', 'course'),
      allowNull: false,
      defaultValue: 'all',
    },
    courseId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    sendEmail: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    createdBy: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'Announcement',
      tableName: 'announcements',
    }
  );

  return Announcement;
};

function associateAnnouncement(models, Announcement) {
  Announcement.belongsTo(models.Course, { as: 'course', foreignKey: 'courseId' });
  Announcement.belongsTo(models.User, { as: 'creator', foreignKey: 'createdBy' });
}
