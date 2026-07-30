import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Award, Users, BookOpen, Target, Heart, CheckCircle2, ArrowRight } from "lucide-react";
import { Card, Badge, Button, StatCard } from "../../components/ui";

export const AboutPage: React.FC = () => {
  const navigate = useNavigate();

  const values = [
    {
      title: "Clinical Accuracy",
      desc: "Every question, explanation, and video lecture is crafted by practicing physicians aligned with PMDC and Gulf licensing blueprints.",
      icon: <Target className="w-6 h-6 text-[#0FA3A3]" />,
    },
    {
      title: "Student First",
      desc: "Affordable PKR pricing, transparent access validity, and instant Pakistan local payment gateways (JazzCash, EasyPaisa, Raast).",
      icon: <Heart className="w-6 h-6 text-rose-500" />,
    },
    {
      title: "Content Security",
      desc: "State-of-the-art DRM video protection with dynamic watermark security ensures high-value educational content stays protected.",
      icon: <ShieldCheck className="w-6 h-6 text-[#0E2A47]" />,
    },
    {
      title: "High-Yield Focus",
      desc: "Zero fluff. We prioritize exam-tested clinical vignettes, organ system mechanisms, and single-best-answer strategy.",
      icon: <Award className="w-6 h-6 text-amber-500" />,
    },
  ];

  return (
    <div className="space-y-12 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Hero Header */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-14 rounded-3xl text-center space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-16 -bottom-16 w-96 h-96 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <Badge variant="teal">About SAMS Academy</Badge>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
          Empowering Doctors to Excel in Medical Licensing
        </h1>
        <p className="text-sm sm:text-base text-slate-300 max-w-3xl mx-auto leading-relaxed">
          Founded in Pakistan, SAMS Academy is dedicated to providing gold-standard medical exam preparation for NRE Step 1, USMLE, SMLE (Saudi Licensing), DHA, Prometric, and MBBS students.
        </p>
      </div>

      {/* Platform Statistics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Candidates" value="10,000+" subtext="Across PK & Gulf" icon={<Users className="w-5 h-5 text-[#0FA3A3]" />} />
        <StatCard title="Exam Pass Rate" value="94.8%" subtext="Verified Results" icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} />
        <StatCard title="QBank Pool" value="3,000+" subtext="Clinical Vignettes" icon={<BookOpen className="w-5 h-5 text-[#0FA3A3]" />} />
        <StatCard title="Video Hours" value="150+ hrs" subtext="Adaptive HD DRM" icon={<Award className="w-5 h-5 text-[#0E2A47]" />} />
      </div>

      {/* Story & Mission Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <Card className="p-8 border-slate-200 space-y-4">
          <Badge variant="navy">Our Founding Mission</Badge>
          <h2 className="text-2xl font-bold text-[#0E2A47]">Bridging the Gap Between Medical School and Licensing Success</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Medical students in Pakistan and the Gulf region face rigorous licensing hurdles, including the PMDC NRE Step 1 exam and Middle Eastern licensing exams. SAMS Academy was established to provide structured, high-yield learning materials that mirror actual exam environments.
          </p>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            By combining HD video lectures, system-wise clinical QBank questions, and real-time performance analytics, we help candidates identify their weaknesses early and pass on their first attempt.
          </p>
        </Card>

        <Card className="p-8 border-slate-200 space-y-4 bg-gradient-to-br from-[#0E2A47] to-[#0FA3A3]/80 text-white">
          <Badge variant="teal">Leadership Message</Badge>
          <blockquote className="text-xs sm:text-sm italic leading-relaxed text-slate-100">
            "Passing your licensing exam is not about memorizing thousands of pages — it is about mastering high-yield concepts and understanding clinical vignette logic. We built SAMS Academy to give every doctor the exact tools they need."
          </blockquote>
          <div>
            <p className="text-sm font-bold text-white">Dr. Zabih Ullah</p>
            <p className="text-xs text-[#0FA3A3] font-medium">Founder & CEO, SAMS Academy</p>
          </div>
        </Card>
      </div>

      {/* Core Values Grid */}
      <div className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <Badge variant="teal">Guiding Pillars</Badge>
          <h2 className="text-2xl font-bold text-[#0E2A47]">Our Core Principles</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map((v, i) => (
            <Card key={i} className="p-6 border-slate-200 space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                {v.icon}
              </div>
              <h3 className="text-base font-bold text-[#0E2A47]">{v.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{v.desc}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* CTA Footer */}
      <Card className="p-8 text-center space-y-4 bg-[#0E2A47] text-white border-none rounded-3xl shadow-xl">
        <h2 className="text-2xl font-bold text-white">Start Your Exam Preparation Journey Today</h2>
        <p className="text-xs sm:text-sm text-slate-100 font-medium max-w-xl mx-auto">
          Explore our NRE Step 1 and Gulf licensing course bundles or test your skills with our interactive QBank demo.
        </p>
        <div className="flex flex-wrap gap-4 justify-center pt-2">
          <Button variant="teal" onClick={() => navigate("/courses")} rightIcon={<ArrowRight className="w-4 h-4" />}>
            Explore Courses
          </Button>
          <Button variant="outline" onClick={() => navigate("/contact")} className="text-white border-white/40 hover:bg-white/10">
            Contact Support
          </Button>
        </div>
      </Card>
    </div>
  );
};
