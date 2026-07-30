import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Award, BookOpen, Star, CheckCircle2, ShieldCheck, Mail } from "lucide-react";
import { Card, Badge, Button } from "../../components/ui";
import { MOCK_FACULTY, MOCK_COURSES } from "../../mock-data";

export const FacultyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const faculty = MOCK_FACULTY.find((f) => String(f.id) === id) || MOCK_FACULTY[0];

  const credentialsList = [
    "MBBS (Gold Medalist) - King Edward Medical University",
    "FCPS / USMLE Step 1 & Step 2 CK Specialist",
    "Over 8+ Years of Medical Licensing Coaching Experience",
    "Author of High-Yield Clinical Vignette Questions for NRE Step 1",
  ];

  return (
    <div className="space-y-10 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Back Button */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/faculty")}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          Back to Faculty List
        </Button>
      </div>

      {/* Main Profile Header */}
      <Card className="p-8 border-slate-200 bg-white shadow-md flex flex-col md:flex-row gap-8 items-center md:items-start">
        <img
          src={faculty.photoUrl}
          alt={faculty.name}
          className="w-36 h-36 rounded-2xl object-cover border-4 border-[#0FA3A3] shadow-lg shrink-0"
        />

        <div className="space-y-4 flex-1 text-center md:text-left">
          <div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-1">
              <Badge variant="teal">Senior Instructor</Badge>
              <div className="flex items-center gap-1 text-amber-500 text-xs font-bold">
                <Star className="w-4 h-4 fill-amber-400" /> 4.9 / 5.0 Rating
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0E2A47]">{faculty.name}</h1>
            <p className="text-sm font-bold text-[#0FA3A3] mt-1">{faculty.title}</p>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">{faculty.bio}</p>

          <div className="pt-2 flex flex-wrap gap-3 justify-center md:justify-start">
            <Button size="sm" variant="teal" onClick={() => navigate("/courses")}>
              View Courses Taught
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/contact")}>
              Contact Instructor
            </Button>
          </div>
        </div>
      </Card>

      {/* Credentials & Teaching Philosophy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-6 border-slate-200 space-y-4">
          <h3 className="text-lg font-bold text-[#0E2A47] flex items-center gap-2">
            <Award className="w-5 h-5 text-[#0FA3A3]" /> Credentials & Background
          </h3>
          <ul className="space-y-3">
            {credentialsList.map((cred, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{cred}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 border-slate-200 space-y-4">
          <h3 className="text-lg font-bold text-[#0E2A47] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#0FA3A3]" /> Featured Course Module
          </h3>
          <div className="p-4 bg-slate-50 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="navy">NRE Step 1</Badge>
              <span className="text-xs text-emerald-600 font-bold">Includes QBank</span>
            </div>
            <h4 className="text-sm font-bold text-[#0E2A47]">NRE Step 1 Complete Preparation Masterclass</h4>
            <p className="text-xs text-slate-600">
              High-yield systemic pathology, pharmacology, and clinical vignette walkthroughs instructed by {faculty.name}.
            </p>
            <Link to="/courses">
              <Button size="xs" variant="teal" className="mt-2">
                Explore Course
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};
