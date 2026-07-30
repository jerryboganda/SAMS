'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('coupons', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: Sequelize.STRING(40),
        allowNull: false,
        unique: true,
      },
      type: {
        type: Sequelize.ENUM('percent', 'fixed'),
        allowNull: false,
      },
      value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      course_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      max_uses: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      used_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      valid_from: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      valid_until: {
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
    await queryInterface.addConstraint('coupons', {
            fields: ['course_id'],
      type: 'foreign key',
      name: 'fk_coupon_course',
      references: { table: 'courses', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('coupons');
  },
};
