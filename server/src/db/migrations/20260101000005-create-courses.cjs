'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('courses', {
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
      slug: {
        type: Sequelize.STRING(190),
        allowNull: false,
        unique: true,
      },
      exam_category: {
        type: Sequelize.ENUM('NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'),
        allowNull: false,
      },
      short_description: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT('medium'),
        allowNull: true,
      },
      thumbnail_url: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.CHAR(3),
        allowNull: false,
        defaultValue: 'PKR',
      },
      validity_days: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 180,
      },
      includes_qbank: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sort_order: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('courses', ["is_published","exam_category","sort_order"], { name: 'idx_courses_pub' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('courses');
  },
};
