'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('test_sessions', {
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
      mode: {
        type: Sequelize.ENUM('practice', 'exam', 'mock'),
        allowNull: false,
      },
      mock_exam_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      exam_category: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      filters: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      question_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      time_limit_seconds: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('in_progress', 'completed', 'abandoned'),
        allowNull: false,
        defaultValue: 'in_progress',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      correct_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      incorrect_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      skipped_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      score_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      passed: {
        type: Sequelize.BOOLEAN,
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
    await queryInterface.addIndex('test_sessions', ["user_id","status","started_at"], { name: 'idx_ts_user' });
    await queryInterface.addConstraint('test_sessions', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_ts_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('test_sessions', {
            fields: ['mock_exam_id'],
      type: 'foreign key',
      name: 'fk_ts_mock',
      references: { table: 'mock_exams', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('test_sessions');
  },
};
