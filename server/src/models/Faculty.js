// server/src/models/Faculty.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: faculty). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Faculty extends Model {
    static associate() {
      // faculty: no FK relationships in either direction (see docs/03_DATABASE_SCHEMA.md).
    }
  }

  Faculty.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    sortOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    },
    {
      sequelize,
      modelName: 'Faculty',
      tableName: 'faculty',
    }
  );

  return Faculty;
};
