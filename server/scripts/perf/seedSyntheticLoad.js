#!/usr/bin/env node
// server/scripts/perf/seedSyntheticLoad.js
// Phase 12.4 (docs/07_EXECUTION_PLAN.md) synthetic load generator. Produces
// a ~10k-question / ~1k-user dataset in a dedicated, isolated perf database
// so server/scripts/perf/runPerfSuite.js has realistic volume to EXPLAIN and
// time the hot-path queries against — see docs/PERF_REPORT.md for results.
//
// Run: `node server/scripts/perf/seedSyntheticLoad.js` (paths are resolved
// from this file's own location via lib/perfDb.js, not from cwd). This is a
// standalone, opt-in script — NOT part of the Jest suite and NOT wired into
// `npm run seed` (which seeds the small, real dev/test fixture set).
//
// === Isolation (CLAUDE.md safety constraint) ===
// Targets ONLY env.DB_NAME_PERF (server/src/config/env.js, default
// 'sams_academy_perf'; server/src/db/config.cjs's new `perf` key) — NEVER
// env.DB_NAME (the real dev DB) or env.DB_NAME_test (jest's DB, reset by
// server/tests/globalSetup.cjs on every `npm test` run).
// lib/perfDb.js#assertPerfDbIsolated() hard-refuses to run at all if
// DB_NAME_PERF has been misconfigured to equal either of those.
//
// === Idempotency judgment call (this task's own prompt asked for one) ===
// Chosen: full schema reset (sequelize-cli `db:migrate:undo:all` then
// `db:migrate`, both `--env perf`) EVERY run, then a complete reseed from
// scratch — NOT a `--force` flag, NOT per-table TRUNCATE. Rationale:
//   1. This is the EXACT mechanism server/tests/globalSetup.cjs already
//      established and proved reliable for an analogous "always start from a
//      known-clean, fully-migrated schema" need — reusing a proven
//      mechanism beats hand-maintaining FK-aware TRUNCATE ordering across
//      ~35 tables.
//   2. It guarantees the perf DB is on the CURRENT migration set (including
//      the Part-C index migration this task may add) on every run, so it can
//      never silently drift from docs/03_DATABASE_SCHEMA.md.
//   3. This script is never run automatically (opt-in, by hand, only for a
//      perf investigation) — the schema-reset cost is a non-issue for that
//      usage pattern. See docs/PERF_REPORT.md for the measured run time.
// A `--keep-schema` flag is provided for the one specific case that must NOT
// reset (re-seeding is never needed for it): re-measuring after Part C adds
// an index migration to an ALREADY-seeded perf DB — that flow uses
// runPerfSuite.js's own `--migrate` flag instead (lib/perfDb.js#migratePerfDb,
// additive `db:migrate` only), never this script.
import bcrypt from 'bcrypt';
import {
  assertPerfDbIsolated,
  ensureDatabaseExists,
  resetPerfSchema,
  buildPerfSequelize,
  loadPerfModels,
  mulberry32,
  randInt,
  pick,
  shuffle,
  toDateOnly,
  bulkInsertBatched,
  PERF_DB_NAME,
} from './lib/perfDb.js';

const KEEP_SCHEMA = process.argv.includes('--keep-schema');

// ---------------------------------------------------------------------------
// Scale constants — task brief: "~10k-question/1k-user synthetic load"
// ---------------------------------------------------------------------------
const STUDENT_COUNT = 950;
const ADMIN_COUNT = 12; // "a handful of admins"
const QUESTION_COUNT = 10000;
const COURSE_COUNT = 24;
const SECTIONS_PER_COURSE = 3;
const LECTURES_PER_SECTION = 4;
const ENROLLED_STUDENT_FRACTION = 0.6; // "a fraction of the 1000 students should have real enrollment"
const QBANK_ACTIVE_STUDENT_TARGET = 500; // "... + QBank attempt history"
const BCRYPT_ROUNDS = 12; // CLAUDE.md §1: bcrypt (12 rounds)

