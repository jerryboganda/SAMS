'use strict';

// Deterministic PRNG (mulberry32) — same technique as the questions seeder,
// different seed constant so the two don't produce correlated sequences.
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

const DEMO_EMAIL = 'student@samsacademy.com';
const COURSE_SLUG = 'nre-step-1-complete-course';
const SESSION_COUNT = 5;
const QUESTIONS_PER_SESSION = 10;

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [[user]] = await queryInterface.sequelize.query('SELECT id FROM users WHERE email = :email', {
      replacements: { email: DEMO_EMAIL },
    });
    const [[course]] = await queryInterface.sequelize.query(
      'SELECT id, validity_days FROM courses WHERE slug = :slug',
      { replacements: { slug: COURSE_SLUG } }
    );
    if (!user || !course) {
      throw new Error('[seed:demo-activity] demo student or seeded course not found; run earlier seeders first.');
    }

    const [existingEnrollment] = await queryInterface.sequelize.query(
      "SELECT id FROM enrollments WHERE user_id = :userId AND course_id = :courseId AND status = 'active'",
      { replacements: { userId: user.id, courseId: course.id } }
    );
    if (existingEnrollment.length > 0) {
      console.log('[seed:demo-activity] demo enrollment already present, skipping.');
      return;
    }

    await queryInterface.bulkInsert('enrollments', [
      {
        user_id: user.id,
        course_id: course.id,
        order_id: null,
        source: 'manual',
        starts_at: now,
        expires_at: addDays(now, course.validity_days),
        status: 'active',
        created_at: now,
        updated_at: now,
      },
    ]);
    console.log('[seed:demo-activity] inserted demo enrollment.');

    const [questions] = await queryInterface.sequelize.query(
      "SELECT id FROM questions WHERE exam_category = 'NRE1' ORDER BY id ASC"
    );
    if (questions.length < QUESTIONS_PER_SESSION) {
      console.log('[seed:demo-activity] not enough seeded questions for demo test sessions, skipping test data.');
      return;
    }
    const [options] = await queryInterface.sequelize.query(
      'SELECT id, question_id, is_correct FROM question_options'
    );
    const optionsByQuestion = new Map();
    for (const opt of options) {
      if (!optionsByQuestion.has(opt.question_id)) optionsByQuestion.set(opt.question_id, []);
      optionsByQuestion.get(opt.question_id).push(opt);
    }

    const rand = mulberry32(987654321);
    const historyMap = new Map(); // questionId -> { timesSeen, timesCorrect, lastResult, lastSeenAt }
    const dailyMap = new Map(); // 'YYYY-MM-DD' -> { attempted, correct, qbankSeconds }

    for (let s = 0; s < SESSION_COUNT; s += 1) {
      const daysAgo = SESSION_COUNT - s; // oldest session first (5 days ago .. 1 day ago)
      const startedAt = addDays(now, -daysAgo);
      const sessionQuestions = shuffle(questions, rand).slice(0, QUESTIONS_PER_SESSION);

      let correctCount = 0;
      let incorrectCount = 0;
      let skippedCount = 0;
      let totalTimeSpent = 0;
      const attemptRows = [];

      sessionQuestions.forEach((q, idx) => {
        const opts = optionsByQuestion.get(q.id) || [];
        const correctOpt = opts.find((o) => Boolean(o.is_correct));
        const wrongOpts = opts.filter((o) => !o.is_correct);
        const roll = rand();

        let selectedOptionId = null;
        let isCorrect = null;
        let answeredAt = null;
        const timeSpent = 20 + Math.floor(rand() * 70);

        if (roll < 0.7 && correctOpt) {
          selectedOptionId = correctOpt.id;
          isCorrect = true;
          correctCount += 1;
          answeredAt = new Date(startedAt.getTime() + (idx + 1) * 60 * 1000);
          totalTimeSpent += timeSpent;
        } else if (roll < 0.9 && wrongOpts.length > 0) {
          selectedOptionId = wrongOpts[Math.floor(rand() * wrongOpts.length)].id;
          isCorrect = false;
          incorrectCount += 1;
          answeredAt = new Date(startedAt.getTime() + (idx + 1) * 60 * 1000);
          totalTimeSpent += timeSpent;
        } else {
          skippedCount += 1;
        }

        attemptRows.push({
          question_id: q.id,
          sort_order: idx,
          selected_option_id: selectedOptionId,
          is_correct: isCorrect,
          is_flagged: rand() < 0.15,
          time_spent_seconds: selectedOptionId ? timeSpent : 0,
          answered_at: answeredAt,
        });

        const result = isCorrect === true ? 'correct' : isCorrect === false ? 'incorrect' : 'skipped';
        const prev = historyMap.get(q.id) || { timesSeen: 0, timesCorrect: 0 };
        historyMap.set(q.id, {
          timesSeen: prev.timesSeen + 1,
          timesCorrect: prev.timesCorrect + (isCorrect === true ? 1 : 0),
          lastResult: result,
          lastSeenAt: answeredAt || startedAt,
        });
      });

      const completedAt = new Date(startedAt.getTime() + QUESTIONS_PER_SESSION * 60 * 1000);
      const scorePercent = Number(((correctCount / QUESTIONS_PER_SESSION) * 100).toFixed(2));

      await queryInterface.bulkInsert('test_sessions', [
        {
          user_id: user.id,
          mode: 'practice',
          mock_exam_id: null,
          exam_category: 'NRE1',
          filters: JSON.stringify({ subjectIds: [], systemIds: [], difficulty: null, pool: 'all' }),
          question_count: QUESTIONS_PER_SESSION,
          time_limit_seconds: null,
          status: 'completed',
          started_at: startedAt,
          completed_at: completedAt,
          correct_count: correctCount,
          incorrect_count: incorrectCount,
          skipped_count: skippedCount,
          score_percent: scorePercent,
          passed: null,
          created_at: startedAt,
          updated_at: completedAt,
        },
      ]);

      // NOTE: match by ORDER BY id DESC rather than started_at, since MySQL's
      // DATETIME column truncates the JS Date's milliseconds on write, so an
      // exact-value WHERE match against the original in-memory Date fails.
      const [[{ id: sessionId }]] = await queryInterface.sequelize.query(
        'SELECT id FROM test_sessions WHERE user_id = :userId ORDER BY id DESC LIMIT 1',
        { replacements: { userId: user.id } }
      );

      await queryInterface.bulkInsert(
        'test_attempt_questions',
        attemptRows.map((r) => ({ ...r, test_session_id: sessionId }))
      );

      const dateKey = toDateOnly(completedAt);
      const prevDaily = dailyMap.get(dateKey) || { attempted: 0, correct: 0, qbankSeconds: 0 };
      dailyMap.set(dateKey, {
        attempted: prevDaily.attempted + correctCount + incorrectCount,
        correct: prevDaily.correct + correctCount,
        qbankSeconds: prevDaily.qbankSeconds + totalTimeSpent,
      });
    }

    const historyRows = Array.from(historyMap.entries()).map(([questionId, h]) => ({
      user_id: user.id,
      question_id: questionId,
      times_seen: h.timesSeen,
      times_correct: h.timesCorrect,
      last_result: h.lastResult,
      last_seen_at: h.lastSeenAt,
    }));
    if (historyRows.length > 0) {
      await queryInterface.bulkInsert('user_question_history', historyRows);
    }

    const dailyRows = Array.from(dailyMap.entries()).map(([dateKey, d]) => ({
      user_id: user.id,
      stat_date: dateKey,
      questions_attempted: d.attempted,
      questions_correct: d.correct,
      qbank_seconds: d.qbankSeconds,
      video_seconds: 0,
    }));
    if (dailyRows.length > 0) {
      await queryInterface.bulkInsert('user_daily_stats', dailyRows);
    }

    console.log(
      `[seed:demo-activity] inserted ${SESSION_COUNT} test sessions, ${historyRows.length} history rows, ${dailyRows.length} daily-stat rows.`
    );
  },

  async down(queryInterface) {
    const [[user]] = await queryInterface.sequelize.query('SELECT id FROM users WHERE email = :email', {
      replacements: { email: DEMO_EMAIL },
    });
    const [[course]] = await queryInterface.sequelize.query('SELECT id FROM courses WHERE slug = :slug', {
      replacements: { slug: COURSE_SLUG },
    });
    if (!user) return;

    // test_attempt_questions cascade-delete via FK when their test_session is removed.
    await queryInterface.bulkDelete('test_sessions', { user_id: user.id, mode: 'practice' });
    await queryInterface.bulkDelete('user_question_history', { user_id: user.id });
    await queryInterface.bulkDelete('user_daily_stats', { user_id: user.id });
    if (course) {
      await queryInterface.bulkDelete('enrollments', { user_id: user.id, course_id: course.id, source: 'manual' });
    }
  },
};
