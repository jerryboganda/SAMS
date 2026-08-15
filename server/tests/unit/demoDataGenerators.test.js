// server/tests/unit/demoDataGenerators.test.js
import coursesData from '../../src/db/demoData/coursesData.cjs';
import { generateQuestions } from '../../src/db/demoData/questionsData.cjs';
import mockExamsData from '../../src/db/demoData/mockExamsData.cjs';
import siteContentData from '../../src/db/demoData/siteContentData.cjs';
import { DEMO_STUDENTS, generateStudentActivity } from '../../src/db/demoData/studentActivityData.cjs';

describe('Demo Data Generators', () => {
  describe('coursesData', () => {
    it('defines at least 4 courses covering NRE1, NRE2, FCPS1, FCPS2', () => {
      expect(Array.isArray(coursesData)).toBe(true);
      expect(coursesData.length).toBeGreaterThanOrEqual(4);

      const categories = new Set(coursesData.map((c) => c.exam_category));
      expect(categories.has('NRE1')).toBe(true);
      expect(categories.has('NRE2')).toBe(true);
      expect(categories.has('FCPS1')).toBe(true);
      expect(categories.has('FCPS2')).toBe(true);

      for (const course of coursesData) {
        expect(course.title).toBeTruthy();
        expect(course.slug).toMatch(/^[a-z0-9-]+$/);
        expect(course.price).toBeGreaterThan(0);
        expect(course.validity_days).toBeGreaterThan(0);
        expect(Array.isArray(course.sections)).toBe(true);
        expect(course.sections.length).toBeGreaterThan(0);

        for (const section of course.sections) {
          expect(section.title).toBeTruthy();
          expect(Array.isArray(section.lectures)).toBe(true);
          expect(section.lectures.length).toBeGreaterThan(0);

          for (const lecture of section.lectures) {
            expect(lecture.title).toBeTruthy();
            expect(lecture.duration_seconds).toBeGreaterThan(0);
            expect(typeof lecture.is_free_preview).toBe('boolean');
          }
        }
      }
    });
  });

  describe('questionsData', () => {
    const mockSubjects = [
      { id: 1, name: 'Anatomy' },
      { id: 2, name: 'Physiology' },
      { id: 3, name: 'Biochemistry' },
      { id: 4, name: 'Pathology' },
      { id: 5, name: 'Pharmacology' },
      { id: 6, name: 'Microbiology' },
      { id: 7, name: 'Immunology' },
      { id: 8, name: 'Behavioral Science' },
      { id: 9, name: 'Biostatistics' },
    ];
    const mockSystems = [
      { id: 1, name: 'Cardiovascular' },
      { id: 2, name: 'Respiratory' },
      { id: 3, name: 'GIT' },
      { id: 4, name: 'Renal' },
      { id: 5, name: 'Endocrine' },
      { id: 6, name: 'Reproductive' },
      { id: 7, name: 'MSK' },
      { id: 8, name: 'Neuro' },
      { id: 9, name: 'Heme/Onc' },
      { id: 10, name: 'General Principles' },
    ];

    it('generates at least 500 questions across all categories and systems with 4 options each', () => {
      const { questions, options } = generateQuestions(mockSubjects, mockSystems, 500);
      expect(questions.length).toBeGreaterThanOrEqual(500);

      const categoryCounts = { NRE1: 0, NRE2: 0, FCPS1: 0, FCPS2: 0 };
      for (const q of questions) {
        expect(q.stem).toBeTruthy();
        expect(q.explanation).toBeTruthy();
        expect(['easy', 'medium', 'hard']).toContain(q.difficulty);
        expect(q.is_active).toBe(true);
        expect(categoryCounts[q.exam_category]).toBeDefined();
        categoryCounts[q.exam_category] += 1;
      }

      // Assert all 4 categories have questions
      expect(categoryCounts.NRE1).toBeGreaterThanOrEqual(100);
      expect(categoryCounts.NRE2).toBeGreaterThanOrEqual(50);
      expect(categoryCounts.FCPS1).toBeGreaterThanOrEqual(50);
      expect(categoryCounts.FCPS2).toBeGreaterThanOrEqual(50);

      // Options verification
      expect(options.length).toBe(questions.length * 4);
      const optionsByQuestion = new Map();
      for (const opt of options) {
        if (!optionsByQuestion.has(opt.question_index)) {
          optionsByQuestion.set(opt.question_index, []);
        }
        optionsByQuestion.get(opt.question_index).push(opt);
      }

      for (let i = 0; i < questions.length; i += 1) {
        const opts = optionsByQuestion.get(i);
        expect(opts).toBeDefined();
        expect(opts.length).toBe(4);
        const correctCount = opts.filter((o) => o.is_correct).length;
        expect(correctCount).toBe(1);
      }
    });
  });

  describe('mockExamsData', () => {
    it('defines 5 mock exams with correct categories and passing percentages', () => {
      expect(Array.isArray(mockExamsData)).toBe(true);
      expect(mockExamsData.length).toBeGreaterThanOrEqual(5);

      for (const exam of mockExamsData) {
        expect(exam.title).toBeTruthy();
        expect(['NRE1', 'NRE2', 'FCPS1', 'FCPS2']).toContain(exam.exam_category);
        expect(exam.duration_minutes).toBeGreaterThan(0);
        expect(exam.pass_percent).toBeGreaterThanOrEqual(50);
        expect(exam.question_count).toBeGreaterThanOrEqual(50);
        expect(exam.is_published).toBe(true);
      }
    });
  });

  describe('siteContentData', () => {
    it('contains faculty, coupons, FAQs, and announcements', () => {
      expect(siteContentData.faculty.length).toBeGreaterThanOrEqual(6);
      for (const f of siteContentData.faculty) {
        expect(f.name).toBeTruthy();
        expect(f.title).toBeTruthy();
        expect(f.bio).toBeTruthy();
        expect(f.is_active).toBe(true);
      }

      expect(siteContentData.coupons.length).toBeGreaterThanOrEqual(6);
      for (const c of siteContentData.coupons) {
        expect(c.code).toMatch(/^[A-Z0-9]+$/);
        expect(['percent', 'fixed']).toContain(c.type);
        expect(c.value).toBeGreaterThan(0);
        expect(c.is_active).toBe(true);
      }

      expect(siteContentData.faqs.length).toBeGreaterThanOrEqual(15);
      for (const faq of siteContentData.faqs) {
        expect(faq.question).toBeTruthy();
        expect(faq.answer).toBeTruthy();
        expect(faq.is_active).toBe(true);
      }

      expect(siteContentData.announcements.length).toBeGreaterThanOrEqual(3);
      for (const a of siteContentData.announcements) {
        expect(a.title).toBeTruthy();
        expect(a.body).toBeTruthy();
        expect(a.audience).toBe('all');
      }
    });
  });

  describe('studentActivityData', () => {
    it('defines demo students and generates test sessions and telemetry', () => {
      expect(DEMO_STUDENTS.length).toBeGreaterThanOrEqual(4);
      expect(DEMO_STUDENTS[0].email).toBe('student@samsacademy.com');

      const mockUserIds = [10, 11, 12, 13];
      const mockCourseIds = [1, 2, 3, 4];
      const mockQuestions = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, exam_category: 'NRE1' }));
      const mockOptions = mockQuestions.flatMap((q) => [
        { id: q.id * 10 + 1, question_id: q.id, is_correct: true },
        { id: q.id * 10 + 2, question_id: q.id, is_correct: false },
        { id: q.id * 10 + 3, question_id: q.id, is_correct: false },
        { id: q.id * 10 + 4, question_id: q.id, is_correct: false },
      ]);

      const activity = generateStudentActivity({
        userIds: mockUserIds,
        courseIds: mockCourseIds,
        questions: mockQuestions,
        options: mockOptions,
      });

      expect(activity.enrollments.length).toBeGreaterThan(0);
      expect(activity.testSessions.length).toBeGreaterThan(0);
      expect(activity.attemptQuestions.length).toBeGreaterThan(0);
      expect(activity.historyRows.length).toBeGreaterThan(0);
      expect(activity.dailyStatsRows.length).toBeGreaterThan(0);
    });
  });
});
