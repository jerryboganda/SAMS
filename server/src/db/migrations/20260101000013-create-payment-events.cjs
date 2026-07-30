'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_events', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      gateway: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      event_type: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      external_ref: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      payload: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      signature_valid: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('payment_events', ["order_id"], { name: 'idx_pe_order' });
    await queryInterface.addIndex('payment_events', ["gateway","external_ref"], { name: 'idx_pe_ext' });
    await queryInterface.addConstraint('payment_events', {
            fields: ['order_id'],
      type: 'foreign key',
      name: 'fk_pe_order',
      references: { table: 'orders', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_events');
  },
};
