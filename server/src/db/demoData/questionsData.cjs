'use strict';

// server/src/db/demoData/questionsData.cjs
// Generates 500+ realistic medical MCQs distributed across all categories, subjects, and systems.

function mulberry32(seed) {
  let s = seed;
  return function rand() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = ['NRE1', 'NRE2', 'FCPS1', 'FCPS2'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

const CLINICAL_VIGNETTES = [
  (age, gender, symptom, system, subject) =>
    `A ${age}-year-old ${gender} presents to the clinic complaining of progressive ${symptom}. Physical examination reveals abnormal findings localized to the ${system} system. Diagnostic workup is initiated focusing on ${subject} mechanisms.`,
  (age, gender, symptom, system, subject) =>
    `A ${age}-year-old ${gender} is brought to the emergency department with acute onset of ${symptom}. Laboratory investigations show biochemical and pathological derangements within the ${system} system related to ${subject}.`,
  (age, gender, symptom, system, subject) =>
    `During a routine medical evaluation, a ${age}-year-old ${gender} is found to have asymptomatic abnormalities concerning the ${system} system. Further questioning reveals subtle episodes of ${symptom}.`,
  (age, gender, symptom, system, subject) =>
    `A ${age}-year-old ${gender} with a known chronic condition undergoes evaluation for recurrent ${symptom}. Biopsy and functional studies of the ${system} system demonstrate classic findings studied in ${subject}.`,
  (age, gender, symptom, system, subject) =>
    `A medical resident reviews the case of a ${age}-year-old ${gender} admitted with severe ${symptom} secondary to acute ${system} decompensation. A question arises regarding the key ${subject} pathophysiological step.`,
];

const SYMPTOMS_BY_SYSTEM = {
  Cardiovascular: ['chest tightness on exertion and dyspnea', 'palpitations, presyncope, and lower extremity edema', 'elevated blood pressure refractory to dual therapy'],
  Respiratory: ['chronic productive cough, wheezing, and hemoptysis', 'sudden-onset pleuritic chest pain and tachypnea', 'progressive exercise intolerance and bibasilar crackles'],
  GIT: ['postprandial epigastric pain radiating to the back', 'unintentional weight loss, early satiety, and melena', 'jaundice, right upper quadrant tenderness, and pruritus'],
  Renal: ['tea-colored urine, periorbital edema, and oliguria', 'flank pain with microscopic hematuria and azotemia', 'proteinuria, generalized anasarca, and hypoalbuminemia'],
  Endocrine: ['heat intolerance, tremors, weight loss, and diaphoresis', 'central obesity, proximal muscle weakness, and purple striae', 'polyuria, polydipsia, and unexplained fatigue'],
  Reproductive: ['irregular menstrual bleeding and pelvic pressure', 'acute testicular pain and swelling with abnormal Doppler findings', 'secondary amenorrhea, galactorrhea, and bitemporal hemianopsia'],
  MSK: ['morning joint stiffness lasting over 1 hour and symmetric synovitis', 'acute monoarticular knee swelling with needle-shaped crystals', 'proximal muscle pain, elevated CK, and heliotrope rash'],
  Neuro: ['unilateral resting tremor, rigidity, and bradykinesia', 'ascending paresthesias and symmetrical lower limb weakness', 'sudden-onset focal neurological deficit and expressive aphasia'],
  'Heme/Onc': ['easy bruising, mucosal bleeding, and severe fatigue', 'painless cervical lymphadenopathy and drenching night sweats', 'microcytic hypochromic anemia unresponsive to oral iron'],
  'General Principles': ['fever of unknown origin with generalized malaise', 'anaphylactoid reaction following medication administration', 'septic shock with refractory hypotension'],
};

function getSymptoms(systemName) {
  return SYMPTOMS_BY_SYSTEM[systemName] || SYMPTOMS_BY_SYSTEM['General Principles'];
}

function buildOptionSet(subjectName, systemName, questionIndex, rand) {
  const s = subjectName.toLowerCase();
  const y = systemName.toLowerCase();

  const options = [
    `Upregulated ${s} enzymatic signaling pathway directly stimulating ${y} target receptors`,
    `Inhibition of negative feedback inhibition in ${s} regulatory circuits governing ${y} tissue`,
    `Autoimmune-mediated antibody deposition targeting ${y} structural proteins in response to ${s} stress`,
    `Compensatory downregulation of secondary messengers in ${y} effector cells secondary to ${s} dysfunction`,
  ];

  const correctIndex = Math.floor(rand() * 4);
  return options.map((optText, idx) => ({
    option_text: optText,
    is_correct: idx === correctIndex,
    sort_order: idx,
  }));
}

/**
 * Generates N questions evenly across categories, subjects, and systems.
 */
function generateQuestions(subjects, systems, totalCount = 500) {
  const rand = mulberry32(10102026);
  const questions = [];
  const allOptions = [];

  const ages = [23, 34, 45, 52, 61, 73];
  const genders = ['male', 'female'];

  // Distribution: NRE1 (40%), NRE2 (20%), FCPS1 (20%), FCPS2 (20%)
  for (let i = 0; i < totalCount; i += 1) {
    let category = 'NRE1';
    if (i >= totalCount * 0.8) category = 'FCPS2';
    else if (i >= totalCount * 0.6) category = 'FCPS1';
    else if (i >= totalCount * 0.4) category = 'NRE2';

    const subject = subjects[i % subjects.length];
    const system = systems[i % systems.length];
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];

    const age = ages[i % ages.length];
    const gender = genders[i % genders.length];
    const symptomPool = getSymptoms(system.name);
    const symptom = symptomPool[i % symptomPool.length];
    const vignetteFn = CLINICAL_VIGNETTES[i % CLINICAL_VIGNETTES.length];
    const stemVignette = vignetteFn(age, gender, symptom, system.name, subject.name);

    const questionStem = `${stemVignette} Which of the following best explains the fundamental ${subject.name} mechanism responsible for this patient's clinical presentation? (Case #${i + 1})`;
    const explanation = `In this clinical scenario involving the ${system.name} system, the presentation is characteristic of pathology governed by ${subject.name} principles. The correct answer reflects the primary molecular or pathophysiological mechanism. Other answer choices describe plausible metabolic or cellular alterations but do not constitute the primary driver of this presentation.`;
    const referenceText = `Harrison's Principles of Internal Medicine & First Aid for the USMLE/NRE — ${subject.name} & ${system.name} Section.`;

    questions.push({
      exam_category: category,
      subject_id: subject.id,
      system_id: system.id,
      stem: questionStem,
      image_url: null,
      explanation,
      reference_text: referenceText,
      difficulty,
      is_active: true,
      times_attempted: 0,
      times_correct: 0,
    });

    const opts = buildOptionSet(subject.name, system.name, i, rand);
    opts.forEach((o) => {
      allOptions.push({
        question_index: i,
        option_text: o.option_text,
        is_correct: o.is_correct,
        sort_order: o.sort_order,
      });
    });
  }

  return { questions, options: allOptions };
}

module.exports = {
  generateQuestions,
};
