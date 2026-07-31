import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, BookOpen, Star, ArrowRight, AlertTriangle, Users } from "lucide-react";
import { Card, Badge, Button, Skeleton, EmptyState } from "../../components/ui";
import { publicApi } from "../../api/endpoints/public";
import { FacultyMember } from "../../types";

export const FacultyPage: React.FC = () => {
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFaculty = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await publicApi.getFaculty();
      setFaculty(data);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load faculty roster. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFaculty();
  }, [loadFaculty]);

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

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-6 border-slate-200 flex flex-col sm:flex-row gap-6 items-start">
              <Skeleton variant="circle" className="w-28 h-28 rounded-2xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && loadError && (
        <Card className="p-12 text-center border-rose-200 bg-rose-50/40">
          <EmptyState
            icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
            title="Couldn't Load Faculty"
            description={loadError}
            actionText="Try Again"
            onAction={loadFaculty}
          />
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !loadError && faculty.length === 0 && (
        <Card className="p-12 text-center border-slate-200">
          <EmptyState
            icon={<Users className="w-10 h-10 text-slate-400" />}
            title="No Faculty Profiles Published Yet"
            description="Check back soon — our instructor roster is being finalized."
          />
        </Card>
      )}

      {/* Grid of Profile Cards */}
      {!isLoading && !loadError && faculty.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {faculty.map((member) => (
          <Card key={member.id} className="p-6 border-slate-200 flex flex-col sm:flex-row gap-6 items-start hover:shadow-lg transition-all">
            <img
              src={member.photoUrl}
              alt={member.name}
              className="w-28 h-28 rounded-2xl object-cover border-2 border-[#0FA3A3] shrink-0 shadow-sm"
            />
            <div className="space-y-3 flex-1 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#0E2A47]">{member.name}</h3>
                  <div className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
                    <Star className="w-3.5 h-3.5 fill-amber-400" /> 4.9
                  </div>
                </div>
                <p className="text-xs font-semibold text-[#0FA3A3] mt-0.5">{member.title}</p>
                <p className="text-xs text-slate-600 leading-relaxed mt-2 line-clamp-3">{member.bio}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-[#0FA3A3]" /> Lead Instructor
                </span>
                <Link to={`/faculty/${member.id}`}>
                  <Button size="xs" variant="teal" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                    View Full Profile
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
};
