// server/src/models/Faq.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: faqs). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class Faq extends Model {
    static associate() {
      // faqs: no FK relationships in either direction (see docs/03_DATABASE_SCHEMA.md).
    }
  }

  Faq.init(
    {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    question: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false,
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
      modelName: 'Faq',
      tableName: 'faqs',
    }
  );

  return Faq;
};
