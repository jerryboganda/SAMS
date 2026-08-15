'use strict';

// server/src/db/seeders/20260101010003-seed-04-questions.cjs
// Synchronized question bank seeder (500+ questions across all categories).

const { generateQuestions } = require('../demoData/questionsData.cjs');

const TARGET_QUESTION_COUNT = 500;

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [[{ cnt }]] = await queryInterface.sequelize.query('SELECT COUNT(*) AS cnt FROM questions');
    if (Number(cnt) >= TARGET_QUESTION_COUNT) {
      console.log(`[seed:questions] ${cnt} questions already present (>= ${TARGET_QUESTION_COUNT}), skipping.`);
      return;
    }

    const [subjects] = await queryInterface.sequelize.query('SELECT id, name FROM subjects ORDER BY sort_order ASC');
    const [systems] = await queryInterface.sequelize.query('SELECT id, name FROM body_systems ORDER BY sort_order ASC');
    if (subjects.length === 0 || systems.length === 0) {
      throw new Error('[seed:questions] subjects/body_systems must be seeded first.');
    }

    const neededCount = TARGET_QUESTION_COUNT - Number(cnt);
    const { questions, options } = generateQuestions(subjects, systems, neededCount);

    const questionRows = questions.map((q) => ({
      exam_category: q.exam_category,
      subject_id: q.subject_id,
      system_id: q.system_id,
      stem: q.stem,
      image_url: q.image_url,
      explanation: q.explanation,
      reference_text: q.reference_text,
      difficulty: q.difficulty,
      is_active: q.is_active,
      times_attempted: 0,
      times_correct: 0,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('questions', questionRows);

    const [insertedQuestions] = await queryInterface.sequelize.query(
      'SELECT id FROM questions ORDER BY id DESC LIMIT :n',
      { replacements: { n: questionRows.length } }
    );
    const insertedQuestionsAsc = insertedQuestions.slice().reverse();

    const optionRows = [];
    insertedQuestionsAsc.forEach((q, idx) => {
      const questionOpts = options.filter((o) => o.question_index === idx);
      questionOpts.forEach((opt) => {
        optionRows.push({
          question_id: q.id,
          option_text: opt.option_text,
          is_correct: opt.is_correct,
          sort_order: opt.sort_order,
          created_at: now,
          updated_at: now,
        });
      });
    });

    if (optionRows.length > 0) {
      await queryInterface.bulkInsert('question_options', optionRows);
    }

    console.log(`[seed:questions] inserted ${questionRows.length} questions and ${optionRows.length} options.`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('questions', null, {});
  },
};
