import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Play,
  FileQuestion,
  TrendingUp,
  Clock,
  BookOpen,
  Bell,
  ArrowRight,
  Flame,
  FileCheck2,
  Sparkles,
  Bookmark,
  AlertCircle,
} from "lucide-react";
import { Card, Button, StatCard, ProgressBar, Badge, EmptyState, Skeleton } from "../../components/ui";
import { studentApi } from "../../api/endpoints/student";
import { StudentDashboardStats } from "../../types";
import { useAuth } from "../../stores/authStore";
import { CourseCard } from "../../components/student/CourseCard";
import { splitEnrollmentsByStatus } from "../../utils/enrollments";

type LoadState = "loading" | "error" | "data";

export const StudentDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<StudentDashboardStats | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState("");

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMsg("");
    try {
      const data = await studentApi.getDashboardStats();
      setStats(data);
      setLoadState("data");
    } catch (err: any) {
      console.error("Failed to load student dashboard stats", err);
      setLoadErrorMsg(err?.message || "Failed to load your dashboard.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute time-appropriate greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const doctorName = user?.name || "Dr. Hamza Malik";

  if (loadState === "loading") {
    return (
      <div className="space-y-8 pb-12">
        <Skeleton variant="text" className="h-8 w-80" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton variant="card" className="h-28 rounded-2xl" />
          <Skeleton variant="card" className="h-28 rounded-2xl" />
          <Skeleton variant="card" className="h-28 rounded-2xl" />
          <Skeleton variant="card" className="h-28 rounded-2xl" />
        </div>
        <Skeleton variant="card" className="h-40 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton variant="card" className="h-56 rounded-2xl" />
          <Skeleton variant="card" className="h-56 rounded-2xl" />
          <Skeleton variant="card" className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (loadState === "error" || !stats) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<AlertCircle className="w-10 h-10 text-rose-500" />}
          title="Couldn't load your dashboard"
          description={loadErrorMsg || "Something went wrong loading your dashboard data."}
          actionLabel="Retry"
          onAction={loadData}
        />
      </div>
    );
  }

  // `GET /student/dashboard`'s `activeEnrollments` field deliberately
  // returns every enrollment for the user (active AND expired, same
  // contract as `GET /student/courses`) — this split keeps expired
  // subscriptions out of the "My Enrolled Courses" widget below. See
  // client/src/utils/enrollments.ts and DECISIONS.md's Phase 6.2-6.3 entry.
  const { active: activeEnrollments } = splitEnrollmentsByStatus(stats.activeEnrollments);
  const hasAnyEnrollments = stats.activeEnrollments.length > 0;

  return (
    <div className="space-y-8 pb-12">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">👋</span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0E2A47]">
              {getGreeting()}, {doctorName}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Welcome to your SAMS Academy portal. Continue your NRE Step 1 exam preparation.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="teal" size="md" className="py-1 px-3">
            <Sparkles className="w-3.5 h-3.5 mr-1" /> Candidate Portal Active
          </Badge>
        </div>
      </div>

      {/* 4 Stats Row — real values from GET /student/dashboard. QBank stats
          are a zeroed placeholder until Phase 7/8 populates real QBank
          attempt data server-side; rendered honestly as-is rather than
          papered over with fake fallback numbers. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Study Hours (This Week)"
          value={`${stats.studyHours7d} hrs`}
          change={`Total: ${stats.studyHoursTotal} hrs`}
          icon={<Clock className="w-5 h-5 text-indigo-600" />}
        />
        <StatCard
          title="QBank Accuracy"
          value={`${stats.qbankStats.correctPercent}%`}
          change={`${stats.qbankStats.totalAttempted} Questions Done`}
          changeType="positive"
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
        />
        <StatCard
          title="Active Day Streak"
          value={`${stats.qbankStats.activeStreakDays} Days`}
          change="Practice daily to build a streak"
          icon={<Flame className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          title="Tests Taken"
          value={`${stats.qbankStats.testsTakenCount ?? 0} Tests`}
          change="Custom Blocks & Mocks"
          icon={<FileCheck2 className="w-5 h-5 text-[#0FA3A3]" />}
        />
      </div>

      {/* Continue Learning Card */}
      {stats.continueWatching ? (
        <Card className="p-6 border-slate-200 space-y-4 shadow-sm bg-gradient-to-r from-slate-900 via-[#0E2A47] to-slate-900 text-white rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0FA3A3] animate-pulse"></span>
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#0FA3A3]">
                Continue Learning
              </h3>
            </div>
            <Badge variant="teal" size="sm">
              RESUME LECTURE
            </Badge>
          </div>

          <div className="flex flex-col md:flex-row gap-5 items-start md:items-center justify-between">
            <div className="space-y-2 flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-slate-300 block truncate">
                {stats.continueWatching.courseTitle}
              </span>
              <h4 className="text-base sm:text-lg font-bold text-white line-clamp-1">
                {stats.continueWatching.lecture.title}
              </h4>

              <div className="space-y-1 max-w-xl">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span>Watched {Math.round((stats.continueWatching.watchedSeconds / stats.continueWatching.durationSeconds) * 100)}%</span>
                  <span>
                    {Math.floor(stats.continueWatching.watchedSeconds / 60)}m / {Math.floor(stats.continueWatching.durationSeconds / 60)}m
                  </span>
                </div>
                <ProgressBar
                  progress={Math.round((stats.continueWatching.watchedSeconds / stats.continueWatching.durationSeconds) * 100)}
                  variant="teal"
                  size="md"
                />
              </div>
            </div>

            <Link to={`/app/learn/${stats.continueWatching.lecture.id}`} className="shrink-0 w-full md:w-auto">
              <Button size="lg" variant="teal" fullWidth icon={<Play className="w-4 h-4 fill-[#0E2A47]" />}>
                Resume Lecture
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        hasAnyEnrollments && (
          <Card className="p-5 border-dashed border-slate-300 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white text-[#0FA3A3] border border-slate-200 shrink-0">
                <Play className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0E2A47]">Nothing in progress yet</h3>
                <p className="text-xs text-slate-500">Open one of your enrolled courses below to start your first lecture.</p>
              </div>
            </div>
          </Card>
        )
      )}

      {/* My Courses Grid (Shows active + expiring-soon; expired subscriptions
          live on the My Courses page's dedicated "Expired" section) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#0E2A47]">My Enrolled Courses</h2>
            <p className="text-xs text-slate-500">Track validity days, remaining lectures, and progress.</p>
          </div>
          <Link to="/app/courses" className="text-xs font-bold text-[#0FA3A3] hover:underline flex items-center gap-1">
            View All Courses <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeEnrollments.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-10 h-10 text-slate-400" />}
            title="No Active Course Subscriptions Yet"
            description="Explore the SAMS Academy course catalog to enroll in NRE Step 1, SMLE, or MBBS preparation masterclasses."
            actionLabel="Browse Course Catalog"
            onAction={() => navigate("/courses")}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeEnrollments.map((enrollment) => (
              <CourseCard key={enrollment.id} enrollment={enrollment} />
            ))}
          </div>
        )}
      </div>

      {/* Announcements List & Recent Activity Feed Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
        {/* Latest Announcements */}
        <Card className="p-6 border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-[#0E2A47] flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#0FA3A3]" /> Latest Announcements
            </h3>
            <Badge variant="teal" size="sm">OFFICIAL FACULTY UPDATES</Badge>
          </div>

          {stats.announcements.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              No announcements yet — faculty updates will appear here.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.announcements.map((ann) => (
                <div key={ann.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 hover:border-[#0FA3A3]/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#0E2A47] line-clamp-1">{ann.title}</h4>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">
                      {new Date(ann.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{ann.body}</p>
                  {ann.createdBy && (
                    <div className="text-[10px] font-semibold text-slate-400 pt-1 flex items-center gap-1">
                      <span>Posted by: {ann.createdBy}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Activity Feed */}
        <Card className="p-6 border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-[#0E2A47] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0FA3A3]" /> Recent Activity Feed
            </h3>
            <span className="text-xs text-slate-400 font-medium">Last 7 Days</span>
          </div>

          {!stats.recentActivity || stats.recentActivity.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              No recent activity to show yet — your latest lectures, tests, and bookmarks will show up here.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentActivity.map((act) => (
                <div key={act.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    act.type === "lecture" ? "bg-teal-50 text-[#0FA3A3]" :
                    act.type === "test" ? "bg-emerald-50 text-emerald-600" :
                    act.type === "bookmark" ? "bg-amber-50 text-amber-600" : "bg-purple-50 text-purple-600"
                  }`}>
                    {act.type === "lecture" && <Play className="w-4 h-4" />}
                    {act.type === "test" && <FileQuestion className="w-4 h-4" />}
                    {act.type === "bookmark" && <Bookmark className="w-4 h-4" />}
                    {act.type === "streak" && <Flame className="w-4 h-4" />}
                  </div>

                  <div className="space-y-0.5 flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-[#0E2A47]">{act.title}</h4>
                    <p className="text-[11px] text-slate-500 truncate">{act.courseTitle}</p>
                    <span className="text-[10px] text-slate-400 font-medium">{act.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
