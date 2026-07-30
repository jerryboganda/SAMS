'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('one_time_tokens', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      purpose: {
        type: Sequelize.ENUM('verify_email', 'reset_password', 'reverify_login'),
        allowNull: false,
      },
      token_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
        unique: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('one_time_tokens', ["user_id","purpose"], { name: 'idx_ott_user_purpose' });
    await queryInterface.addConstraint('one_time_tokens', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_ott_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('one_time_tokens');
  },
};
