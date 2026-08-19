'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('subscription_packages', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: Sequelize.STRING(190),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(190),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      exam_category: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'NRE1',
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      original_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'PKR',
      },
      validity_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 180,
      },
      included_course_ids: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      includes_qbank: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      includes_mock_exams: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      max_devices: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 2,
      },
      features: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      badge: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_popular: {
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

    await queryInterface.addIndex('subscription_packages', ['is_active', 'sort_order'], {
      name: 'idx_subscription_packages_active_sort',
    });
    await queryInterface.addIndex('subscription_packages', ['exam_category'], {
      name: 'idx_subscription_packages_exam_cat',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('subscription_packages');
  },
};
