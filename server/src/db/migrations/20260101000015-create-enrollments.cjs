'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('enrollments', {
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
      course_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      order_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      source: {
        type: Sequelize.ENUM('purchase', 'manual'),
        allowNull: false,
        defaultValue: 'purchase',
      },
      starts_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('active', 'expired', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
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
    await queryInterface.addIndex('enrollments', ["user_id","course_id","status"], { name: 'uq_enr_active', unique: true });
    await queryInterface.addIndex('enrollments', ["status","expires_at"], { name: 'idx_enr_expiry' });
    await queryInterface.addConstraint('enrollments', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_e_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('enrollments', {
            fields: ['course_id'],
      type: 'foreign key',
      name: 'fk_e_course',
      references: { table: 'courses', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('enrollments', {
            fields: ['order_id'],
      type: 'foreign key',
      name: 'fk_e_order',
      references: { table: 'orders', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('enrollments');
  },
};
