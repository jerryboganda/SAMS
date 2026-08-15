'use strict';

// server/src/db/demoData/coursesData.cjs
// Abundant curriculum for SAMS Academy across supported EXAM_CATEGORIES:
// ['NRE1', 'USMLE1', 'USMLE2CK', 'SMLE', 'DHA', 'PROMETRIC', 'MBBS', 'OTHER']

const COURSES = [
  {
    title: 'NRE Step 1 Comprehensive Mastery Course',
    slug: 'nre-step-1-complete-course',
    exam_category: 'NRE1',
    short_description: 'The definitive NRE Step 1 preparatory course covering basic medical sciences, high-yield organ pathology, and clinical correlations.',
    description:
      'Master every basic science subject tested on the NRE Step 1. Includes structured high-yield video lectures, integrated clinical vignettes, practice questions, and full-length timed mock exams with 180 days of unlimited access.',
    thumbnail_url: null,
    price: 15000.0,
    currency: 'PKR',
    validity_days: 180,
    includes_qbank: true,
    is_published: true,
    sort_order: 0,
    sections: [
      {
        title: 'Section 1: Basic Sciences Foundations',
        lectures: [
          { title: 'Orientation, High-Yield Strategy & Exam Blueprint', minutes: 12, duration_seconds: 720, is_free_preview: true },
          { title: 'Clinical Anatomy: Thorax, Abdomen & Pelvis Essentials', minutes: 28, duration_seconds: 1680, is_free_preview: false },
          { title: 'Core Cellular Physiology & Membrane Transport', minutes: 25, duration_seconds: 1500, is_free_preview: false },
        ],
      },
      {
        title: 'Section 2: Systemic Pathology & Pathophysiology',
        lectures: [
          { title: 'Cardiovascular Pathology: Ischemic Heart Disease & Valvular Disorders', minutes: 32, duration_seconds: 1920, is_free_preview: true },
          { title: 'Respiratory Pathology: Obstructive vs Restrictive Lung Diseases', minutes: 27, duration_seconds: 1620, is_free_preview: false },
          { title: 'Renal & Acid-Base Disorders: Glomerulonephropathies Review', minutes: 30, duration_seconds: 1800, is_free_preview: false },
        ],
      },
      {
        title: 'Section 3: High-Yield Pharmacology & Clinical Integration',
        lectures: [
          { title: 'Autonomic & Cardiovascular Pharmacotherapy', minutes: 26, duration_seconds: 1560, is_free_preview: false },
          { title: 'Antimicrobial Chemotherapy & Resistance Mechanisms', minutes: 34, duration_seconds: 2040, is_free_preview: false },
          { title: 'Endocrine, Metabolic & Neuropharmacology Highlights', minutes: 31, duration_seconds: 1860, is_free_preview: false },
        ],
      },
    ],
  },
  {
    title: 'USMLE Step 2 CK & Clinical OSCE Masterclass',
    slug: 'usmle-step-2-ck-clinical-skills',
    exam_category: 'USMLE2CK',
    short_description: 'Comprehensive clinical knowledge, diagnostic decision-making, patient management, and OSCE examination station simulations.',
    description:
      'Prepare effectively for clinical licensing exams. This course bridges textbook medicine and bedside clinical management with focused modules on Internal Medicine, Surgery, Pediatrics, Gyn/Obs, and high-scoring OSCE protocols.',
    thumbnail_url: null,
    price: 18000.0,
    currency: 'PKR',
    validity_days: 180,
    includes_qbank: true,
    is_published: true,
    sort_order: 1,
    sections: [
      {
        title: 'Section 1: Internal Medicine & Diagnostic Workups',
        lectures: [
          { title: 'Approach to Acute Chest Pain & STEMI Management', minutes: 24, duration_seconds: 1440, is_free_preview: true },
          { title: 'Altered Mental Status, Stroke Protocols & Neuro Emergencies', minutes: 28, duration_seconds: 1680, is_free_preview: false },
          { title: 'Acute Kidney Injury & Electrolyte Derangements Workup', minutes: 26, duration_seconds: 1560, is_free_preview: false },
        ],
      },
      {
        title: 'Section 2: Surgical Principles, Trauma & Acute Care',
        lectures: [
          { title: 'ATLS Primary Survey & Polytrauma Resuscitation', minutes: 30, duration_seconds: 1800, is_free_preview: false },
          { title: 'Acute Abdomen: Differential Diagnosis & Surgical Indications', minutes: 25, duration_seconds: 1500, is_free_preview: false },
          { title: 'Pre-operative Optimization & Post-op Complications', minutes: 22, duration_seconds: 1320, is_free_preview: false },
        ],
      },
      {
        title: 'Section 3: Pediatrics, OB/GYN & OSCE Station Strategies',
        lectures: [
          { title: 'Pediatric Emergencies: Neonatal Resuscitation & Sepsis', minutes: 27, duration_seconds: 1620, is_free_preview: false },
          { title: 'Obstetric Emergencies: PPH, Pre-eclampsia & OSCE Counseling', minutes: 29, duration_seconds: 1740, is_free_preview: false },
        ],
      },
    ],
  },
  {
    title: 'USMLE Step 1 Basic Medical Sciences Immersion',
    slug: 'usmle-step-1-basic-sciences',
    exam_category: 'USMLE1',
    short_description: 'Intensive preparation for USMLE Step 1 across all subspecialties covering Anatomy, Physiology, Pathology, and Pharmacology.',
    description:
      'Deep-dive into high-yield basic sciences questions, systemic pathology concepts, clinical embryology, and neuroanatomy with full 365-day access and exam-pattern QBank.',
    thumbnail_url: null,
    price: 20000.0,
    currency: 'PKR',
    validity_days: 365,
    includes_qbank: true,
    is_published: true,
    sort_order: 2,
    sections: [
      {
        title: 'Section 1: General & Systemic Pathology',
        lectures: [
          { title: 'Cellular Adaptations, Cell Death & Inflammation Mechanisms', minutes: 30, duration_seconds: 1800, is_free_preview: true },
          { title: 'Neoplasia: Oncogenes, Tumor Suppressors & Paraneoplastic Syndromes', minutes: 35, duration_seconds: 2100, is_free_preview: false },
          { title: 'Hemodynamic Disorders, Thromboembolism & Shock', minutes: 28, duration_seconds: 1680, is_free_preview: false },
        ],
      },
      {
        title: 'Section 2: Medical Pharmacology & Toxicology',
        lectures: [
          { title: 'Pharmacokinetics & Pharmacodynamics Principles', minutes: 25, duration_seconds: 1500, is_free_preview: false },
          { title: 'CNS Pharmacology: Sedatives, Antiepileptics & Anesthetics', minutes: 32, duration_seconds: 1920, is_free_preview: false },
          { title: 'Immunosuppressants & Antineoplastic Drugs', minutes: 27, duration_seconds: 1620, is_free_preview: false },
        ],
      },
      {
        title: 'Section 3: Applied Anatomy, Embryology & Neuroanatomy',
        lectures: [
          { title: 'Head & Neck Anatomy, Cranial Nerves & Clinical Lesions', minutes: 33, duration_seconds: 1980, is_free_preview: false },
          { title: 'Spinal Cord Tracts, Brainstem Syndromes & Neuro Pathways', minutes: 36, duration_seconds: 2160, is_free_preview: false },
          { title: 'Clinical Embryology & Congenital Anomalies', minutes: 26, duration_seconds: 1560, is_free_preview: false },
        ],
      },
    ],
  },
  {
    title: 'SMLE & Prometric Clinical Medicine Review',
    slug: 'smle-prometric-clinical-medicine',
    exam_category: 'SMLE',
    short_description: 'Targeted licensing exam preparation for SMLE, DHA, and Prometric medical board certifications.',
    description:
      'Tailored for candidates preparing for Gulf medical licensing exams (SMLE, DHA, MOH). Focuses on high-yield clinical decision making, common regional diseases, and high-frequency Prometric MCQs.',
    thumbnail_url: null,
    price: 22000.0,
    currency: 'PKR',
    validity_days: 365,
    includes_qbank: true,
    is_published: true,
    sort_order: 3,
    sections: [
      {
        title: 'Section 1: Inpatient Medicine & Critical Care Protocols',
        lectures: [
          { title: 'Septic Shock Management & Invasive Hemodynamic Monitoring', minutes: 35, duration_seconds: 2100, is_free_preview: true },
          { title: 'Mechanical Ventilation Strategies in ARDS & COPD', minutes: 32, duration_seconds: 1920, is_free_preview: false },
          { title: 'Complex Acid-Base & Triple-Disorder Analysis', minutes: 28, duration_seconds: 1680, is_free_preview: false },
        ],
      },
      {
        title: 'Section 2: Advanced Diagnostic Case Discussions',
        lectures: [
          { title: 'Multi-system Autoimmune & Vasculitis Case Masterclass', minutes: 34, duration_seconds: 2040, is_free_preview: false },
          { title: 'Cardiac Arrhythmias & Advanced ECG Interpretation', minutes: 30, duration_seconds: 1800, is_free_preview: false },
          { title: 'Oncologic Emergencies & Target Therapeutics', minutes: 29, duration_seconds: 1740, is_free_preview: false },
        ],
      },
    ],
  },
];

module.exports = COURSES;
