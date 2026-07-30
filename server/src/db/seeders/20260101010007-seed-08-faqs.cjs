'use strict';

const FAQS = [
  {
    question: 'What is included in the NRE Step 1 Complete Course?',
    answer:
      'The course includes structured video lectures organized into sections, a full QBank of practice questions, and a timed mock exam — everything you need to prepare for the NRE Step 1 exam.',
  },
  {
    question: 'How long do I have access to a purchased course?',
    answer:
      'Course access is valid for the number of days shown on the course page (validity period) starting from the date of purchase or enrollment approval.',
  },
  {
    question: 'Can I access the QBank without buying a course?',
    answer:
      'QBank access is included with course enrollment. A limited set of sample questions is available publicly so you can preview the question style before purchasing.',
  },
  {
    question: 'What payment methods are supported?',
    answer:
      'We support JazzCash, EasyPaisa, Raast (manual transfer with proof upload), and bank transfer. Available options are shown at checkout based on what is currently enabled.',
  },
  {
    question: 'How do mock exams work?',
    answer:
      'Mock exams are timed, full-length practice tests drawn from the QBank. Your score and pass/fail status are calculated automatically at submission based on the exam pass percentage.',
  },
  {
    question: 'What happens if my course access expires?',
    answer:
      'Once your enrollment expires you will no longer be able to watch lectures or start new QBank tests for that course, but your past test history and analytics remain visible. You can renew access from your dashboard.',
  },
];

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [[{ cnt }]] = await queryInterface.sequelize.query('SELECT COUNT(*) AS cnt FROM faqs');
    if (Number(cnt) >= FAQS.length) {
      console.log('[seed:faqs] faqs already present, skipping.');
      return;
    }

    const rows = FAQS.map((f, idx) => ({
      question: f.question,
      answer: f.answer,
      sort_order: idx,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('faqs', rows);
    console.log(`[seed:faqs] inserted ${rows.length} FAQ(s).`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('faqs', { question: FAQS.map((f) => f.question) });
  },
};
