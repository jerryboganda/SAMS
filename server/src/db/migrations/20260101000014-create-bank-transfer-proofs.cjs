'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bank_transfer_proofs', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        unique: true,
      },
      file_path: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      reference_no: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      note: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewed_by: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      reject_reason: {
        type: Sequelize.STRING(300),
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
    await queryInterface.addConstraint('bank_transfer_proofs', {
            fields: ['order_id'],
      type: 'foreign key',
      name: 'fk_btp_order',
      references: { table: 'orders', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('bank_transfer_proofs', {
            fields: ['reviewed_by'],
      type: 'foreign key',
      name: 'fk_btp_admin',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bank_transfer_proofs');
  },
};
