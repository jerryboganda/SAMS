'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('question_options', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      question_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      option_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_correct: {
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
    await queryInterface.addIndex('question_options', ["question_id","sort_order"], { name: 'idx_qo_q' });
    await queryInterface.addConstraint('question_options', {
            fields: ['question_id'],
      type: 'foreign key',
      name: 'fk_qo_q',
      references: { table: 'questions', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('question_options');
  },
};
