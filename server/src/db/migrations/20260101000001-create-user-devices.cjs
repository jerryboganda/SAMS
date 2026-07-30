'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_devices', {
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
      device_token_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
      },
      fingerprint_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
      },
      device_name: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      last_ip: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('user_devices', ["device_token_hash"], { name: 'uq_device_token', unique: true });
    await queryInterface.addIndex('user_devices', ["user_id","is_active"], { name: 'idx_devices_user_active' });
    await queryInterface.addConstraint('user_devices', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_dev_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_devices');
  },
};
