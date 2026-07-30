import React from "react";
import { Link } from "react-router-dom";
import { Play, FileQuestion, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, Button, Badge } from "../../components/ui";
import { MOCK_COURSES, MOCK_SECTIONS } from "../../mock-data";

export const FreeTrialPage: React.FC = () => {
  const freePreviewLectures = MOCK_SECTIONS.flatMap((sec) => sec.lectures || []).filter((lec) => lec.isFreePreview);

  return (
    <div className="space-y-10 pb-16 max-w-5xl mx-auto">
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl text-center space-y-4">
        <Badge variant="teal">Free Trial Mode</Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Experience SAMS Academy Free</h1>
        <p className="text-sm text-slate-300 max-w-2xl mx-auto">
          Preview our flagship NRE Step 1 lectures and try sample QBank questions with instant explanations.
        </p>
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-bold text-[#0E2A47]">Free Preview Lectures</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {freePreviewLectures.map((lec) => (
            <Card key={lec.id} className="p-6 border-slate-200 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="teal" size="sm">FREE PREVIEW</Badge>
                  <span className="text-xs text-slate-500 font-medium">Cardiovascular System</span>
                </div>
                <h4 className="text-base font-bold text-[#0E2A47]">{lec.title}</h4>
                <p className="text-xs text-slate-600 mt-1">{lec.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">{Math.round((lec.durationSeconds || 1800) / 60)} Minutes</span>
                <Link to="/app/courses/1/player">
                  <Button size="sm" variant="teal" icon={<Play className="w-4 h-4" />}>
                    Watch Free Lecture
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
