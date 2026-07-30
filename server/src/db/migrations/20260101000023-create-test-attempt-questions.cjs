'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('test_attempt_questions', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      test_session_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      question_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      sort_order: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      selected_option_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      is_correct: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      is_flagged: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      time_spent_seconds: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      answered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
    await queryInterface.addIndex('test_attempt_questions', ["test_session_id","question_id"], { name: 'uq_taq', unique: true });
    await queryInterface.addIndex('test_attempt_questions', ["test_session_id","sort_order"], { name: 'idx_taq_session' });
    await queryInterface.addIndex('test_attempt_questions', ["question_id"], { name: 'idx_taq_q' });
    await queryInterface.addConstraint('test_attempt_questions', {
            fields: ['test_session_id'],
      type: 'foreign key',
      name: 'fk_taq_ts',
      references: { table: 'test_sessions', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('test_attempt_questions', {
            fields: ['question_id'],
      type: 'foreign key',
      name: 'fk_taq_q',
      references: { table: 'questions', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('test_attempt_questions');
  },
};
