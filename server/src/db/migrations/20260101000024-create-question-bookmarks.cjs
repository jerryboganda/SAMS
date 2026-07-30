'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('question_bookmarks', {
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
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('question_bookmarks', ["user_id","question_id"], { name: 'uq_qb', unique: true });
    await queryInterface.addConstraint('question_bookmarks', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_qb_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('question_bookmarks', {
            fields: ['question_id'],
      type: 'foreign key',
      name: 'fk_qb_q',
      references: { table: 'questions', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('question_bookmarks');
  },
};
