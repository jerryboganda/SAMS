'use strict';

// server/src/db/demoData/mockExamsData.cjs
// Full-length mock examinations across valid EXAM_CATEGORIES.

const MOCK_EXAMS = [
  {
    title: 'NRE Step 1 Grand Mock Examination',
    exam_category: 'NRE1',
    duration_minutes: 120,
    pass_percent: 60.0,
    question_count: 100,
    is_published: true,
  },
  {
    title: 'USMLE Step 2 CK Clinical Simulation',
    exam_category: 'USMLE2CK',
    duration_minutes: 90,
    pass_percent: 65.0,
    question_count: 75,
    is_published: true,
  },
  {
    title: 'USMLE Step 1 Basic Sciences Mock Paper 1',
    exam_category: 'USMLE1',
    duration_minutes: 60,
    pass_percent: 70.0,
    question_count: 50,
    is_published: true,
  },
  {
    title: 'SMLE Medical Licensing Mock Examination',
    exam_category: 'SMLE',
    duration_minutes: 60,
    pass_percent: 70.0,
    question_count: 50,
    is_published: true,
  },
  {
    title: 'High-Yield Pharmacology & Pathology Challenge',
    exam_category: 'NRE1',
    duration_minutes: 60,
    pass_percent: 60.0,
    question_count: 50,
    is_published: true,
  },
];

module.exports = MOCK_EXAMS;
