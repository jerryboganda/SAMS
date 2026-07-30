'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('login_events', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      email_tried: {
        type: Sequelize.STRING(190),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('success', 'failed', 'blocked', 'suspicious'),
        allowNull: false,
      },
      reason: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      ip: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      country: {
        type: Sequelize.CHAR(2),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      fingerprint_hash: {
        type: Sequelize.CHAR(64),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('login_events', ["user_id","created_at"], { name: 'idx_le_user_time' });
    await queryInterface.addIndex('login_events', ["status","created_at"], { name: 'idx_le_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('login_events');
  },
};
