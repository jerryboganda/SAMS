'use strict';

// server/src/db/demoData/siteContentData.cjs
// Demo faculty, promotional coupons, FAQs, and announcements.

const FACULTY = [
  {
    name: 'Dr. Ayesha Raza',
    title: 'MBBS, FCPS (Internal Medicine)',
    bio: 'Dr. Ayesha has over 10 years of clinical and academic experience mentoring NRE and USMLE candidates, specializing in differential diagnosis and clinical reasoning.',
    photo_url: null,
    sort_order: 0,
    is_active: true,
  },
  {
    name: 'Dr. Bilal Ahmed',
    title: 'MBBS, MRCP (UK) — Cardiology & Pulmonology',
    bio: 'Dr. Bilal leads cardiology and respiratory review modules and has authored multiple high-yield question banks for medical licensing exams.',
    photo_url: null,
    sort_order: 1,
    is_active: true,
  },
  {
    name: 'Dr. Sana Khalid',
    title: 'MBBS, MPhil (Pharmacology & Therapeutics)',
    bio: 'Dr. Sana translates complex molecular mechanisms and pharmacokinetics into memorable, exam-focused clinical algorithms.',
    photo_url: null,
    sort_order: 2,
    is_active: true,
  },
  {
    name: 'Dr. Hamza Tariq',
    title: 'MBBS, FCPS (General Surgery & Trauma)',
    bio: 'Dr. Hamza specializes in acute surgical care, trauma resuscitation protocols, and high-scoring OSCE surgical skills training.',
    photo_url: null,
    sort_order: 3,
    is_active: true,
  },
  {
    name: 'Dr. Maryam Noor',
    title: 'MBBS, MCPS, FCPS (Obstetrics & Gynecology)',
    bio: 'Dr. Maryam directs maternal-fetal medicine and reproductive health curriculum for FCPS and NRE Step 2 OSCE candidates.',
    photo_url: null,
    sort_order: 4,
    is_active: true,
  },
  {
    name: 'Dr. Usman Farooq',
    title: 'MBBS, MD (Pathology & Microbiology)',
    bio: 'Dr. Usman is an expert histopathologist focused on systemic organ pathology, hematology, and clinical oncology question development.',
    photo_url: null,
    sort_order: 5,
    is_active: true,
  },
];

const COUPONS = [
  {
    code: 'WELCOME10',
    type: 'percent',
    value: 10.0,
    course_id: null,
    max_uses: null,
    used_count: 0,
    is_active: true,
  },
  {
    code: 'EID50',
    type: 'percent',
    value: 50.0,
    course_id: null,
    max_uses: 100,
    used_count: 12,
    is_active: true,
  },
  {
    code: 'DOCTOR25',
    type: 'percent',
    value: 25.0,
    course_id: null,
    max_uses: null,
    used_count: 5,
    is_active: true,
  },
  {
    code: 'FCPS2026',
    type: 'fixed',
    value: 3000.0,
    course_id: null,
    max_uses: null,
    used_count: 8,
    is_active: true,
  },
  {
    code: 'RAMADAN20',
    type: 'percent',
    value: 20.0,
    course_id: null,
    max_uses: 200,
    used_count: 24,
    is_active: true,
  },
  {
    code: 'STUDENT15',
    type: 'percent',
    value: 15.0,
    course_id: null,
    max_uses: null,
    used_count: 3,
    is_active: true,
  },
];

