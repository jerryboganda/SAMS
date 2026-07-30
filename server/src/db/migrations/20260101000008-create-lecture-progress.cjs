'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lecture_progress', {
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
      watched_seconds: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      last_position_seconds: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      is_completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      completed_at: {
        type: Sequelize.DATE,
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
    await queryInterface.addIndex('lecture_progress', ["user_id","lecture_id"], { name: 'uq_lp', unique: true });
    await queryInterface.addIndex('lecture_progress', ["user_id","updated_at"], { name: 'idx_lp_user_updated' });
    await queryInterface.addConstraint('lecture_progress', {
            fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_lp_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('lecture_progress', {
            fields: ['lecture_id'],
      type: 'foreign key',
      name: 'fk_lp_lecture',
      references: { table: 'lectures', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('lecture_progress');
  },
};
