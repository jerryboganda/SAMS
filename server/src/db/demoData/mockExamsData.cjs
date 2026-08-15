'use strict';

// server/src/db/demoData/mockExamsData.cjs
// Full-length mock examinations across NRE and FCPS categories.

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
    title: 'NRE Step 2 Clinical Knowledge Simulation',
    exam_category: 'NRE2',
    duration_minutes: 90,
    pass_percent: 65.0,
    question_count: 75,
    is_published: true,
  },
  {
    title: 'FCPS Part 1 Basic Sciences Paper 1 Mock',
    exam_category: 'FCPS1',
    duration_minutes: 60,
    pass_percent: 70.0,
    question_count: 50,
    is_published: true,
  },
  {
    title: 'FCPS Part 1 Basic Sciences Paper 2 Mock',
    exam_category: 'FCPS1',
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
