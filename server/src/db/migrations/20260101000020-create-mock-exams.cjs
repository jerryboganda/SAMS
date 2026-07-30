'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mock_exams', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: Sequelize.STRING(180),
        allowNull: false,
      },
      exam_category: {
        type: Sequelize.ENUM('NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'),
        allowNull: false,
      },
      duration_minutes: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      pass_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 60,
      },
      is_published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mock_exams');
  },
};
