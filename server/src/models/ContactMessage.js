// server/src/models/ContactMessage.js
// Auto-generated from docs/03_DATABASE_SCHEMA.md (table: contact_messages). See DECISIONS.md.
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class ContactMessage extends Model {
    static associate() {
      // contact_messages: no FK relationships in either direction (see docs/03_DATABASE_SCHEMA.md).
    }
  }

  ContactMessage.init(
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
    email: {
      type: DataTypes.STRING(190),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('new', 'read', 'replied'),
      allowNull: false,
      defaultValue: 'new',
    },
    },
    {
      sequelize,
      modelName: 'ContactMessage',
      tableName: 'contact_messages',
    }
  );

  return ContactMessage;
};
