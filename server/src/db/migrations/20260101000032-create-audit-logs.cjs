'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      actor_user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      action: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      entity_type: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      entity_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },
      summary: {
        type: Sequelize.STRING(400),
        allowNull: true,
      },
      meta: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      ip: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('audit_logs', ["actor_user_id","created_at"], { name: 'idx_audit_actor' });
    await queryInterface.addIndex('audit_logs', ["entity_type","entity_id"], { name: 'idx_audit_entity' });
    await queryInterface.addConstraint('audit_logs', {
            fields: ['actor_user_id'],
      type: 'foreign key',
      name: 'fk_al_actor',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};
