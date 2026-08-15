'use strict';

// server/src/db/seeders/20260101010009-seed-10-demo-activity.cjs
// Synchronized demo student activity & analytics seeder.

const coursesData = require('../demoData/coursesData.cjs');
const { DEMO_STUDENTS, generateStudentActivity } = require('../demoData/studentActivityData.cjs');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const studentEmails = DEMO_STUDENTS.map((s) => s.email);
    const courseSlugs = coursesData.map((c) => c.slug);

    const [dbStudents] = await queryInterface.sequelize.query(
      'SELECT id, email FROM users WHERE email IN (:emails) ORDER BY id ASC',
      { replacements: { emails: studentEmails } }
    );
    const [dbCourses] = await queryInterface.sequelize.query(
      'SELECT id, slug FROM courses WHERE slug IN (:slugs) ORDER BY id ASC',
      { replacements: { slugs: courseSlugs } }
    );

    if (dbStudents.length === 0 || dbCourses.length === 0) {
      console.log('[seed:demo-activity] demo students or courses not found, skipping activity.');
      return;
    }

    const studentIds = dbStudents.map((s) => s.id);
    const courseIds = dbCourses.map((c) => c.id);

    const [allQuestions] = await queryInterface.sequelize.query(
      'SELECT id, exam_category FROM questions ORDER BY id ASC LIMIT 200'
    );
    const [allOptions] = await queryInterface.sequelize.query(
      'SELECT id, question_id, is_correct FROM question_options'
    );

    const activity = generateStudentActivity({
      userIds: studentIds,
      courseIds,
      questions: allQuestions,
      options: allOptions,
    });

    // Enrollments
    for (const enr of activity.enrollments) {
      const [existingEnr] = await queryInterface.sequelize.query(
        "SELECT id FROM enrollments WHERE user_id = :uid AND course_id = :cid AND status = 'active'",
        { replacements: { uid: enr.user_id, cid: enr.course_id } }
      );
      if (existingEnr.length === 0) {
        await queryInterface.bulkInsert('enrollments', [
          {
            user_id: enr.user_id,
            course_id: enr.course_id,
            order_id: null,
            source: enr.source,
            starts_at: enr.starts_at,
            expires_at: enr.expires_at,
            status: enr.status,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }

    // Sessions
    const primaryStudentId = studentIds[0];
    const [[{ sessionCount }]] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS sessionCount FROM test_sessions WHERE user_id = :uid',
      { replacements: { uid: primaryStudentId } }
    );

    if (Number(sessionCount) === 0 && activity.testSessions.length > 0) {
      for (const session of activity.testSessions) {
        await queryInterface.bulkInsert('test_sessions', [
          {
            user_id: session.user_id,
            mode: session.mode,
            mock_exam_id: session.mock_exam_id,
            exam_category: session.exam_category,
            filters: session.filters,
            question_count: session.question_count,
            time_limit_seconds: session.time_limit_seconds,
            status: session.status,
            started_at: session.started_at,
            completed_at: session.completed_at,
            correct_count: session.correct_count,
            incorrect_count: session.incorrect_count,
            skipped_count: session.skipped_count,
            score_percent: session.score_percent,
            passed: session.passed,
            created_at: session.started_at,
            updated_at: session.completed_at,
          },
        ]);

        const [[sessionRow]] = await queryInterface.sequelize.query(
          'SELECT id FROM test_sessions WHERE user_id = :uid ORDER BY id DESC LIMIT 1',
          { replacements: { uid: session.user_id } }
        );
        const sessionId = sessionRow.id;

        const sessionAttempts = activity.attemptQuestions
          .filter((a) => a.session_index === session.session_index)
          .map((a) => ({
            test_session_id: sessionId,
            question_id: a.question_id,
            sort_order: a.sort_order,
            selected_option_id: a.selected_option_id,
            is_correct: a.is_correct,
            is_flagged: a.is_flagged,
            time_spent_seconds: a.time_spent_seconds,
            answered_at: a.answered_at,
          }));

        if (sessionAttempts.length > 0) {
          await queryInterface.bulkInsert('test_attempt_questions', sessionAttempts);
        }
      }

      if (activity.historyRows.length > 0) {
        await queryInterface.bulkInsert('user_question_history', activity.historyRows);
      }

      if (activity.dailyStatsRows.length > 0) {
        await queryInterface.bulkInsert('user_daily_stats', activity.dailyStatsRows);
      }
    }

    console.log('[seed:demo-activity] synchronized demo student activity.');
  },

  async down(queryInterface) {
    const studentEmails = DEMO_STUDENTS.map((s) => s.email);
    const [dbStudents] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email IN (:emails)',
      { replacements: { emails: studentEmails } }
    );
    const studentIds = dbStudents.map((s) => s.id);
    if (studentIds.length === 0) return;

    await queryInterface.bulkDelete('test_sessions', { user_id: studentIds });
    await queryInterface.bulkDelete('user_question_history', { user_id: studentIds });
    await queryInterface.bulkDelete('user_daily_stats', { user_id: studentIds });
    await queryInterface.bulkDelete('enrollments', { user_id: studentIds });
  },
};
