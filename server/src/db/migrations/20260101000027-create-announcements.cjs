'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('announcements', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      audience: {
        type: Sequelize.ENUM('all', 'course'),
        allowNull: false,
        defaultValue: 'all',
      },
      course_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      send_email: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: {
        type: Sequelize.BIGINT.UNSIGNED,
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
    await queryInterface.addIndex('announcements', ["created_at"], { name: 'idx_ann_time' });
    await queryInterface.addConstraint('announcements', {
            fields: ['course_id'],
      type: 'foreign key',
      name: 'fk_ann_course',
      references: { table: 'courses', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('announcements', {
            fields: ['created_by'],
      type: 'foreign key',
      name: 'fk_ann_admin',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('announcements');
  },
};
