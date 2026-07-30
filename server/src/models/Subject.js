// server/src/models/Subject.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: subjects). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Subject extends Model {
    static associate(models) {
      associateSubject(models, Subject);
    }
  }

  Subject.init(
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
      modelName: 'Subject',
      tableName: 'subjects',
    }
  );

  return Subject;
};

function associateSubject(models, Subject) {
  Subject.hasMany(models.Question, { as: 'questions', foreignKey: 'subjectId' });
}
