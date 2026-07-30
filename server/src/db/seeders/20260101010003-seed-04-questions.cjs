'use strict';

// Deterministic PRNG (mulberry32) so a fresh-DB seed run is reproducible.
function mulberry32(seed) {
  let s = seed;
  return function rand() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const QUESTION_COUNT = 200;

const OPENERS = [
  (subject, system) =>
    `A 34-year-old patient presents with clinical findings suggestive of a disorder involving the ${system} system.`,
  (subject, system) =>
    `A 58-year-old patient's routine work-up reveals an abnormality most consistent with a ${system} system condition.`,
  (subject, system) => `A medical student is asked to explain the ${subject} basis of a classic ${system} system finding.`,
  (subject, system) => `During ward rounds, a case of a ${system} system disorder prompts a question about its ${subject} mechanism.`,
  (subject, system) => `A 45-year-old patient with a history of a ${system} system condition undergoes further evaluation.`,
];

function buildOptionPool(subject, system) {
  const s = subject.toLowerCase();
  const y = system.toLowerCase();
  return [
    `Increased ${y} system vascular resistance secondary to altered ${s} regulation`,
    `Impaired ${s} enzyme or receptor function affecting the ${y} system`,
    `A compensatory ${y} system response driven by abnormal ${s} signaling`,
    `Disrupted ${s} feedback control leading to ${y} system dysfunction`,
  ];
}

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [[{ cnt }]] = await queryInterface.sequelize.query('SELECT COUNT(*) AS cnt FROM questions');
    if (Number(cnt) >= QUESTION_COUNT) {
      console.log(`[seed:questions] ${cnt} questions already present (>= ${QUESTION_COUNT}), skipping.`);
      return;
    }

    const [subjects] = await queryInterface.sequelize.query('SELECT id, name FROM subjects ORDER BY sort_order ASC');
    const [systems] = await queryInterface.sequelize.query('SELECT id, name FROM body_systems ORDER BY sort_order ASC');
    if (subjects.length === 0 || systems.length === 0) {
      throw new Error('[seed:questions] subjects/body_systems must be seeded first.');
    }

    const rand = mulberry32(20260101);
    const questionRows = [];
    for (let i = 0; i < QUESTION_COUNT; i += 1) {
      const subject = subjects[i % subjects.length];
      const system = systems[i % systems.length];
      const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];
      const opener = OPENERS[i % OPENERS.length](subject.name, system.name);

      questionRows.push({
        exam_category: 'NRE1',
        subject_id: subject.id,
        system_id: system.id,
        stem: `${opener} Which of the following best explains the underlying ${subject.name} mechanism most relevant to this presentation? (Case ${i + 1})`,
        image_url: null,
        explanation: `This scenario is best explained by core ${subject.name} principles as they apply to the ${system.name} system. Reviewing the underlying pathophysiology clarifies why the correct option accounts for the presentation described, while the remaining options describe plausible but less directly relevant mechanisms.`,
        reference_text: `${subject.name} — ${system.name} system review.`,
        difficulty,
        is_active: true,
        times_attempted: 0,
        times_correct: 0,
        created_at: now,
        updated_at: now,
      });
    }

    await queryInterface.bulkInsert('questions', questionRows);

    const [inserted] = await queryInterface.sequelize.query(
      "SELECT id, subject_id, system_id FROM questions WHERE exam_category = 'NRE1' ORDER BY id DESC LIMIT :n",
      { replacements: { n: QUESTION_COUNT } }
    );
    // rows come back DESC (most recent first) — restore ascending insertion order
    const insertedAsc = inserted.slice().reverse();

    const subjectById = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
    const systemById = Object.fromEntries(systems.map((s) => [s.id, s.name]));

    const optionRows = [];
    insertedAsc.forEach((q, i) => {
      const pool = buildOptionPool(subjectById[q.subject_id], systemById[q.system_id]);
      const correctIndex = i % 4;
      pool.forEach((text, idx) => {
        optionRows.push({
          question_id: q.id,
          option_text: text,
          is_correct: idx === correctIndex,
          sort_order: idx,
          created_at: now,
          updated_at: now,
        });
      });
    });

    await queryInterface.bulkInsert('question_options', optionRows);

    console.log(`[seed:questions] inserted ${questionRows.length} questions and ${optionRows.length} options.`);
  },

  async down(queryInterface) {
    // question_options cascade-delete via FK when their question is removed.
    await queryInterface.bulkDelete('questions', { exam_category: 'NRE1' });
  },
};
