import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Video,
  FileQuestion,
  TrendingUp,
  Award,
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Star,
  Quote,
  Activity,
  ChevronRight,
  Clock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button, Card, Badge, CourseCard, Skeleton, EmptyState } from "../../components/ui";
import { publicApi, HomeData } from "../../api/endpoints/public";

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await publicApi.getHomeData();
      setHomeData(data);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load homepage content. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  // Testimonials seed data
  const testimonials = [
    {
      id: 1,
      name: "Dr. Usama Tanveer",
      exam: "Cleared NRE Step 1 — Score 78%",
      quote: "I was honestly dreading NRE Step 1 after hearing how unpredictable the vignettes can be. Going through the QBank daily and reviewing my wrong answers every night made the actual exam feel familiar instead of scary. Passed on my first try.",
      avatar: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=200&h=200&q=80",
    },
    {
      id: 2,
      name: "Dr. Fatima Zahra",
      exam: "Passed SMLE — Riyadh",
      quote: "What helped me most was how the lectures were split system by system instead of one giant playlist. I could tell exactly where I was weak just by looking at my scores, so revision stopped feeling random and started feeling targeted.",
      avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&h=200&q=80",
    },
    {
      id: 3,
      name: "Dr. Bilal Hassan",
      exam: "NRE Step 1 — In Progress",
      quote: "The Exam Mode timer genuinely changed how I study. I used to know the material but freeze under time pressure during practice tests. After a few weeks of timed mocks, that panic just went away.",
      avatar: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=200&h=200&q=80",
    },
    {
      id: 4,
      name: "Dr. Ayesha Raza",
      exam: "Cleared DHA — Dubai",
      quote: "I was studying while working full-time, so I needed something I could pick up in 20-minute chunks between shifts. Being able to resume a lecture exactly where I left off, and jump straight into a quick QBank set, made that actually workable.",
      avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&h=200&q=80",
    },
    {
      id: 5,
      name: "Dr. Hamza Sheikh",
      exam: "Passed USMLE Step 1",
      quote: "My biggest issue was Pharmacology — I kept mixing up drug classes under time pressure. The bookmark feature let me build my own \"weak topics\" test out of every question I'd previously flagged, and I redid that set until it stopped being a weak topic.",
      avatar: "https://images.unsplash.com/photo-1618498082410-b4aa22193b38?auto=format&fit=crop&w=200&h=200&q=80",
    },
  ];

  // Auto-rotating testimonial slider — groups of up to 3 cards per slide
  // (same layout as the old static grid), advances one slide every 3s, loops.
  const TESTIMONIALS_PER_SLIDE = 3;
  const testimonialSlides: (typeof testimonials)[number][][] = [];
  for (let i = 0; i < testimonials.length; i += TESTIMONIALS_PER_SLIDE) {
    testimonialSlides.push(testimonials.slice(i, i + TESTIMONIALS_PER_SLIDE));
  }

  const [activeTestimonialSlide, setActiveTestimonialSlide] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonialSlide((prev) => (prev + 1) % testimonialSlides.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [testimonialSlides.length]);

  return (
    <div className="space-y-16 pb-16">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-[#0E2A47] text-white pt-14 pb-20 px-4 sm:px-8 lg:px-12 rounded-b-3xl max-w-7xl mx-auto shadow-xl">
        {/* Subtle Background Pattern & Medical Glow Accent */}
        <div className="absolute inset-0 bg-[radial-gradient(#0FA3A3_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#0FA3A3]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0FA3A3]/20 border border-[#0FA3A3]/40 text-[#0FA3A3] text-xs font-semibold backdrop-blur-md">
            <Sparkles className="w-4 h-4" />
            <span>Pakistan & Gulf Premier Medical Exam Portal</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-white">
            Master Your <span className="text-[#0FA3A3]">Medical Licensing</span> Exams
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
            High-yield video courses, PMDC NRE Step 1 & Gulf licensing exam-style QBank, and expert faculty guidance designed for doctors across Pakistan and the Middle East.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              variant="teal"
              onClick={() => navigate("/courses")}
              rightIcon={<ArrowRight className="w-5 h-5" />}
              className="w-full sm:w-auto shadow-lg shadow-[#0FA3A3]/20"
            >
              Browse Courses
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/qbank")}
              className="w-full sm:w-auto text-white border-slate-600 hover:bg-white/10 hover:border-white"
            >
              Try Free QBank Demo
            </Button>
          </div>

          {/* Feature Highlights Pills */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-300 border-t border-slate-800/80 max-w-3xl mx-auto">
            <span className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 text-[#0FA3A3]" /> 100% Secure DRM Video
            </span>
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#0FA3A3]" /> 3,000+ Vignette MCQs
            </span>
            <span className="flex items-center gap-2 font-medium">
              <Activity className="w-4 h-4 text-[#0FA3A3]" /> Real-time Analytics
            </span>
            <span className="flex items-center gap-2 font-medium">
              <Award className="w-4 h-4 text-[#0FA3A3]" /> 2-Device Policy Security
            </span>
          </div>
        </div>
      </section>

      {/* TRUST STATS STRIP / FEATURED COURSES — single data fetch (GET /public/home) */}
      {isLoading ? (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 text-center">
                <Skeleton className="h-8 w-20 mx-auto" />
                <Skeleton className="h-3 w-24 mx-auto" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4 space-y-4">
                <Skeleton className="w-full aspect-video rounded-xl" />
                <Skeleton className="h-6 w-3/4 rounded-md" />
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </Card>
            ))}
          </div>
        </section>
      ) : loadError ? (
        <section className="max-w-7xl mx-auto px-4 sm:px-6">
          <Card className="p-10 text-center border-rose-200 bg-rose-50/40">
            <EmptyState
              icon={<AlertTriangle className="w-10 h-10 text-rose-500" />}
              title="Couldn't Load Homepage Content"
              description={loadError}
              actionText="Try Again"
              onAction={loadHome}
            />
          </Card>
        </section>
      ) : (
        <>
          {/* TRUST STATS STRIP */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center divide-y md:divide-y-0 md:divide-x divide-slate-100">
              <div className="space-y-1 pt-3 md:pt-0">
                <p className="text-3xl sm:text-4xl font-extrabold text-[#0E2A47]">{homeData!.stats.coursesCount}+</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Courses Available</p>
              </div>
              <div className="space-y-1 pt-3 md:pt-0">
                <p className="text-3xl sm:text-4xl font-extrabold text-[#0FA3A3]">
                  {homeData!.stats.questionsCount.toLocaleString()}+
                </p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">High-Yield Questions</p>
              </div>
              <div className="space-y-1 pt-3 md:pt-0">
                <p className="text-3xl sm:text-4xl font-extrabold text-emerald-600">{homeData!.stats.facultyCount}</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Expert Faculty</p>
              </div>
              <div className="space-y-1 pt-3 md:pt-0">
                <p className="text-3xl sm:text-4xl font-extrabold text-[#0E2A47]">
                  {homeData!.stats.videoLecturesCount}
                </p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">HD Video Lectures</p>
              </div>
            </div>
          </section>

          {/* FEATURED COURSES GRID */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <Badge variant="teal" className="mb-2">Targeted Programs</Badge>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0E2A47]">Featured Course Bundles</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Comprehensive prep packages for NRE Step 1, SMLE, DHA, and MBBS board exams.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate("/courses")} rightIcon={<ChevronRight className="w-4 h-4" />}>
                View All Catalog
              </Button>
            </div>

            {homeData!.featuredCourses.length === 0 ? (
              <EmptyState
                icon={<RefreshCw className="w-10 h-10 text-slate-400" />}
                title="No Courses Published Yet"
                description="Check back soon — new medical licensing exam prep bundles are on the way."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {homeData!.featuredCourses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* "WHY SAMS" 4-FEATURE GRID */}
      <section className="bg-white py-16 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Badge variant="navy">Platform Excellence</Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0E2A47]">Why Choose SAMS Academy?</h2>
            <p className="text-sm text-slate-600">
              Engineered specifically to solve the preparation challenges of Pakistani and Gulf medical graduates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature 1 */}
            <Card className="p-6 border-slate-200 space-y-4 hover:border-[#0FA3A3]/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#0E2A47] text-[#0FA3A3] flex items-center justify-center shadow-md">
                <Video className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0E2A47]">Secure HD Video</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                100% DRM-protected adaptive HLS video streaming with dynamic student watermark protection and seamless single-device security.
              </p>
            </Card>

            {/* Feature 2 */}
            <Card className="p-6 border-slate-200 space-y-4 hover:border-[#0FA3A3]/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#0FA3A3] text-white flex items-center justify-center shadow-md">
                <FileQuestion className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0E2A47]">Exam-Style QBank</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                3,000+ single-best-answer clinical vignettes with step-by-step explanations, references, and customizable Practice & Exam modes.
              </p>
            </Card>

            {/* Feature 3 */}
            <Card className="p-6 border-slate-200 space-y-4 hover:border-[#0FA3A3]/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#0E2A47] text-[#0FA3A3] flex items-center justify-center shadow-md">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0E2A47]">Performance Analytics</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Detailed subject and body-system performance breakdown tracking your exact strengths, weak topics, and average time per question.
              </p>
            </Card>

            {/* Feature 4 */}
            <Card className="p-6 border-slate-200 space-y-4 hover:border-[#0FA3A3]/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#0FA3A3] text-white flex items-center justify-center shadow-md">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0E2A47]">Expert Faculty</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Instructed by gold-medalist doctors and FCPS / USMLE high-scoring specialists with years of medical licensing coaching experience.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* FACULTY PREVIEW ROW */}
      {!isLoading && !loadError && homeData && homeData.faculty.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <Badge variant="navy" className="mb-2">Lead Instructors</Badge>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0E2A47]">Learn From Medical Specialists</h2>
              <p className="text-sm text-slate-600 mt-1">
                Top faculty guiding you through high-yield concepts and clinical exam strategy.
              </p>
            </div>
            <Button variant="ghost" onClick={() => navigate("/faculty")} rightIcon={<ChevronRight className="w-4 h-4" />}>
              Meet All Faculty
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {homeData.faculty.map((f) => (
              <Card key={f.id} className="p-5 text-center space-y-3 border-slate-200 hover:shadow-md transition-shadow">
                <img
                  src={f.photoUrl}
                  alt={f.name}
                  className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-[#0FA3A3] shadow-xs"
                />
                <div>
                  <h3 className="text-base font-bold text-[#0E2A47]">{f.name}</h3>
                  <p className="text-xs font-medium text-[#0FA3A3] mt-0.5">{f.title}</p>
                </div>
                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{f.bio}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* TESTIMONIALS CAROUSEL / GRID */}
      <section className="bg-[#0E2A47] text-white py-16 px-4 sm:px-6 rounded-3xl max-w-7xl mx-auto space-y-10 shadow-xl">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <Badge variant="teal">Student Success</Badge>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Loved By Doctors Across Pakistan & Gulf</h2>
          <p className="text-sm text-slate-300">Read what successful candidates say about preparing with SAMS Academy.</p>
        </div>

        {/* Sliding track — up to 3 testimonials per slide, auto-advances every 3s */}
        <div className="relative overflow-hidden">
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{ transform: `translateX(-${activeTestimonialSlide * 100}%)` }}
          >
            {testimonialSlides.map((slide, slideIndex) => (
              <div key={slideIndex} className="w-full flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-6 px-1">
                {slide.map((t) => (
                  <Card key={t.id} className="bg-[#0B1A2C] border-slate-700/80 text-white p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <Quote className="w-8 h-8 text-[#0FA3A3] opacity-80" />
                      <p className="text-xs text-slate-100 leading-relaxed italic font-normal">"{t.quote}"</p>
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                      <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-[#0FA3A3]" />
                      <div>
                        <h4 className="text-sm font-bold text-white">{t.name}</h4>
                        <p className="text-[11px] text-[#0FA3A3] font-medium">{t.exam}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Dot pagination — one dot per slide, click to jump, mirrors the auto-rotation */}
        {testimonialSlides.length > 1 && (
          <div className="flex items-center justify-center gap-2">
            {testimonialSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTestimonialSlide(i)}
                aria-label={`Show testimonial slide ${i + 1}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  i === activeTestimonialSlide ? "w-6 bg-[#0FA3A3]" : "w-2 bg-slate-600 hover:bg-slate-500"
                }`}
              />
            ))}
          </div>
        )}
      </section>

      {/* FINAL CTA BAND */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-gradient-to-r from-[#0E2A47] via-[#0E2A47] to-[#0FA3A3] text-white rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(white_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

          <div className="max-w-2xl mx-auto space-y-3 relative z-10">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Ready to Pass Your Medical Licensing Exam?
            </h2>
            <p className="text-sm sm:text-base text-slate-200 font-normal">
              Join thousands of medical students and doctors preparing with SAMS Academy today. Instant activation via JazzCash, EasyPaisa & Raast.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10 pt-2">
            <Button size="lg" variant="teal" onClick={() => navigate("/register")}>
              Create Free Account
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/courses")}
              className="text-white border-white/40 hover:bg-white/10"
            >
              Explore Course Catalog
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
