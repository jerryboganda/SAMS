'use strict';

// server/src/db/migrations/20260101000037-seed-abundance-demo-data.cjs
// 1-Time production-ready demo data population in abundance.
// Executes ONCE during `npm run migrate` on production and recorded in SequelizeMeta,
// ensuring zero re-generation on application builds, restarts, or deploys.

const bcrypt = require('bcrypt');
const coursesData = require('../demoData/coursesData.cjs');
const { generateQuestions } = require('../demoData/questionsData.cjs');
const mockExamsData = require('../demoData/mockExamsData.cjs');
const siteContentData = require('../demoData/siteContentData.cjs');
const { BCRYPT_ROUNDS, DEMO_STUDENTS, generateStudentActivity } = require('../demoData/studentActivityData.cjs');

const BASE_SUBJECTS = [
  'Anatomy',
  'Physiology',
  'Biochemistry',
  'Pathology',
  'Pharmacology',
  'Microbiology',
  'Immunology',
  'Behavioral Science',
  'Biostatistics',
];

const BASE_SYSTEMS = [
  'Cardiovascular',
  'Respiratory',
  'GIT',
  'Renal',
  'Endocrine',
  'Reproductive',
  'MSK',
  'Neuro',
  'Heme/Onc',
  'General Principles',
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // 1. Ensure Subjects & Systems taxonomy exists
    const [existingSubjects] = await queryInterface.sequelize.query('SELECT id, name FROM subjects');
    const existingSubjectNames = new Set(existingSubjects.map((s) => s.name));
    const missingSubjects = BASE_SUBJECTS.filter((name) => !existingSubjectNames.has(name)).map((name) => ({
      name,
      sort_order: BASE_SUBJECTS.indexOf(name),
      created_at: now,
      updated_at: now,
    }));
    if (missingSubjects.length > 0) {
      await queryInterface.bulkInsert('subjects', missingSubjects);
    }
    const [allSubjects] = await queryInterface.sequelize.query('SELECT id, name FROM subjects ORDER BY sort_order ASC');

    const [existingSystems] = await queryInterface.sequelize.query('SELECT id, name FROM body_systems');
    const existingSystemNames = new Set(existingSystems.map((s) => s.name));
    const missingSystems = BASE_SYSTEMS.filter((name) => !existingSystemNames.has(name)).map((name) => ({
      name,
      sort_order: BASE_SYSTEMS.indexOf(name),
      created_at: now,
      updated_at: now,
    }));
    if (missingSystems.length > 0) {
      await queryInterface.bulkInsert('body_systems', missingSystems);
    }
    const [allSystems] = await queryInterface.sequelize.query('SELECT id, name FROM body_systems ORDER BY sort_order ASC');

    // 2. Insert Demo Students
    const studentEmails = DEMO_STUDENTS.map((s) => s.email);
    const [existingStudents] = await queryInterface.sequelize.query(
      'SELECT id, email FROM users WHERE email IN (:emails)',
      { replacements: { emails: studentEmails } }
    );
    const existingStudentEmails = new Set(existingStudents.map((u) => u.email));

    const studentsToInsert = DEMO_STUDENTS.filter((s) => !existingStudentEmails.has(s.email)).map((s) => ({
      name: s.name,
      email: s.email,
      phone: null,
      password_hash: bcrypt.hashSync(s.password, BCRYPT_ROUNDS),
      role: 'student',
      status: 'active',
      email_verified_at: now,
      twofa_enabled: false,
      twofa_secret: null,
      twofa_backup_codes: null,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    }));
    if (studentsToInsert.length > 0) {
      await queryInterface.bulkInsert('users', studentsToInsert);
    }

    const [dbStudents] = await queryInterface.sequelize.query(
      'SELECT id, email FROM users WHERE email IN (:emails) ORDER BY id ASC',
      { replacements: { emails: studentEmails } }
    );
    const studentIds = dbStudents.map((s) => s.id);

    // 3. Insert Courses, Sections, and Lectures
    const courseSlugs = coursesData.map((c) => c.slug);
    const [existingCourses] = await queryInterface.sequelize.query(
      'SELECT id, slug FROM courses WHERE slug IN (:slugs)',
      { replacements: { slugs: courseSlugs } }
    );
    const existingCourseSlugs = new Set(existingCourses.map((c) => c.slug));

    for (let cIdx = 0; cIdx < coursesData.length; cIdx += 1) {
      const courseDef = coursesData[cIdx];
      if (existingCourseSlugs.has(courseDef.slug)) continue;

      await queryInterface.bulkInsert('courses', [
        {
          title: courseDef.title,
          slug: courseDef.slug,
          exam_category: courseDef.exam_category,
          short_description: courseDef.short_description,
          description: courseDef.description,
          thumbnail_url: courseDef.thumbnail_url,
          price: courseDef.price,
          currency: courseDef.currency,
          validity_days: courseDef.validity_days,
          includes_qbank: courseDef.includes_qbank,
          is_published: courseDef.is_published,
          sort_order: courseDef.sort_order ?? cIdx,
          created_at: now,
          updated_at: now,
        },
      ]);

      const [[courseRow]] = await queryInterface.sequelize.query(
        'SELECT id FROM courses WHERE slug = :slug',
        { replacements: { slug: courseDef.slug } }
      );
      const courseId = courseRow.id;

      for (let sIdx = 0; sIdx < courseDef.sections.length; sIdx += 1) {
        const sectionDef = courseDef.sections[sIdx];
        await queryInterface.bulkInsert('course_sections', [
          {
            course_id: courseId,
            title: sectionDef.title,
            sort_order: sIdx,
            created_at: now,
            updated_at: now,
          },
        ]);

        const [[sectionRow]] = await queryInterface.sequelize.query(
          'SELECT id FROM course_sections WHERE course_id = :courseId AND title = :title',
          { replacements: { courseId, title: sectionDef.title } }
        );
        const sectionId = sectionRow.id;

        const lectureRows = sectionDef.lectures.map((lec, lIdx) => ({
          course_id: courseId,
          section_id: sectionId,
          title: lec.title,
          description: `${lec.title} — essential clinical and basic science lecture for ${courseDef.title}.`,
          video_provider: 'mock',
          video_ref: `mock-${courseDef.slug}-s${sIdx + 1}-l${lIdx + 1}`,
          duration_seconds: lec.duration_seconds || (lec.minutes || 20) * 60,
          is_free_preview: Boolean(lec.is_free_preview),
          is_published: true,
          sort_order: lIdx,
          created_at: now,
          updated_at: now,
        }));
        await queryInterface.bulkInsert('lectures', lectureRows);
      }
    }

    const [allCourses] = await queryInterface.sequelize.query('SELECT id, slug FROM courses ORDER BY id ASC');
    const courseIds = allCourses.map((c) => c.id);

    // 4. Bulk Insert 500+ Questions and Options
    const [[{ questionCount }]] = await queryInterface.sequelize.query('SELECT COUNT(*) AS questionCount FROM questions');
    if (Number(questionCount) < 500) {
      const neededCount = 500 - Number(questionCount);
      const { questions, options } = generateQuestions(allSubjects, allSystems, neededCount);

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
    }

    // 5. Insert Mock Exams and Map Questions
    for (const examDef of mockExamsData) {
      const [existingExam] = await queryInterface.sequelize.query(
        'SELECT id FROM mock_exams WHERE title = :title',
        { replacements: { title: examDef.title } }
      );
      if (existingExam.length > 0) continue;

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
    }

    // 6. Insert Faculty Profiles
    for (const f of siteContentData.faculty) {
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM faculty WHERE name = :name', {
        replacements: { name: f.name },
      });
      if (existing.length === 0) {
        await queryInterface.bulkInsert('faculty', [
          {
            name: f.name,
            title: f.title,
            bio: f.bio,
            photo_url: f.photo_url,
            sort_order: f.sort_order,
            is_active: f.is_active,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }

    // 7. Insert Coupons
    for (const c of siteContentData.coupons) {
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM coupons WHERE code = :code', {
        replacements: { code: c.code },
      });
      if (existing.length === 0) {
        await queryInterface.bulkInsert('coupons', [
          {
            code: c.code,
            type: c.type,
            value: c.value,
            course_id: c.course_id,
            max_uses: c.max_uses,
            used_count: c.used_count || 0,
            valid_from: null,
            valid_until: null,
            is_active: c.is_active,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }

    // 8. Insert FAQs
    for (const faq of siteContentData.faqs) {
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM faqs WHERE question = :q', {
        replacements: { q: faq.question },
      });
      if (existing.length === 0) {
        await queryInterface.bulkInsert('faqs', [
          {
            question: faq.question,
            answer: faq.answer,
            sort_order: faq.sort_order,
            is_active: faq.is_active,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }

    // 9. Insert Announcements
    for (const a of siteContentData.announcements) {
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM announcements WHERE title = :title', {
        replacements: { title: a.title },
      });
      if (existing.length === 0) {
        await queryInterface.bulkInsert('announcements', [
          {
            title: a.title,
            body: a.body,
            audience: a.audience,
            course_id: null,
            send_email: false,
            created_by: null,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }

    // 10. Insert Demo Student Activity & Analytics
    if (studentIds.length > 0 && courseIds.length > 0) {
      const [allQuestions] = await queryInterface.sequelize.query('SELECT id, exam_category FROM questions ORDER BY id ASC LIMIT 200');
      const [allOptions] = await queryInterface.sequelize.query('SELECT id, question_id, is_correct FROM question_options');

      const activity = generateStudentActivity({
        userIds: studentIds,
        courseIds,
        questions: allQuestions,
        options: allOptions,
      });

      // Insert Enrollments
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

      // Insert Test Sessions & Attempts for primary demo student
      const primaryStudentId = studentIds[0];
      const [[{ sessionCount }]] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS sessionCount FROM test_sessions WHERE user_id = :uid',
        { replacements: { uid: primaryStudentId } }
      );

      if (Number(sessionCount) === 0) {
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
    }
  },

  async down(queryInterface) {
    const studentEmails = DEMO_STUDENTS.map((s) => s.email);
    const courseSlugs = coursesData.map((c) => c.slug);
    const couponCodes = siteContentData.coupons.map((c) => c.code);
    const facultyNames = siteContentData.faculty.map((f) => f.name);
    const faqQuestions = siteContentData.faqs.map((f) => f.question);
    const examTitles = mockExamsData.map((m) => m.title);

    await queryInterface.bulkDelete('mock_exams', { title: examTitles });
    await queryInterface.bulkDelete('courses', { slug: courseSlugs });
    await queryInterface.bulkDelete('faculty', { name: facultyNames });
    await queryInterface.bulkDelete('coupons', { code: couponCodes });
    await queryInterface.bulkDelete('faqs', { question: faqQuestions });
    await queryInterface.bulkDelete('users', { email: studentEmails });
  },
};
