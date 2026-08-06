'use strict';

const MOCK_EXAM_TITLE = 'NRE Step 1 Mock Exam 1';

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    if (process.env.SEED_MODE === 'prod') {
      console.log('[seed:mock-exam] skipped — SEED_MODE=prod (demo-only content).');
      return;
    }

    const now = new Date();

    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM mock_exams WHERE title = :title',
      { replacements: { title: MOCK_EXAM_TITLE } }
    );
    if (existing.length > 0) {
      console.log('[seed:mock-exam] mock exam already present, skipping.');
      return;
    }

    const [questions] = await queryInterface.sequelize.query(
      "SELECT id FROM questions WHERE exam_category = 'NRE1' ORDER BY id ASC LIMIT 50"
    );
    if (questions.length < 50) {
      throw new Error('[seed:mock-exam] fewer than 50 seeded questions available; run the questions seeder first.');
    }

    await queryInterface.bulkInsert('mock_exams', [
      {
        title: MOCK_EXAM_TITLE,
        exam_category: 'NRE1',
        duration_minutes: 60,
        pass_percent: 60.0,
        is_published: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    const [[{ id: mockExamId }]] = await queryInterface.sequelize.query(
      'SELECT id FROM mock_exams WHERE title = :title',
      { replacements: { title: MOCK_EXAM_TITLE } }
    );

    const meqRows = questions.map((q, idx) => ({
      mock_exam_id: mockExamId,
      question_id: q.id,
      sort_order: idx,
    }));
    await queryInterface.bulkInsert('mock_exam_questions', meqRows);

    console.log(`[seed:mock-exam] inserted 1 mock exam with ${meqRows.length} questions.`);
  },

  async down(queryInterface) {
    // mock_exam_questions cascade-delete via FK when the mock exam is removed.
    await queryInterface.bulkDelete('mock_exams', { title: MOCK_EXAM_TITLE });
  },
};
