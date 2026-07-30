// server/src/models/User.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: users). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class User extends Model {
    static associate(models) {
      associateUser(models, User);
    }
  }

  User.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(190),
      allowNull: false,
      unique: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('student', 'admin'),
      allowNull: false,
      defaultValue: 'student',
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'suspended'),
      allowNull: false,
      defaultValue: 'pending',
    },
    emailVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    twofaEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    twofaSecret: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    twofaBackupCodes: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
    }
  );

  return User;
};

function associateUser(models, User) {
  User.hasMany(models.UserDevice, { as: 'userDevices', foreignKey: 'userId' });
  User.hasMany(models.RefreshToken, { as: 'refreshTokens', foreignKey: 'userId' });
  User.hasMany(models.OneTimeToken, { as: 'oneTimeTokens', foreignKey: 'userId' });
  User.hasMany(models.LectureProgress, { as: 'lectureProgresses', foreignKey: 'userId' });
  User.hasMany(models.LectureBookmark, { as: 'lectureBookmarks', foreignKey: 'userId' });
  User.hasMany(models.PlaybackSession, { as: 'playbackSessions', foreignKey: 'userId' });
  User.hasMany(models.Order, { as: 'orders', foreignKey: 'userId' });
  User.hasMany(models.BankTransferProof, { as: 'reviewedBankTransferProofs', foreignKey: 'reviewedBy' });
  User.hasMany(models.Enrollment, { as: 'enrollments', foreignKey: 'userId' });
  User.hasMany(models.TestSession, { as: 'testSessions', foreignKey: 'userId' });
  User.hasMany(models.QuestionBookmark, { as: 'questionBookmarks', foreignKey: 'userId' });
  User.hasMany(models.UserQuestionHistory, { as: 'userQuestionHistories', foreignKey: 'userId' });
  User.hasMany(models.UserDailyStat, { as: 'userDailyStats', foreignKey: 'userId' });
  User.hasMany(models.Announcement, { as: 'createdAnnouncements', foreignKey: 'createdBy' });
  User.hasMany(models.Notification, { as: 'notifications', foreignKey: 'userId' });
  User.hasMany(models.AuditLog, { as: 'auditLogs', foreignKey: 'actorUserId' });
}
