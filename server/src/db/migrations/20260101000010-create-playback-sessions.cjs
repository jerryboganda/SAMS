'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('playback_sessions', {
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
      lecture_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      device_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      session_key: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        unique: true,
      },
      last_heartbeat_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('playback_sessions', ["user_id","ended_at"], { name: 'idx_ps_user_active' });
    await queryInterface.addConstraint('playback_sessions', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_ps_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('playback_sessions');
  },
};
