'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(190),
        allowNull: false,
        unique: true,
      },
      phone: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      role: {
        type: Sequelize.ENUM('student', 'admin'),
        allowNull: false,
        defaultValue: 'student',
      },
      status: {
        type: Sequelize.ENUM('pending', 'active', 'suspended'),
        allowNull: false,
        defaultValue: 'pending',
      },
      email_verified_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      twofa_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      twofa_secret: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      twofa_backup_codes: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
    await queryInterface.addIndex('users', ["role","status"], { name: 'idx_users_role_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
