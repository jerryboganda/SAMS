'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      invoice_no: {
        type: Sequelize.STRING(30),
        allowNull: false,
        unique: true,
      },
      user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      course_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      final_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.CHAR(3),
        allowNull: false,
        defaultValue: 'PKR',
      },
      coupon_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      gateway: {
        type: Sequelize.ENUM('jazzcash', 'easypaisa', 'raast', 'payfast', 'safepay', 'bank_transfer', 'manual', 'mock'),
        allowNull: false,
      },
      gateway_ref: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'awaiting_verification', 'paid', 'failed', 'cancelled', 'refunded'),
        allowNull: false,
        defaultValue: 'pending',
      },
      paid_at: {
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
    await queryInterface.addIndex('orders', ["user_id","created_at"], { name: 'idx_orders_user' });
    await queryInterface.addIndex('orders', ["status","created_at"], { name: 'idx_orders_status' });
    await queryInterface.addIndex('orders', ["gateway","gateway_ref"], { name: 'idx_orders_gwref' });
    await queryInterface.addConstraint('orders', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_o_user',
      references: { table: 'users', field: 'id' },
    });
    await queryInterface.addConstraint('orders', {
            fields: ['course_id'],
      type: 'foreign key',
      name: 'fk_o_course',
      references: { table: 'courses', field: 'id' },
    });
    await queryInterface.addConstraint('orders', {
            fields: ['coupon_id'],
      type: 'foreign key',
      name: 'fk_o_coupon',
      references: { table: 'coupons', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('orders');
  },
};
