'use strict';

// server/src/db/demoData/studentActivityData.cjs
// Demo students, course enrollments, test session history, and dashboard study telemetry.

const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = 12;

const DEMO_STUDENTS = [
  {
    name: 'Demo Student',
    email: 'student@samsacademy.com',
    password: 'Student@123',
    role: 'student',
  },
  {
    name: 'Dr. Sarah Khan',
    email: 'dr.sarah@samsacademy.com',
    password: 'Doctor@123',
    role: 'student',
  },
  {
    name: 'Dr. Ali Hassan',
    email: 'dr.ali@samsacademy.com',
    password: 'Doctor@123',
    role: 'student',
  },
  {
    name: 'Dr. Fatima Zahra',
    email: 'dr.fatima@samsacademy.com',
    password: 'Doctor@123',
    role: 'student',
  },
];

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

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function generateStudentActivity({ userIds, courseIds, questions, options, sessionCount = 6 }) {
  const now = new Date();
  const rand = mulberry32(424242);

  // Options mapped by question ID
  const optionsByQuestion = new Map();
  for (const opt of options) {
    if (!optionsByQuestion.has(opt.question_id)) optionsByQuestion.set(opt.question_id, []);
    optionsByQuestion.get(opt.question_id).push(opt);
  }

  // 1. Enrollments: enroll students into courses
  const enrollments = [];
  userIds.forEach((userId, uIdx) => {
    // Primary demo student enrolled in multiple courses; others enrolled in 1-2
    const coursesToEnroll = uIdx === 0 ? courseIds : [courseIds[uIdx % courseIds.length]];
    coursesToEnroll.forEach((courseId) => {
      enrollments.push({
        user_id: userId,
        course_id: courseId,
        order_id: null,
        source: 'manual',
        starts_at: addDays(now, -30),
        expires_at: addDays(now, 180),
        status: 'active',
      });
    });
  });

  // 2. Test Sessions & Question History for Primary Demo Student (userIds[0])
  const primaryUserId = userIds[0];
  const testSessions = [];
  const attemptQuestions = [];
  const historyMap = new Map(); // questionId -> { timesSeen, timesCorrect, lastResult, lastSeenAt }
  const dailyMap = new Map(); // dateKey -> { attempted, correct, qbankSeconds, videoSeconds }

  const questionsPerSession = 15;
  for (let s = 0; s < sessionCount; s += 1) {
    const daysAgo = sessionCount - s; // 6 days ago ... 1 day ago
    const startedAt = addDays(now, -daysAgo);
    const sessionQuestions = questions.slice(s * 10, s * 10 + questionsPerSession);
    if (sessionQuestions.length === 0) break;

    let correctCount = 0;
    let incorrectCount = 0;
    let skippedCount = 0;
    let totalTimeSpent = 0;
    const sessionAttemptRows = [];

    sessionQuestions.forEach((q, idx) => {
      const qOpts = optionsByQuestion.get(q.id) || [];
      const correctOpt = qOpts.find((o) => Boolean(o.is_correct));
      const wrongOpts = qOpts.filter((o) => !o.is_correct);
      const roll = rand();

      let selectedOptionId = null;
      let isCorrect = null;
      let answeredAt = null;
      const timeSpent = 25 + Math.floor(rand() * 60);

      if (roll < 0.75 && correctOpt) {
        selectedOptionId = correctOpt.id;
        isCorrect = true;
        correctCount += 1;
        answeredAt = new Date(startedAt.getTime() + (idx + 1) * 75 * 1000);
        totalTimeSpent += timeSpent;
      } else if (roll < 0.95 && wrongOpts.length > 0) {
        selectedOptionId = wrongOpts[Math.floor(rand() * wrongOpts.length)].id;
        isCorrect = false;
        incorrectCount += 1;
        answeredAt = new Date(startedAt.getTime() + (idx + 1) * 75 * 1000);
        totalTimeSpent += timeSpent;
      } else {
        skippedCount += 1;
      }

      sessionAttemptRows.push({
        session_index: s,
        question_id: q.id,
        sort_order: idx,
        selected_option_id: selectedOptionId,
        is_correct: isCorrect,
        is_flagged: rand() < 0.1,
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

    const completedAt = new Date(startedAt.getTime() + sessionQuestions.length * 75 * 1000);
    const scorePercent = Number(((correctCount / sessionQuestions.length) * 100).toFixed(2));

    testSessions.push({
      session_index: s,
      user_id: primaryUserId,
      mode: s % 2 === 0 ? 'practice' : 'timed',
      mock_exam_id: null,
      exam_category: 'NRE1',
      filters: JSON.stringify({ subjectIds: [], systemIds: [], difficulty: null, pool: 'all' }),
      question_count: sessionQuestions.length,
      time_limit_seconds: s % 2 === 0 ? null : sessionQuestions.length * 90,
      status: 'completed',
      started_at: startedAt,
      completed_at: completedAt,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      skipped_count: skippedCount,
      score_percent: scorePercent,
      passed: scorePercent >= 60.0,
    });

    attemptQuestions.push(...sessionAttemptRows);

    const dateKey = toDateOnly(completedAt);
    const prevDaily = dailyMap.get(dateKey) || { attempted: 0, correct: 0, qbankSeconds: 0, videoSeconds: 0 };
    dailyMap.set(dateKey, {
      attempted: prevDaily.attempted + correctCount + incorrectCount,
      correct: prevDaily.correct + correctCount,
      qbankSeconds: prevDaily.qbankSeconds + totalTimeSpent,
      videoSeconds: prevDaily.videoSeconds + 1200 + Math.floor(rand() * 1800),
    });
  }

  const historyRows = Array.from(historyMap.entries()).map(([questionId, h]) => ({
    user_id: primaryUserId,
    question_id: questionId,
    times_seen: h.timesSeen,
    times_correct: h.timesCorrect,
    last_result: h.lastResult,
    last_seen_at: h.lastSeenAt,
  }));

  const dailyStatsRows = Array.from(dailyMap.entries()).map(([dateKey, d]) => ({
    user_id: primaryUserId,
    stat_date: dateKey,
    questions_attempted: d.attempted,
    questions_correct: d.correct,
    qbank_seconds: d.qbankSeconds,
    video_seconds: d.videoSeconds,
  }));

  return {
    enrollments,
    testSessions,
    attemptQuestions,
    historyRows,
    dailyStatsRows,
  };
}

module.exports = {
  BCRYPT_ROUNDS,
  DEMO_STUDENTS,
  generateStudentActivity,
};
