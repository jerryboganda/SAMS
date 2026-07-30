'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('questions', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      exam_category: {
        type: Sequelize.ENUM('NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'),
        allowNull: false,
      },
      subject_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      system_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },
      stem: {
        type: Sequelize.TEXT('medium'),
        allowNull: false,
      },
      image_url: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      explanation: {
        type: Sequelize.TEXT('medium'),
        allowNull: false,
      },
      reference_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      difficulty: {
        type: Sequelize.ENUM('easy', 'medium', 'hard'),
        allowNull: false,
        defaultValue: 'medium',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      times_attempted: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      times_correct: {
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
    await queryInterface.addIndex('questions', ["exam_category","subject_id","system_id","is_active"], { name: 'idx_q_filter' });
    await queryInterface.addConstraint('questions', {
            fields: ['subject_id'],
      type: 'foreign key',
      name: 'fk_q_subject',
      references: { table: 'subjects', field: 'id' },
    });
    await queryInterface.addConstraint('questions', {
            fields: ['system_id'],
      type: 'foreign key',
      name: 'fk_q_system',
      references: { table: 'body_systems', field: 'id' },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('questions');
  },
};
