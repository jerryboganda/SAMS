import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Award, BookOpen, Star, CheckCircle2, AlertTriangle, UserX } from "lucide-react";
import { Card, Badge, Button, Skeleton, EmptyState } from "../../components/ui";
import { publicApi } from "../../api/endpoints/public";
import { FacultyMember } from "../../types";

export const FacultyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // The backend only exposes a faculty LIST endpoint (GET /public/faculty) —
  // Phase 3.1 didn't add a per-faculty detail endpoint, and adding one is
  // out of scope for this frontend-only wiring pass (CLAUDE.md §1a). We
  // fetch the full roster and find the matching member client-side. Known
  // limitation: for a large faculty roster this is a heavier request than a
  // dedicated `/public/faculty/:id` route would be — acceptable at current
  // scale, flagged in DECISIONS.md as a candidate follow-up.
  const [allFaculty, setAllFaculty] = useState<FacultyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFaculty = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await publicApi.getFaculty();
      setAllFaculty(data);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load faculty profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFaculty();
  }, [loadFaculty]);

  const faculty = allFaculty.find((f) => String(f.id) === id);

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

      {isLoading && (
        <Card className="p-8 border-slate-200 bg-white shadow-md flex flex-col md:flex-row gap-8 items-center md:items-start">
          <Skeleton variant="circle" className="w-36 h-36 rounded-2xl shrink-0" />
          <div className="space-y-3 flex-1 w-full">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </Card>
      )}

      {!isLoading && loadError && (
        <Card className="p-12 text-center border-rose-200 bg-rose-50/40">
          <EmptyState
            icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
            title="Couldn't Load Faculty Profile"
            description={loadError}
            actionText="Try Again"
            onAction={loadFaculty}
          />
        </Card>
      )}

      {!isLoading && !loadError && !faculty && (
        <Card className="p-12 text-center border-slate-200">
          <EmptyState
            icon={<UserX className="w-10 h-10 text-slate-400" />}
            title="Faculty Member Not Found"
            description="This instructor profile doesn't exist or is no longer published."
            actionText="Back to Faculty Roster"
            onAction={() => navigate("/faculty")}
          />
        </Card>
      )}

      {!isLoading && !loadError && faculty && (
        <>
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
        </>
      )}
    </div>
  );
};
