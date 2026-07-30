import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileQuestion,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  TrendingUp,
  Award,
  Clock,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Card, Button, Badge, ProgressBar } from "../../components/ui";

interface DemoQuestion {
  id: number;
  stem: string;
  options: { id: number; text: string }[];
  correctOptionId: number;
  explanation: string;
  subject: string;
  system: string;
}

export const QBankMarketingPage: React.FC = () => {
  const navigate = useNavigate();

  // 5 Sample Demo Questions
  const sampleQuestions: DemoQuestion[] = [
    {
      id: 1,
      subject: "Pharmacology",
      system: "Cardiovascular",
      stem: "A 58-year-old male with a history of hypertension and heart failure with reduced ejection fraction (HFrEF) presents for routine follow-up. Physical examination shows a blood pressure of 138/88 mmHg and heart rate of 68/min. Laboratory studies show serum potassium of 5.2 mEq/L and creatinine of 1.4 mg/dL. Which medication is most indicated to reduce all-cause mortality in this patient while requiring close monitoring of serum potassium?",
      options: [
        { id: 1, text: "Hydrochlorothiazide" },
        { id: 2, text: "Spironolactone" },
        { id: 3, text: "Amlodipine" },
        { id: 4, text: "Furosemide" },
      ],
      correctOptionId: 2,
      explanation: "Spironolactone (or eplerenone) is a mineralocorticoid receptor antagonist (MRA) proven to reduce all-cause mortality in patients with HFrEF (NYHA class II-IV). Because MRAs inhibit aldosterone action in the late distal tubule and collecting duct, they can cause hyperkalemia and require serum potassium and renal function monitoring.",
    },
    {
      id: 2,
      subject: "Pathology",
      system: "Renal System",
      stem: "A 7-year-old boy presents to the clinic 2 weeks after recovering from a impetigo skin infection. His mother noted puffiness around his eyes and dark cola-colored urine this morning. Blood pressure is 135/85 mmHg. Urinalysis reveals dysmorphic red blood cells and RBC casts. Serum C3 complement level is significantly decreased. Which immunofluorescence finding is most characteristic of this renal condition?",
      options: [
        { id: 1, text: "Linear IgG deposition along the glomerular basement membrane" },
        { id: 2, text: "Granular 'starry sky' IgG and C3 deposition in mesangium and GBM" },
        { id: 3, text: "IgA immune complex deposition in the mesangium only" },
        { id: 4, text: "Subepithelial spike and dome electron-dense deposits" },
      ],
      correctOptionId: 2,
      explanation: "Post-streptococcal glomerulonephritis (PSGN) typically develops 1 to 4 weeks after group A beta-hemolytic streptococcal (pharyngitis or impetigo) infection. Immunofluorescence shows coarse granular ('starry sky' or lumpy-bumpy) deposits of IgG, IgM, and C3 along the GBM and mesangium.",
    },
    {
      id: 3,
      subject: "Microbiology",
      system: "Respiratory",
      stem: "A 32-year-old female presents with fever, dry non-productive cough, and malaise for 5 days. Chest X-ray reveals bilateral patchy interstitial infiltrates despite mild physical examination findings ('walking pneumonia'). Cold agglutinin titer test is positive. Which antibiotic mechanism of action is indicated for treatment of this organism?",
      options: [
        { id: 1, text: "Inhibition of bacterial cell wall peptidoglycan synthesis" },
        { id: 2, text: "Inhibition of the 50S ribosomal subunit (Macrolides)" },
        { id: 3, text: "Inhibition of bacterial DNA gyrase (Fluoroquinolones)" },
        { id: 4, text: "Disruption of bacterial cell membrane permeability" },
      ],
      correctOptionId: 2,
      explanation: "Mycoplasma pneumoniae lacks a cell wall (making cell-wall inhibitors like penicillins ineffective) and causes atypical 'walking' pneumonia with elevated IgM cold agglutinins. Macrolides (e.g. Azithromycin) target the 50S ribosomal subunit to inhibit protein synthesis.",
    },
    {
      id: 4,
      subject: "Physiology",
      system: "Gastrointestinal",
      stem: "A 45-year-old male undergoes a total gastrectomy following a gastric neoplasm. Which vitamin deficiency is he at greatest risk of developing due to loss of intrinsic factor secretion from parietal cells?",
      options: [
        { id: 1, text: "Vitamin B1 (Thiamine)" },
        { id: 2, text: "Vitamin B6 (Pyridoxine)" },
        { id: 3, text: "Vitamin B12 (Cobalamin)" },
        { id: 4, text: "Vitamin C (Ascorbic acid)" },
      ],
      correctOptionId: 3,
      explanation: "Gastric parietal cells secrete intrinsic factor (IF), which is essential for the absorption of Vitamin B12 (cobalamin) in the terminal ileum. Total gastrectomy eliminates IF secretion, leading to megaloblastic anemia and subacute combined degeneration of the spinal cord if not supplemented.",
    },
    {
      id: 5,
      subject: "Biochemistry",
      system: "Endocrine",
      stem: "A 4-month-old infant is brought to the clinic due to lethargy and failure to thrive. Physical examination reveals hepatomegaly, severe fasting hypoglycemia, and elevated blood lactate levels. Liver biopsy demonstrates deficient glucose-6-phosphatase activity. What is the diagnosis?",
      options: [
        { id: 1, text: "Von Gierke Disease (Type I Glycogen Storage Disease)" },
        { id: 2, text: "Pompe Disease (Type II Glycogen Storage Disease)" },
        { id: 3, text: "Cori Disease (Type III Glycogen Storage Disease)" },
        { id: 4, text: "McArdle Disease (Type V Glycogen Storage Disease)" },
      ],
      correctOptionId: 1,
      explanation: "Von Gierke disease (GSD Type I) is caused by glucose-6-phosphatase deficiency. Impaired gluconeogenesis and glycogenolysis lead to severe fasting hypoglycemia, lactic acidosis, hyperuricemia, and hepatomegaly.",
    },
  ];

  // Interactive Demo State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentQ = sampleQuestions[currentIdx];
  const userChoice = selectedAnswers[currentQ.id];

  const handleSelectOption = (optId: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: optId,
    }));
  };

  const calculateScore = () => {
    let correct = 0;
    sampleQuestions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correctOptionId) {
        correct++;
      }
    });
    return correct;
  };

  const score = calculateScore();

  return (
    <div className="space-y-12 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Hero Banner */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-14 rounded-3xl text-center space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-96 h-96 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0FA3A3]/20 text-[#0FA3A3] text-xs font-bold border border-[#0FA3A3]/40">
            <Sparkles className="w-4 h-4" />
            <span>Interactive Medical QBank Engine</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            NRE Step 1 & Gulf Exam Style <span className="text-[#0FA3A3]">QBank</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            Master 3,000+ single-best-answer clinical vignettes with step-by-step explanations, high-yield organ pathology mechanisms, and real-time exam analytics.
          </p>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0E2A47] text-[#0FA3A3] flex items-center justify-center">
            <FileQuestion className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">3,000+ Vignettes</h3>
          <p className="text-xs text-slate-600">
            Strictly modeled on PMDC NRE Step 1, SMLE, USMLE, and Gulf licensing blueprints.
          </p>
        </Card>

        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0FA3A3] text-white flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">Practice & Exam Modes</h3>
          <p className="text-xs text-slate-600">
            Choose instant feedback mode or timed exam simulations with palette navigation.
          </p>
        </Card>

        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0E2A47] text-[#0FA3A3] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">Performance Analytics</h3>
          <p className="text-xs text-slate-600">
            Identify weak organ systems and track your accuracy and time per question.
          </p>
        </Card>

        <Card className="p-5 border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-lg bg-[#0FA3A3] text-white flex items-center justify-center">
            <RotateCcw className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0E2A47]">Incorrect Pools</h3>
          <p className="text-xs text-slate-600">
            One-click retest incorrect and bookmarked questions to ensure complete mastery.
          </p>
        </Card>
      </div>

      {/* INTERACTIVE 5-QUESTION DEMO SECTION */}
      <Card className="p-6 sm:p-8 border-[#0FA3A3]/30 shadow-lg bg-white space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="teal">TRY IT NOW</Badge>
              <span className="text-xs text-slate-500 font-bold">Interactive Sample Demo</span>
            </div>
            <h2 className="text-xl font-extrabold text-[#0E2A47] mt-1">
              Sample Clinical Vignette Practice ({currentIdx + 1} of {sampleQuestions.length})
            </h2>
          </div>

          {/* Question Stepper */}
          <div className="flex items-center gap-2">
            {sampleQuestions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentIdx(idx)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentIdx === idx
                    ? "bg-[#0E2A47] text-white shadow-xs"
                    : selectedAnswers[q.id]
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Current Question Stem Card */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0FA3A3]">
            <span>{currentQ.subject}</span> &bull; <span>{currentQ.system}</span>
          </div>

          <p className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
            {currentQ.stem}
          </p>

          {/* Options List */}
          <div className="space-y-2.5">
            {currentQ.options.map((opt) => {
              const isSelected = userChoice === opt.id;
              const isCorrect = currentQ.correctOptionId === opt.id;

              let optionStyle = "border-slate-200 bg-white hover:border-slate-300 text-slate-700";
              if (isSelected) {
                if (isCorrect) {
                  optionStyle = "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold";
                } else {
                  optionStyle = "border-rose-400 bg-rose-50 text-rose-900 font-bold";
                }
              } else if (userChoice && isCorrect) {
                optionStyle = "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold";
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`w-full p-3.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between cursor-pointer ${optionStyle}`}
                >
                  <span className="leading-snug">{opt.text}</span>
                  {userChoice && (
                    <span>
                      {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation Box (shows immediately upon selecting an answer) */}
          {userChoice && (
            <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2 text-xs animate-fadeIn">
              <div className="flex items-center gap-2 text-[#0FA3A3] font-bold uppercase tracking-wider text-[10px]">
                <HelpCircle className="w-4 h-4" /> Explanation & Clinical Pearl
              </div>
              <p className="text-slate-300 leading-relaxed font-normal">{currentQ.explanation}</p>
            </div>
          )}
        </div>

        {/* Runner Navigation Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
          >
            Previous
          </Button>

          {currentIdx < sampleQuestions.length - 1 ? (
            <Button
              size="sm"
              variant="teal"
              onClick={() => setCurrentIdx((prev) => Math.min(sampleQuestions.length - 1, prev + 1))}
            >
              Next Question
            </Button>
          ) : (
            <Button
              size="sm"
              variant="teal"
              onClick={() => setIsSubmitted(true)}
            >
              View Demo Result
            </Button>
          )}
        </div>

        {/* Final Demo Score Result Modal / Card */}
        {isSubmitted && (
          <div className="p-6 bg-slate-900 text-white rounded-2xl space-y-4 text-center">
            <Badge variant="teal">Demo Completed!</Badge>
            <h3 className="text-xl font-extrabold text-white">
              You scored {score} / {sampleQuestions.length} ({Math.round((score / sampleQuestions.length) * 100)}%)
            </h3>
            <p className="text-xs text-slate-300 max-w-md mx-auto">
              Ready to unlock the complete 3,000+ question bank with full subject and body system analytics?
            </p>
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              <Button variant="teal" onClick={() => navigate("/register")}>
                Create Free Account
              </Button>
              <Button variant="outline" onClick={() => navigate("/courses")} className="text-white border-white/40">
                Explore Courses
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
