import React from "react";
import { Link } from "react-router-dom";
import { Award, BookOpen, Star, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, Badge, Button } from "../../components/ui";
import { MOCK_FACULTY, MOCK_COURSES } from "../../mock-data";

export const FacultyPage: React.FC = () => {
  return (
    <div className="space-y-12 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Header Banner */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl text-center space-y-4 shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <Badge variant="teal">Expert Medical Educators</Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">SAMS Academy Faculty Roster</h1>
        <p className="text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Our instructors are clinical specialists, gold medalists, and FCPS/USMLE high-scorers dedicated to simplifying complex basic sciences and clinical concepts.
        </p>
      </div>

      {/* Grid of Profile Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {MOCK_FACULTY.map((faculty) => (
          <Card key={faculty.id} className="p-6 border-slate-200 flex flex-col sm:flex-row gap-6 items-start hover:shadow-lg transition-all">
            <img
              src={faculty.photoUrl}
              alt={faculty.name}
              className="w-28 h-28 rounded-2xl object-cover border-2 border-[#0FA3A3] shrink-0 shadow-sm"
            />
            <div className="space-y-3 flex-1 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#0E2A47]">{faculty.name}</h3>
                  <div className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
                    <Star className="w-3.5 h-3.5 fill-amber-400" /> 4.9
                  </div>
                </div>
                <p className="text-xs font-semibold text-[#0FA3A3] mt-0.5">{faculty.title}</p>
                <p className="text-xs text-slate-600 leading-relaxed mt-2 line-clamp-3">{faculty.bio}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-[#0FA3A3]" /> Lead Instructor
                </span>
                <Link to={`/faculty/${faculty.id}`}>
                  <Button size="xs" variant="teal" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                    View Full Profile
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
