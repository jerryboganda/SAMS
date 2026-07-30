'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lectures', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      course_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      section_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      video_provider: {
        type: Sequelize.ENUM('bunny', 'mock'),
        allowNull: false,
        defaultValue: 'bunny',
      },
      video_ref: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      duration_seconds: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      is_free_preview: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_published: {
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
    await queryInterface.addIndex('lectures', ["section_id","sort_order"], { name: 'idx_lectures_sec' });
    await queryInterface.addIndex('lectures', ["course_id"], { name: 'idx_lectures_course' });
    await queryInterface.addConstraint('lectures', {
            fields: ['course_id'],
      type: 'foreign key',
      name: 'fk_lec_course',
      references: { table: 'courses', field: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('lectures', {
            fields: ['section_id'],
      type: 'foreign key',
      name: 'fk_lec_section',
      references: { table: 'course_sections', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('lectures');
  },
};
