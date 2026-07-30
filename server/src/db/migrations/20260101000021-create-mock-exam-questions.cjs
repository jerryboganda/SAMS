'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mock_exam_questions', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      mock_exam_id: {
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
        defaultValue: 0,
      },
    });
    await queryInterface.addIndex('mock_exam_questions', ["mock_exam_id","question_id"], { name: 'uq_meq', unique: true });
    await queryInterface.addConstraint('mock_exam_questions', {
            fields: ['mock_exam_id'],
      type: 'foreign key',
      name: 'fk_meq_me',
      references: { table: 'mock_exams', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('mock_exam_questions', {
            fields: ['question_id'],
      type: 'foreign key',
      name: 'fk_meq_q',
      references: { table: 'questions', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mock_exam_questions');
  },
};
