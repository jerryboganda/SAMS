// server/src/models/BodySystem.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: body_systems). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class BodySystem extends Model {
    static associate(models) {
      associateBodySystem(models, BodySystem);
    }
  }

  BodySystem.init(
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
      unique: true,
    },
    sortOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    },
    {
      sequelize,
      modelName: 'BodySystem',
      tableName: 'body_systems',
    }
  );

  return BodySystem;
};

function associateBodySystem(models, BodySystem) {
  BodySystem.hasMany(models.Question, { as: 'questions', foreignKey: 'systemId' });
}
