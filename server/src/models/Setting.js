// server/src/models/Setting.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: settings). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Setting extends Model {
    static associate() {
      // settings: no FK relationships in either direction (see docs/03_DATABASE_SCHEMA.md).
    }
  }

  Setting.init(
    {
    key: {
      type: DataTypes.STRING(80),
      allowNull: false,
      primaryKey: true,
    },
    value: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    },
    {
      sequelize,
      modelName: 'Setting',
      tableName: 'settings',
      timestamps: true,
      createdAt: false,
    }
  );

  return Setting;
};