const EXAM_CATEGORIES = ['NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER'];
const SUBJECTS = ['Anatomy', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 'Microbiology', 'Immunology', 'Behavioral Science', 'Biostatistics'];
const BODY_SYSTEMS = ['Cardiovascular', 'Respiratory', 'GIT', 'Renal', 'Endocrine', 'Reproductive', 'MSK', 'Neuro', 'Heme/Onc', 'General Principles'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const PAID_GATEWAYS = ['jazzcash', 'easypaisa', 'mock'];
const MANUAL_GATEWAYS = ['bank_transfer', 'raast'];

function pad(n, width) {
  return String(n).padStart(width, '0');
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------
async function seedTaxonomy(db) {
  const now = new Date();
  const subjects = await db.Subject.bulkCreate(
    SUBJECTS.map((name, idx) => ({ name, sortOrder: idx, createdAt: now, updatedAt: now }))
  );
  const systems = await db.BodySystem.bulkCreate(
    BODY_SYSTEMS.map((name, idx) => ({ name, sortOrder: idx, createdAt: now, updatedAt: now }))
  );
  return { subjects, systems };
}

// ---------------------------------------------------------------------------
// Courses + sections + lectures
// ---------------------------------------------------------------------------
async function seedCourses(db) {
  const now = new Date();
  const perCategory = new Map();
  const courseRows = [];
  for (let i = 0; i < COURSE_COUNT; i += 1) {
    const category = EXAM_CATEGORIES[i % EXAM_CATEGORIES.length];
    const n = (perCategory.get(category) || 0) + 1;
    perCategory.set(category, n);
    courseRows.push({
      title: `${category} Perf Course ${n}`,
      slug: `perf-course-${category.toLowerCase()}-${n}`,
      examCategory: category,
      shortDescription: 'Synthetic perf-load course (server/scripts/perf/seedSyntheticLoad.js).',
      description: 'Synthetic perf-load course generated for docs/07_EXECUTION_PLAN.md Phase 12.4.',
      thumbnailUrl: null,
      price: 10000 + (i % 5) * 1000,
      currency: 'PKR',
      validityDays: 180,
      includesQbank: true,
      isPublished: true,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    });
  }
  const courses = await db.Course.bulkCreate(courseRows);

  const sectionRows = [];
  for (const course of courses) {
    for (let s = 0; s < SECTIONS_PER_COURSE; s += 1) {
      sectionRows.push({ courseId: course.id, title: `Section ${s + 1}`, sortOrder: s, createdAt: now, updatedAt: now });
    }
  }
  const sections = await bulkInsertBatched(db.CourseSection, sectionRows, { batchSize: 2000 });

  const sectionsByCourse = new Map();
  for (const sec of sections) {
    if (!sectionsByCourse.has(sec.courseId)) sectionsByCourse.set(sec.courseId, []);
    sectionsByCourse.get(sec.courseId).push(sec);
  }

  const lectureRows = [];
  for (const course of courses) {
    const secs = sectionsByCourse.get(course.id) || [];
    secs.forEach((sec, sIdx) => {
      for (let l = 0; l < LECTURES_PER_SECTION; l += 1) {
        lectureRows.push({
          courseId: course.id,
          sectionId: sec.id,
          title: `${sec.title} — Lecture ${l + 1}`,
          description: 'Synthetic perf-load lecture.',
          videoProvider: 'mock',
          videoRef: `perf-${course.id}-${sec.id}-${l + 1}`,
          durationSeconds: 600 + l * 120,
          isFreePreview: sIdx === 0 && l === 0,
          isPublished: true,
          sortOrder: l,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }
  const lectures = await bulkInsertBatched(db.Lecture, lectureRows, { batchSize: 2000 });

  const lecturesByCourseId = new Map();
  for (const lec of lectures) {
    if (!lecturesByCourseId.has(lec.courseId)) lecturesByCourseId.set(lec.courseId, []);
    lecturesByCourseId.get(lec.courseId).push(lec);
  }

  return { courses, courseById: new Map(courses.map((c) => [c.id, c])), lecturesByCourseId };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
async function seedUsers(db, rand) {
  const now = new Date();
  // Hashed ONCE and reused for every synthetic user — this fixture data is
  // never meant to be a real login path (email addresses are `*.test`), only
  // realistic, valid, non-null content for a NOT NULL bcrypt column; hashing
  // ~1000 times individually at 12 rounds would add real, pointless minutes
  // to this script's run time for zero benefit.
  const passwordHash = await bcrypt.hash('PerfLoad@12345', BCRYPT_ROUNDS);

  const rows = [];
  for (let i = 0; i < ADMIN_COUNT; i += 1) {
    rows.push({
      name: `Perf Admin ${i + 1}`,
      email: `perf-admin-${i + 1}@perf.samsacademy.test`,
      phone: null,
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: now,
      twofaEnabled: false,
      twofaSecret: null,
      twofaBackupCodes: null,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (let i = 0; i < STUDENT_COUNT; i += 1) {
    const createdAt = new Date(now.getTime() - randInt(rand, 0, 364) * 86400000);
    rows.push({
      name: `Perf Student ${i + 1}`,
      email: `perf-student-${i + 1}@perf.samsacademy.test`,
      phone: null,
      passwordHash,
      role: 'student',
      status: 'active',
      emailVerifiedAt: createdAt,
      twofaEnabled: false,
      twofaSecret: null,
      twofaBackupCodes: null,
      lastLoginAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }
  const users = await bulkInsertBatched(db.User, rows, { batchSize: 3000, label: 'users' });
  return {
    admins: users.filter((u) => u.role === 'admin'),
    students: users.filter((u) => u.role === 'student'),
  };
}

// ---------------------------------------------------------------------------
// Questions + options — same generation technique as
// server/src/db/seeders/20260101010003-seed-04-questions.cjs, scaled up 50x
// and vectorized (uses the ids `bulkCreate` hands back directly, rather than
// that seeder's own follow-up `SELECT ... ORDER BY id DESC` round trip, which
// does not scale past a few hundred rows).
// ---------------------------------------------------------------------------
async function seedQuestions(db, subjects, systems, rand) {
  const now = new Date();
  const rows = [];
  for (let i = 0; i < QUESTION_COUNT; i += 1) {
    const category = EXAM_CATEGORIES[i % EXAM_CATEGORIES.length];
    const subject = subjects[i % subjects.length];
    const system = systems[Math.floor(i / subjects.length) % systems.length];
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];
    rows.push({
      examCategory: category,
      subjectId: subject.id,
      systemId: system.id,
      stem: `Synthetic perf-load question stem #${i + 1}. A patient presents with findings relevant to ${subject.name} within the ${system.name} system. Which of the following is most consistent with this presentation?`,
      imageUrl: null,
      explanation: `Synthetic explanation for perf-load question #${i + 1}, covering ${subject.name} as it applies to the ${system.name} system.`,
      referenceText: `${subject.name} — ${system.name} review.`,
      difficulty,
      isActive: true,
      timesAttempted: 0,
      timesCorrect: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  const questions = await bulkInsertBatched(db.Question, rows, { batchSize: 4000, label: 'questions' });

  const optionRows = [];
  for (const q of questions) {
    const correctIdx = Math.floor(rand() * 4);
    for (let idx = 0; idx < 4; idx += 1) {
      optionRows.push({
        questionId: q.id,
        optionText: `Option ${idx + 1} for question ${q.id}`,
        isCorrect: idx === correctIdx,
        sortOrder: idx,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const options = await bulkInsertBatched(db.QuestionOption, optionRows, { batchSize: 5000, label: 'question_options' });

  const optionsByQuestionId = new Map();
  for (const o of options) {
    if (!optionsByQuestionId.has(o.questionId)) optionsByQuestionId.set(o.questionId, []);
    optionsByQuestionId.get(o.questionId).push(o);
  }
  const questionsByCategory = new Map();
  for (const q of questions) {
    if (!questionsByCategory.has(q.examCategory)) questionsByCategory.set(q.examCategory, []);
    questionsByCategory.get(q.examCategory).push(q);
  }

  return { questions, optionsByQuestionId, questionsByCategory };
}

// ---------------------------------------------------------------------------
// Enrollments + orders
// ---------------------------------------------------------------------------
async function seedEnrollmentsAndOrders(db, students, courses, rand) {
  const nowMs = Date.now();
  const enrolledStudents = shuffle(rand, students).slice(0, Math.round(students.length * ENROLLED_STUDENT_FRACTION));

  const drafts = []; // { student, course }
  for (const student of enrolledStudents) {
    const courseCount = randInt(rand, 1, 3);
    const chosenCourses = shuffle(rand, courses).slice(0, courseCount);
    for (const course of chosenCourses) {
      drafts.push({ student, course });
    }
  }

  let invoiceCounter = 1;
  const orderRows = [];
  for (const { student, course } of drafts) {
    const roll = rand();
    const orderCreatedAt = new Date(nowMs - randInt(rand, 0, 364) * 86400000);
    let status;
    let gateway;
    let paidAt = null;
    if (roll < 0.85) {
      status = 'paid';
      gateway = pick(rand, PAID_GATEWAYS);
      paidAt = new Date(orderCreatedAt.getTime() + randInt(rand, 0, 2) * 3600000);
    } else if (roll < 0.95) {
      status = 'awaiting_verification';
      gateway = pick(rand, MANUAL_GATEWAYS);
    } else {
      status = pick(rand, ['pending', 'failed']);
      gateway = pick(rand, [...PAID_GATEWAYS, ...MANUAL_GATEWAYS]);
    }
    orderRows.push({
      invoiceNo: `PERF-${pad(invoiceCounter, 8)}`,
      userId: student.id,
      courseId: course.id,
      amount: course.price,
      discountAmount: 0,
      finalAmount: course.price,
      currency: 'PKR',
      couponId: null,
      gateway,
      gatewayRef: status === 'paid' ? `perfref-${invoiceCounter}` : null,
      status,
      paidAt,
      createdAt: orderCreatedAt,
      updatedAt: paidAt || orderCreatedAt,
    });
    invoiceCounter += 1;
  }

  // A handful of extra never-completed orders (failed/pending/cancelled
  // checkout attempts not tied to any enrollment) — realism for admin
  // dashboard/report aggregates that scan `orders` regardless of outcome.
  const extraOrderCount = Math.round(orderRows.length * 0.05);
  for (let i = 0; i < extraOrderCount; i += 1) {
    const student = pick(rand, students);
    const course = pick(rand, courses);
    const orderCreatedAt = new Date(nowMs - randInt(rand, 0, 364) * 86400000);
    orderRows.push({
      invoiceNo: `PERF-${pad(invoiceCounter, 8)}`,
      userId: student.id,
      courseId: course.id,
      amount: course.price,
      discountAmount: 0,
      finalAmount: course.price,
      currency: 'PKR',
      couponId: null,
      gateway: pick(rand, [...PAID_GATEWAYS, ...MANUAL_GATEWAYS]),
      gatewayRef: null,
      status: pick(rand, ['failed', 'cancelled', 'pending']),
      paidAt: null,
      createdAt: orderCreatedAt,
      updatedAt: orderCreatedAt,
    });
    invoiceCounter += 1;
  }

  const orders = await bulkInsertBatched(db.Order, orderRows, { batchSize: 3000, label: 'orders' });

  // orders[0..drafts.length) line up 1:1, in order, with drafts — the extra
  // never-enrolled orders appended above never generate an enrollment row.
  const enrollmentRows = [];
  for (let i = 0; i < drafts.length; i += 1) {
    const order = orders[i];
    if (order.status !== 'paid') continue; // only a paid order grants an enrollment (mirrors enrollmentService.js's real invariant)
    const { student, course } = drafts[i];
    const startsAt = order.paidAt;
    const expiresAt = new Date(startsAt.getTime() + course.validityDays * 86400000);
    let status = 'active';
    if (rand() < 0.03) status = 'revoked';
    else if (expiresAt.getTime() < nowMs) status = 'expired';
    enrollmentRows.push({
      userId: student.id,
      courseId: course.id,
      orderId: order.id,
      source: 'purchase',
      startsAt,
      expiresAt,
      status,
      createdAt: startsAt,
      updatedAt: startsAt,
    });
  }
  const enrollments = await bulkInsertBatched(db.Enrollment, enrollmentRows, { batchSize: 3000, label: 'enrollments' });

  return { orders, enrollments };
}

// ---------------------------------------------------------------------------
// QBank activity: test_sessions + test_attempt_questions +
// user_question_history + user_daily_stats, for a subset of enrolled
// students — this is what gives the hot-path QBank/reports/dashboard queries
// real volume to chew on (task brief).
// ---------------------------------------------------------------------------
async function seedQbankActivity(db, enrollments, courseById, questionsByCategory, optionsByQuestionId, rand) {
  const nowMs = Date.now();

  const enrollmentsByUser = new Map();
  for (const enr of enrollments) {
    if (!enrollmentsByUser.has(enr.userId)) enrollmentsByUser.set(enr.userId, []);
    enrollmentsByUser.get(enr.userId).push(enr);
  }
  const eligibleUserIds = [...enrollmentsByUser.keys()];
  const qbankUserIds = shuffle(rand, eligibleUserIds).slice(0, Math.min(QBANK_ACTIVE_STUDENT_TARGET, eligibleUserIds.length));

  const sessionDrafts = [];
  for (const userId of qbankUserIds) {
    const userEnrollments = enrollmentsByUser.get(userId);
    const sessionCount = randInt(rand, 3, 12);
    for (let s = 0; s < sessionCount; s += 1) {
      const enr = pick(rand, userEnrollments);
      const course = courseById.get(enr.courseId);
      const pool = questionsByCategory.get(course.examCategory) || [];
      if (pool.length === 0) continue;
      const questionCount = Math.min(randInt(rand, 10, 40), pool.length);
      const mode = pick(rand, ['practice', 'practice', 'exam']);
      const daysAgo = randInt(rand, 0, 89);
      const startedAt = new Date(nowMs - daysAgo * 86400000 - randInt(rand, 0, 86400000));
      const statusRoll = rand();
      const status = statusRoll < 0.85 ? 'completed' : statusRoll < 0.95 ? 'abandoned' : 'in_progress';
      const chosenQuestions = shuffle(rand, pool).slice(0, questionCount);
      sessionDrafts.push({ userId, examCategory: course.examCategory, mode, questionCount, startedAt, status, chosenQuestions });
    }
  }

  // Resolve per-question outcomes BEFORE inserting test_sessions, so the
  // session row's own correct/incorrect/skipped/score columns are already
  // consistent with the attempt rows we'll insert right after.
  const built = sessionDrafts.map((d) => {
    let correctCount = 0;
    let incorrectCount = 0;
    let skippedCount = 0;
    const perQuestion = d.chosenQuestions.map((q, idx) => {
      if (d.status === 'in_progress' && idx >= Math.round(d.questionCount * 0.6)) {
        skippedCount += 1;
        return { question: q, selectedOptionId: null, isCorrect: null, answeredAt: null };
      }
      const roll = rand();
      const options = optionsByQuestionId.get(q.id) || [];
      const correctOpt = options.find((o) => o.isCorrect);
      const wrongOpts = options.filter((o) => !o.isCorrect);
      const answeredAt = new Date(d.startedAt.getTime() + (idx + 1) * 45000);
      if (roll < 0.7 && correctOpt) {
        correctCount += 1;
        return { question: q, selectedOptionId: correctOpt.id, isCorrect: true, answeredAt };
      }
      if (roll < 0.92 && wrongOpts.length > 0) {
        incorrectCount += 1;
        return { question: q, selectedOptionId: pick(rand, wrongOpts).id, isCorrect: false, answeredAt };
      }
      skippedCount += 1;
      return { question: q, selectedOptionId: null, isCorrect: null, answeredAt: null };
    });

    const completedAt = d.status === 'in_progress' ? null : new Date(d.startedAt.getTime() + d.questionCount * 45000);
    const scorePercent = d.status === 'in_progress' || d.questionCount === 0 ? null : Math.round((correctCount / d.questionCount) * 10000) / 100;

    return {
      perQuestion,
      row: {
        userId: d.userId,
        mode: d.mode,
        mockExamId: null,
        examCategory: d.examCategory,
        filters: JSON.stringify({ subjectIds: [], systemIds: [], pool: 'all' }),
        questionCount: d.questionCount,
        timeLimitSeconds: null,
        status: d.status,
        startedAt: d.startedAt,
        completedAt,
        correctCount,
        incorrectCount,
        skippedCount,
        scorePercent,
        passed: null,
        createdAt: d.startedAt,
        updatedAt: completedAt || d.startedAt,
      },
    };
  });

  const insertedSessions = await bulkInsertBatched(db.TestSession, built.map((b) => b.row), { batchSize: 3000, label: 'test_sessions' });

  const attemptRows = [];
  const historyAgg = new Map(); // `${userId}:${questionId}` -> row
  const dailyMap = new Map(); // `${userId}:${dateKey}` -> row

  built.forEach((b, i) => {
    const sessionId = insertedSessions[i].id;
    const userId = b.row.userId;
    let sessionTimeSpent = 0;

    b.perQuestion.forEach((pq, idx) => {
      const timeSpentSeconds = pq.answeredAt ? randInt(rand, 15, 90) : 0;
      sessionTimeSpent += timeSpentSeconds;
      attemptRows.push({
        testSessionId: sessionId,
        questionId: pq.question.id,
        sortOrder: idx + 1,
        selectedOptionId: pq.selectedOptionId,
        isCorrect: pq.isCorrect,
        isFlagged: rand() < 0.08,
        timeSpentSeconds,
        answeredAt: pq.answeredAt,
      });

      if (pq.answeredAt) {
        const key = `${userId}:${pq.question.id}`;
        const prev = historyAgg.get(key) || { userId, questionId: pq.question.id, timesSeen: 0, timesCorrect: 0, lastResult: null, lastSeenAt: null };
        prev.timesSeen += 1;
        if (pq.isCorrect) prev.timesCorrect += 1;
        prev.lastResult = pq.isCorrect === true ? 'correct' : pq.isCorrect === false ? 'incorrect' : 'skipped';
        if (!prev.lastSeenAt || pq.answeredAt > prev.lastSeenAt) prev.lastSeenAt = pq.answeredAt;
        historyAgg.set(key, prev);
      }
    });

    const dateKey = toDateOnly(b.row.startedAt);
    const dailyKey = `${userId}:${dateKey}`;
    const prevDaily = dailyMap.get(dailyKey) || {
      userId,
      statDate: dateKey,
      questionsAttempted: 0,
      questionsCorrect: 0,
      qbankSeconds: 0,
      videoSeconds: 0,
    };
    prevDaily.questionsAttempted += b.row.correctCount + b.row.incorrectCount;
    prevDaily.questionsCorrect += b.row.correctCount;
    prevDaily.qbankSeconds += sessionTimeSpent;
    prevDaily.videoSeconds += randInt(rand, 0, 600); // synthetic filler — no per-lecture derivation needed for perf-timing purposes
    dailyMap.set(dailyKey, prevDaily);
  });

  await bulkInsertBatched(db.TestAttemptQuestion, attemptRows, { batchSize: 5000, label: 'test_attempt_questions' });
  const historyRows = [...historyAgg.values()];
  await bulkInsertBatched(db.UserQuestionHistory, historyRows, { batchSize: 5000, label: 'user_question_history' });
  const dailyRows = [...dailyMap.values()];
  await bulkInsertBatched(db.UserDailyStat, dailyRows, { batchSize: 5000, label: 'user_daily_stats' });

  return {
    qbankUserIds,
    sessionsCount: insertedSessions.length,
    attemptsCount: attemptRows.length,
    historyCount: historyRows.length,
    dailyStatCount: dailyRows.length,
  };
}

// ---------------------------------------------------------------------------
// Lecture progress — feeds the student-dashboard continue-watching query.
// ---------------------------------------------------------------------------
async function seedLectureProgress(db, enrollments, lecturesByCourseId, rand) {
  const now = Date.now();
  const rows = [];
  for (const enr of enrollments) {
    const lectures = lecturesByCourseId.get(enr.courseId) || [];
    if (lectures.length === 0) continue;
    const touchedCount = Math.max(1, Math.round(lectures.length * (0.4 + rand() * 0.5)));
    const touched = shuffle(rand, lectures).slice(0, touchedCount);
    touched.forEach((lecture, idx) => {
      const isLast = idx === touched.length - 1;
      const isCompleted = !isLast || rand() < 0.5; // deliberately leave a "most recent" incomplete row sometimes -> feeds continue-watching
      const watchedSeconds = isCompleted ? lecture.durationSeconds : randInt(rand, 10, Math.max(10, lecture.durationSeconds - 10));
      const updatedAt = new Date(now - randInt(rand, 0, 30) * 86400000 - randInt(rand, 0, 86400000));
      rows.push({
        userId: enr.userId,
        lectureId: lecture.id,
        watchedSeconds,
        lastPositionSeconds: isCompleted ? lecture.durationSeconds : watchedSeconds,
        isCompleted,
        completedAt: isCompleted ? updatedAt : null,
        createdAt: updatedAt,
        updatedAt,
      });
    });
  }
  return bulkInsertBatched(db.LectureProgress, rows, { batchSize: 4000, label: 'lecture_progress' });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[perf] target database: ${PERF_DB_NAME}`);
  assertPerfDbIsolated();
  await ensureDatabaseExists();

  if (KEEP_SCHEMA) {
    console.log('[perf] --keep-schema passed: skipping db:migrate:undo:all + db:migrate reset (schema left as-is).');
  } else {
    console.log('[perf] resetting perf DB schema (db:migrate:undo:all + db:migrate --env perf) ...');
    resetPerfSchema();
  }

  const sequelize = buildPerfSequelize();
  const db = await loadPerfModels(sequelize);
  const rand = mulberry32(20260805);
  const startedAt = Date.now();

  try {
    console.log('[perf] seeding taxonomy ...');
    const { subjects, systems } = await seedTaxonomy(db);

    console.log('[perf] seeding courses/sections/lectures ...');
    const { courses, courseById, lecturesByCourseId } = await seedCourses(db);

    console.log('[perf] seeding users ...');
    const { admins, students } = await seedUsers(db, rand);

    console.log('[perf] seeding questions/options ...');
    const { questions, optionsByQuestionId, questionsByCategory } = await seedQuestions(db, subjects, systems, rand);

    console.log('[perf] seeding enrollments/orders ...');
    const { orders, enrollments } = await seedEnrollmentsAndOrders(db, students, courses, rand);

    console.log('[perf] seeding lecture progress ...');
    const lectureProgress = await seedLectureProgress(db, enrollments, lecturesByCourseId, rand);

    console.log('[perf] seeding QBank activity (test sessions/attempts/history/daily stats) ...');
    const qbank = await seedQbankActivity(db, enrollments, courseById, questionsByCategory, optionsByQuestionId, rand);

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    const summary = {
      subjects: subjects.length,
      body_systems: systems.length,
      courses: courses.length,
      users_total: admins.length + students.length,
      users_admins: admins.length,
      users_students: students.length,
      questions: questions.length,
      question_options: questions.length * 4,
      orders: orders.length,
      enrollments: enrollments.length,
      lecture_progress: lectureProgress.length,
      qbank_active_students: qbank.qbankUserIds.length,
      test_sessions: qbank.sessionsCount,
      test_attempt_questions: qbank.attemptsCount,
      user_question_history: qbank.historyCount,
      user_daily_stats: qbank.dailyStatCount,
    };

    console.log('\n[perf] === Synthetic load seeding complete ===');
    console.log(`[perf] database: ${PERF_DB_NAME}`);
    console.log(`[perf] elapsed: ${elapsedSec}s`);
    console.table(summary);
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error('[perf] seedSyntheticLoad.js FAILED:', err);
  process.exitCode = 1;
});
