'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      key: {
        type: Sequelize.STRING(80),
        allowNull: false,
        primaryKey: true,
      },
      value: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('settings');
  },
};
