'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lecture_bookmarks', {
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
      lecture_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('lecture_bookmarks', ["user_id","lecture_id"], { name: 'uq_lb', unique: true });
    await queryInterface.addConstraint('lecture_bookmarks', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_lb_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('lecture_bookmarks', {
            fields: ['lecture_id'],
      type: 'foreign key',
      name: 'fk_lb_lecture',
      references: { table: 'lectures', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('lecture_bookmarks');
  },
};
