// server/tests/integration/demoDataMigration.test.js
import db from '../../src/models/index.js';

const { Course, CourseSection, Lecture, Question, QuestionOption, MockExam, User, Enrollment, Faculty, Coupon, Faq, Announcement, TestSession, sequelize } = db;

describe('1-Time Demo Data Migration Integration', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('has populated abundant courses with sections and lectures', async () => {
    const courses = await Course.findAll({
      include: [{ model: CourseSection, as: 'courseSections', include: [{ model: Lecture, as: 'lectures' }] }],
    });
    expect(courses.length).toBeGreaterThanOrEqual(4);

    for (const course of courses) {
      expect(course.courseSections.length).toBeGreaterThan(0);
      for (const section of course.courseSections) {
        expect(section.lectures.length).toBeGreaterThan(0);
      }
    }
  });

  it('has populated at least 500 questions with 4 options and 1 correct answer each', async () => {
    const questionCount = await Question.count();
    expect(questionCount).toBeGreaterThanOrEqual(500);

    const sampleQuestions = await Question.findAll({
      limit: 20,
      include: [{ model: QuestionOption, as: 'questionOptions' }],
    });

    for (const q of sampleQuestions) {
      expect(q.questionOptions.length).toBe(4);
      const correctOpts = q.questionOptions.filter((o) => o.isCorrect);
      expect(correctOpts.length).toBe(1);
    }
  });

  it('has populated at least 5 mock exams with mapped questions', async () => {
    const mockExams = await MockExam.findAll();
    expect(mockExams.length).toBeGreaterThanOrEqual(5);
  });

  it('has populated demo students, active enrollments, and test sessions', async () => {
    const demoStudent = await User.findOne({ where: { email: 'student@samsacademy.com' } });
    expect(demoStudent).not.toBeNull();

    const enrollments = await Enrollment.findAll({ where: { userId: demoStudent.id } });
    expect(enrollments.length).toBeGreaterThan(0);

    const testSessions = await TestSession.findAll({ where: { userId: demoStudent.id } });
    expect(testSessions.length).toBeGreaterThan(0);
  });

  it('has populated faculty, coupons, FAQs, and announcements', async () => {
    const facultyCount = await Faculty.count();
    expect(facultyCount).toBeGreaterThanOrEqual(6);

    const couponCount = await Coupon.count();
    expect(couponCount).toBeGreaterThanOrEqual(6);

    const faqCount = await Faq.count();
    expect(faqCount).toBeGreaterThanOrEqual(15);

    const announcementCount = await Announcement.count();
    expect(announcementCount).toBeGreaterThanOrEqual(3);
  });
});
