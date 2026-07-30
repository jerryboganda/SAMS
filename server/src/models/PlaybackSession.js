// server/src/models/PlaybackSession.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: playback_sessions). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlaybackSession extends Model {
    static associate(models) {
      associatePlaybackSession(models, PlaybackSession);
    }
  }

  PlaybackSession.init(
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
    deviceId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    sessionKey: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      unique: true,
    },
    lastHeartbeatAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    },
    {
      sequelize,
      modelName: 'PlaybackSession',
      tableName: 'playback_sessions',
      timestamps: true,
      updatedAt: false,
    }
  );

  return PlaybackSession;
};

function associatePlaybackSession(models, PlaybackSession) {
  PlaybackSession.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
}