const FAQS = [
  {
    question: 'What is included in each complete preparation course?',
    answer:
      'Each comprehensive course includes structured high-yield video lectures divided into organized sections, full QBank access with timed & tutor modes, lecture bookmarks, progress tracking, and full-length timed mock exams.',
    sort_order: 0,
    is_active: true,
  },
  {
    question: 'How long do I retain access to purchased courses and QBank?',
    answer:
      'Course access validity varies by program (typically 180 days for NRE courses and 365 days for FCPS immersions) starting from the date of enrollment activation. You can renew or extend access anytime from your dashboard.',
    sort_order: 1,
    is_active: true,
  },
  {
    question: 'Can I access the QBank on multiple devices?',
    answer:
      'To protect intellectual property and ensure account security, SAMS Academy enforces a maximum limit of 2 registered active devices per student account and single-stream active playback.',
    sort_order: 2,
    is_active: true,
  },
  {
    question: 'What payment methods are supported for course enrollment?',
    answer:
      'We support direct instant checkout via JazzCash, EasyPaisa, as well as Raast ID transfer and manual Bank Transfer with fast verification and proof upload approval.',
    sort_order: 3,
    is_active: true,
  },
  {
    question: 'How do full-length Mock Exams work?',
    answer:
      'Mock exams simulate the exact timing, question volume, and passing threshold of the official licensing examinations. Performance analytics, detailed explanations, and score percentiles are unlocked immediately upon submission.',
    sort_order: 4,
    is_active: true,
  },
  {
    question: 'Can I create customized practice tests in the QBank?',
    answer:
      'Yes! You can filter practice sessions by exam category, specific subjects (e.g. Pharmacology, Anatomy), organ systems (e.g. Cardiovascular, Neuro), question status (unused, incorrect, flagged), and difficulty level.',
    sort_order: 5,
    is_active: true,
  },
  {
    question: 'Are video lectures downloadable for offline viewing?',
    answer:
      'Video lectures are streamed securely via encrypted adaptive bitrate video playback to ensure optimum speed and HD quality on web and mobile browsers without requiring local storage downloads.',
    sort_order: 6,
    is_active: true,
  },
  {
    question: 'How are manual bank transfer and Raast payments verified?',
    answer:
      'After completing your transfer, upload a screenshot or photo of your transaction receipt at checkout. Our admissions team verifies the reference and approves access within a few business hours.',
    sort_order: 7,
    is_active: true,
  },
  {
    question: 'Can I reset my question bank history to start fresh?',
    answer:
      'Yes, you can re-attempt questions in tutor or untimed mode, or select the "All Questions" pool to practice questions you have previously completed while retaining your cumulative performance stats.',
    sort_order: 8,
    is_active: true,
  },
  {
    question: 'What happens if my enrollment expires before my exam date?',
    answer:
      'If your enrollment expires, your past test history and notes remain saved in your account. You can easily extend your course access by contacting support or purchasing an extension directly from the student dashboard.',
    sort_order: 9,
    is_active: true,
  },
  {
    question: 'Are the questions updated to reflect the latest NRE/CPSP exam guidelines?',
    answer:
      'Yes. Our academic faculty regularly reviews clinical guidelines and exam feedback to add high-yield clinical vignettes, drug safety updates, and newly tested concepts.',
    sort_order: 10,
    is_active: true,
  },
  {
    question: 'How do I track my daily study time and analytics?',
    answer:
      'The Student Dashboard displays an interactive daily study heatmap, total questions solved, accuracy percentage by subject/system, and video viewing hours to help you maintain consistent preparation.',
    sort_order: 11,
    is_active: true,
  },
  {
    question: 'What should I do if I forget my password or get locked out?',
    answer:
      'Use the "Forgot Password" link on the login page to receive a secure password reset email. If your account is temporarily locked due to repeated incorrect password attempts, it automatically unlocks after 15 minutes.',
    sort_order: 12,
    is_active: true,
  },
  {
    question: 'Can I apply discount coupons at checkout?',
    answer:
      'Yes, if you have a valid promo code or institutional discount, enter it in the "Coupon Code" field on the checkout page to instantly receive the discount on your order.',
    sort_order: 13,
    is_active: true,
  },
  {
    question: 'How can I contact student support or faculty mentors?',
    answer:
      'You can submit a message through the "Contact Us" form on the website or reach out directly to support@samsacademy.com for academic assistance and technical support.',
    sort_order: 14,
    is_active: true,
  },
];

const ANNOUNCEMENTS = [
  {
    title: '2026 Medical Licensing Exam Schedule & Syllabus Updates',
    body: 'The national exam authority has announced the upcoming schedule for NRE Step 1 and Step 2 exams. All SAMS Academy courses and QBanks have been updated to reflect the latest high-yield exam blueprint.',
    audience: 'all',
    send_email: false,
  },
  {
    title: 'New High-Yield Pharmacology & Clinical Toxicology Modules Released',
    body: 'We have published a brand-new series of high-yield video lectures and 100+ clinical vignette MCQs focused on autonomic drugs, antimicrobial resistance, and cardiovascular therapeutics.',
    audience: 'all',
    send_email: false,
  },
  {
    title: 'Scheduled Platform Maintenance & Performance Upgrades',
    body: 'SAMS Academy will undergo scheduled server optimization on Sunday at 03:00 AM UTC. Video playback and QBank sessions will continue seamlessly without interruption.',
    audience: 'all',
    send_email: false,
  },
];

module.exports = {
  faculty: FACULTY,
  coupons: COUPONS,
  faqs: FAQS,
  announcements: ANNOUNCEMENTS,
};
