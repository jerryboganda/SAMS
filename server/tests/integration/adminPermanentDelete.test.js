// server/tests/integration/adminPermanentDelete.test.js
import db from '../../src/models/index.js';
import { deleteQuestionAdmin } from '../../src/services/adminQuestionService.js';
import { deleteCourse } from '../../src/services/adminCourseService.js';
import { deleteMockExam } from '../../src/services/adminMockExamService.js';
import { deleteCouponAdmin } from '../../src/services/couponService.js';
import { deleteFaculty, deleteFaq } from '../../src/services/adminContentService.js';
import { deleteAnnouncementAdmin } from '../../src/services/announcementService.js';

const { Course, CourseSection, Lecture, Question, QuestionOption, MockExam, MockExamQuestion, TestAttemptQuestion, Faculty, Coupon, Faq, Announcement, sequelize } = db;

describe('Admin Permanent Deletion & 1-Time Permanence', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  describe('Questions permanent deletion', () => {
    it('permanently hard deletes a question with 0 attempts and cascades its options', async () => {
      // Find a question with 0 recorded test attempts
      const allQuestions = await Question.findAll({
        limit: 100,
        offset: 200,
        include: [{ model: QuestionOption, as: 'questionOptions' }],
      });

      let unattemptedQuestion = null;
      for (const q of allQuestions) {
        const attemptCount = await TestAttemptQuestion.count({ where: { questionId: q.id } });
        if (attemptCount === 0) {
          unattemptedQuestion = q;
          break;
        }
      }

      expect(unattemptedQuestion).not.toBeNull();
      const questionId = unattemptedQuestion.id;
      const optionIds = unattemptedQuestion.questionOptions.map((o) => o.id);
      expect(optionIds.length).toBe(4);

      const result = await deleteQuestionAdmin(questionId);
      expect(result.success).toBe(true);
      expect(result.softDeleted).toBe(false);

      // Verify question and options no longer exist in DB
      const foundQ = await Question.findByPk(questionId);
      expect(foundQ).toBeNull();

      const foundOpts = await QuestionOption.findAll({ where: { id: optionIds } });
      expect(foundOpts.length).toBe(0);
    });
  });

  describe('Courses permanent deletion', () => {
    it('permanently deletes an un-enrolled course and cascades sections and lectures', async () => {
      const course = await Course.findOne({
        where: { slug: 'smle-prometric-clinical-medicine' },
        include: [{ model: CourseSection, as: 'courseSections', include: [{ model: Lecture, as: 'lectures' }] }],
      });
      expect(course).not.toBeNull();
      const courseId = course.id;
      const sectionIds = course.courseSections.map((s) => s.id);
      const lectureIds = course.courseSections.flatMap((s) => s.lectures.map((l) => l.id));

      await deleteCourse(courseId);

      // Verify course, sections, and lectures are gone
      const foundCourse = await Course.findByPk(courseId);
      expect(foundCourse).toBeNull();

      const foundSections = await CourseSection.findAll({ where: { id: sectionIds } });
      expect(foundSections.length).toBe(0);

      const foundLectures = await Lecture.findAll({ where: { id: lectureIds } });
      expect(foundLectures.length).toBe(0);
    });
  });

  describe('Mock exams permanent deletion', () => {
    it('permanently deletes an un-attempted mock exam and cascades mock_exam_questions', async () => {
      const mockExam = await MockExam.findOne({ where: { title: 'High-Yield Pharmacology & Pathology Challenge' } });
      expect(mockExam).not.toBeNull();
      const examId = mockExam.id;

      await deleteMockExam(examId);

      const foundExam = await MockExam.findByPk(examId);
      expect(foundExam).toBeNull();

      const foundMeq = await MockExamQuestion.findAll({ where: { mockExamId: examId } });
      expect(foundMeq.length).toBe(0);
    });
  });

  describe('Faculty, FAQs, Coupons, Announcements permanent deletion', () => {
    it('permanently deletes a coupon', async () => {
      const coupon = await Coupon.findOne({ where: { code: 'STUDENT15' } });
      expect(coupon).not.toBeNull();
      await deleteCouponAdmin(coupon.id);

      const found = await Coupon.findByPk(coupon.id);
      expect(found).toBeNull();
    });

    it('permanently deletes a faculty member', async () => {
      const faculty = await Faculty.findOne({ where: { name: 'Dr. Usman Farooq' } });
      expect(faculty).not.toBeNull();
      await deleteFaculty(faculty.id);

      const found = await Faculty.findByPk(faculty.id);
      expect(found).toBeNull();
    });

    it('permanently deletes an FAQ', async () => {
      const faq = await Faq.findOne();
      expect(faq).not.toBeNull();
      const faqId = faq.id;
      await deleteFaq(faqId);

      const found = await Faq.findByPk(faqId);
      expect(found).toBeNull();
    });

    it('permanently deletes an announcement', async () => {
      const announcement = await Announcement.findOne();
      expect(announcement).not.toBeNull();
      const aId = announcement.id;
      await deleteAnnouncementAdmin(aId);

      const found = await Announcement.findByPk(aId);
      expect(found).toBeNull();
    });
  });
});
