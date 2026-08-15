'use strict';

// server/src/db/seeders/20260101010004-seed-05-mock-exam.cjs
// Synchronized mock exams seeder.

const mockExamsData = require('../demoData/mockExamsData.cjs');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    let insertedCount = 0;

    for (const examDef of mockExamsData) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM mock_exams WHERE title = :title',
        { replacements: { title: examDef.title } }
      );
      if (existing.length > 0) continue;

      await queryInterface.bulkInsert('mock_exams', [
        {
          title: examDef.title,
          exam_category: examDef.exam_category,
          duration_minutes: examDef.duration_minutes,
          pass_percent: examDef.pass_percent,
          is_published: examDef.is_published,
          created_at: now,
          updated_at: now,
        },
      ]);

      const [[examRow]] = await queryInterface.sequelize.query(
        'SELECT id FROM mock_exams WHERE title = :title',
        { replacements: { title: examDef.title } }
      );
      const mockExamId = examRow.id;

      const [categoryQuestions] = await queryInterface.sequelize.query(
        'SELECT id FROM questions WHERE exam_category = :cat AND is_active = 1 ORDER BY id ASC LIMIT :n',
        { replacements: { cat: examDef.exam_category, n: examDef.question_count } }
      );

      const questionsToMap = categoryQuestions.length > 0
        ? categoryQuestions
        : (await queryInterface.sequelize.query('SELECT id FROM questions WHERE is_active = 1 ORDER BY id ASC LIMIT :n', {
            replacements: { n: examDef.question_count },
          }))[0];

      if (questionsToMap.length > 0) {
        const meqRows = questionsToMap.map((q, idx) => ({
          mock_exam_id: mockExamId,
          question_id: q.id,
          sort_order: idx,
        }));
        await queryInterface.bulkInsert('mock_exam_questions', meqRows);
      }
      insertedCount += 1;
    }

    console.log(`[seed:mock-exam] inserted ${insertedCount} mock exam(s).`);
  },

  async down(queryInterface) {
    const examTitles = mockExamsData.map((m) => m.title);
    await queryInterface.bulkDelete('mock_exams', { title: examTitles });
  },
};
