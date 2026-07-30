'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_question_history', {
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
      question_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      times_seen: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      times_correct: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      last_result: {
        type: Sequelize.ENUM('correct', 'incorrect', 'skipped'),
        allowNull: true,
        defaultValue: null,
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
    await queryInterface.addIndex('user_question_history', ["user_id","question_id"], { name: 'uq_uqh', unique: true });
    await queryInterface.addIndex('user_question_history', ["user_id","last_result"], { name: 'idx_uqh_user_result' });
    await queryInterface.addConstraint('user_question_history', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_uqh_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('user_question_history', {
            fields: ['question_id'],
      type: 'foreign key',
      name: 'fk_uqh_q',
      references: { table: 'questions', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_question_history');
  },
};
