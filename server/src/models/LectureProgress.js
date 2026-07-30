// server/src/models/LectureProgress.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: lecture_progress). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class LectureProgress extends Model {
    static associate(models) {
      associateLectureProgress(models, LectureProgress);
    }
  }

  LectureProgress.init(
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
    watchedSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    lastPositionSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    isCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'LectureProgress',
      tableName: 'lecture_progress',
    }
  );

  return LectureProgress;
};

function associateLectureProgress(models, LectureProgress) {
  LectureProgress.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  LectureProgress.belongsTo(models.Lecture, { as: 'lecture', foreignKey: 'lectureId' });
}
