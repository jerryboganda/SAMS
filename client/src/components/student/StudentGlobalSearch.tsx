import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  BookOpen,
  PlayCircle,
  FileQuestion,
  Award,
  ChevronRight,
  Clock,
  Sparkles,
  History,
  Tag,
  Stethoscope,
  Filter,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import {
  MOCK_COURSES,
  MOCK_SECTIONS,
  MOCK_SUBJECTS,
  MOCK_SYSTEMS,
  MOCK_QUESTIONS,
} from "../../mock-data";
import { Course, Lecture, Question, Subject, BodySystem, MockExam } from "../../types";
import { Badge } from "../ui";

// Popular search suggestion chips
const POPULAR_SUGGESTIONS = [
  "Myocardial Infarction",
  "Pathology",
  "Cardiovascular System",
  "Pharmacology",
  "Thiamine B1",
  "NRE Step 1",
  "SMLE Crash Course",
  "Respiratory System",
  "Ulcerative Colitis",
  "ECG Findings",
];

const MOCK_EXAMS_LIST: MockExam[] = [
  {
    id: 1,
    title: "NRE Step 1 National Comprehensive Grand Mock Exam 2026",
    examCategory: "NRE1",
    durationMinutes: 60,
    passPercent: 60,
    questionsCount: 50,
    isPublished: true,
    bestScore: 78,
    attemptsCount: 2,
  },
  {
    id: 2,
    title: "USMLE Step 1 Comprehensive Basic Sciences Simulation",
    examCategory: "USMLE1",
    durationMinutes: 60,
    passPercent: 65,
    questionsCount: 50,
    isPublished: true,
    bestScore: 72,
    attemptsCount: 1,
  },
  {
    id: 3,
    title: "SMLE Saudi Medical Licensing Grand Trial Paper",
    examCategory: "SMLE",
    durationMinutes: 45,
    passPercent: 60,
    questionsCount: 40,
    isPublished: true,
    bestScore: 0,
    attemptsCount: 0,
  },
];

type SearchCategory = "all" | "courses" | "lessons" | "qbank" | "questions" | "mock_exams";

interface CourseSearchResult {
  type: "course";
  id: number;
  title: string;
  subtitle: string;
  category: string;
  price: number;
  path: string;
  data: Course;
}

interface LectureSearchResult {
  type: "lecture";
  id: number;
  title: string;
  subtitle: string;
  courseTitle: string;
  sectionTitle: string;
  durationMinutes: number;
  isFreePreview: boolean;
  path: string;
  data: Lecture;
}

interface QBankTopicSearchResult {
  type: "qbank_topic";
  id: number;
  title: string;
  kind: "subject" | "system";
  questionsCount: number;
  path: string;
}

interface QuestionSearchResult {
  type: "question";
  id: number;
  title: string;
  explanation: string;
  subjectName: string;
  systemName: string;
  difficulty: "easy" | "medium" | "hard";
  path: string;
  data: Question;
}

interface MockExamSearchResult {
  type: "mock_exam";
  id: number;
  title: string;
  category: string;
  durationMinutes: number;
  questionsCount: number;
  path: string;
  data: MockExam;
}

type SearchItem =
  | CourseSearchResult
  | LectureSearchResult
  | QBankTopicSearchResult
  | QuestionSearchResult
  | MockExamSearchResult;

export const StudentGlobalSearch: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sams_recent_searches");
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Keyboard shortcut (⌘K or Ctrl+K) handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const saveRecentSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    const cleaned = searchTerm.trim();
    const updated = [cleaned, ...recentSearches.filter((s) => s.toLowerCase() !== cleaned.toLowerCase())].slice(0, 5);
    setRecentSearches(updated);
    try {
      localStorage.setItem("sams_recent_searches", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const clearRecentSearches = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem("sams_recent_searches");
    } catch {
      // ignore
    }
  };

  // Compile Index & Filter Results
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: SearchItem[] = [];

    // 1. Search Courses
    MOCK_COURSES.forEach((c) => {
      if (
        c.title.toLowerCase().includes(q) ||
        c.shortDescription.toLowerCase().includes(q) ||
        c.examCategory.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      ) {
        results.push({
          type: "course",
          id: c.id,
          title: c.title,
          subtitle: c.shortDescription,
          category: c.examCategory,
          price: c.price,
          path: `/app/courses/${c.id}`,
          data: c,
        });
      }
    });

    // 2. Search Lessons & Lectures across all sections
    MOCK_SECTIONS.forEach((section) => {
      const course = MOCK_COURSES.find((c) => c.id === section.courseId);
      section.lectures?.forEach((lec) => {
        if (
          lec.title.toLowerCase().includes(q) ||
          (lec.description && lec.description.toLowerCase().includes(q)) ||
          section.title.toLowerCase().includes(q)
        ) {
          results.push({
            type: "lecture",
            id: lec.id,
            title: lec.title,
            subtitle: lec.description || "Video lecture module",
            courseTitle: course?.title || "Course",
            sectionTitle: section.title,
            durationMinutes: Math.round(lec.durationSeconds / 60),
            isFreePreview: lec.isFreePreview,
            path: `/app/courses/${lec.courseId}/player?lectureId=${lec.id}`,
            data: lec,
          });
        }
      });
    });

    // 3. Search QBank Subjects & Systems
    MOCK_SUBJECTS.forEach((subj) => {
      if (subj.name.toLowerCase().includes(q)) {
        results.push({
          type: "qbank_topic",
          id: subj.id,
          title: subj.name,
          kind: "subject",
          questionsCount: subj.questionsCount,
          path: `/app/qbank/new?subjectId=${subj.id}`,
        });
      }
    });

    MOCK_SYSTEMS.forEach((sys) => {
      if (sys.name.toLowerCase().includes(q)) {
        results.push({
          type: "qbank_topic",
          id: sys.id + 1000,
          title: sys.name,
          kind: "system",
          questionsCount: sys.questionsCount,
          path: `/app/qbank/new?systemId=${sys.id}`,
        });
      }
    });

    // 4. Search QBank Questions / Vignettes
    MOCK_QUESTIONS.forEach((quest) => {
      if (
        quest.stem.toLowerCase().includes(q) ||
        quest.explanation.toLowerCase().includes(q) ||
        (quest.referenceText && quest.referenceText.toLowerCase().includes(q)) ||
        quest.subjectName.toLowerCase().includes(q) ||
        quest.systemName.toLowerCase().includes(q)
      ) {
        results.push({
          type: "question",
          id: quest.id,
          title: quest.stem,
          explanation: quest.explanation,
          subjectName: quest.subjectName,
          systemName: quest.systemName,
          difficulty: quest.difficulty,
          path: `/app/qbank/new`,
          data: quest,
        });
      }
    });

    // 5. Search Mock Exams
    MOCK_EXAMS_LIST.forEach((exam) => {
      if (
        exam.title.toLowerCase().includes(q) ||
        exam.examCategory.toLowerCase().includes(q)
      ) {
        results.push({
          type: "mock_exam",
          id: exam.id,
          title: exam.title,
          category: exam.examCategory,
          durationMinutes: exam.durationMinutes,
          questionsCount: exam.questionsCount,
          path: `/app/mock-exams`,
          data: exam,
        });
      }
    });

    return results;
  }, [query]);

  // Filtered by selected category tab
  const filteredResults = useMemo(() => {
    if (selectedCategory === "all") return searchResults;
    if (selectedCategory === "courses") return searchResults.filter((r) => r.type === "course");
    if (selectedCategory === "lessons") return searchResults.filter((r) => r.type === "lecture");
    if (selectedCategory === "qbank") return searchResults.filter((r) => r.type === "qbank_topic");
    if (selectedCategory === "questions") return searchResults.filter((r) => r.type === "question");
    if (selectedCategory === "mock_exams") return searchResults.filter((r) => r.type === "mock_exam");
    return searchResults;
  }, [searchResults, selectedCategory]);

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: searchResults.length,
      courses: searchResults.filter((r) => r.type === "course").length,
      lessons: searchResults.filter((r) => r.type === "lecture").length,
      qbank: searchResults.filter((r) => r.type === "qbank_topic").length,
      questions: searchResults.filter((r) => r.type === "question").length,
      mock_exams: searchResults.filter((r) => r.type === "mock_exam").length,
    };
  }, [searchResults]);

  // Reset keyboard index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, selectedCategory]);

  const handleSelectResult = (item: SearchItem) => {
    saveRecentSearch(query || item.title);
    setIsOpen(false);
    navigate(item.path);
  };

  const handleKeyDownInInput = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredResults.length - 1));
    } else if (e.key === "Enter" && filteredResults[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(filteredResults[selectedIndex]);
    }
  };

  const highlightMatch = (text: string, search: string) => {
    if (!search.trim()) return text;
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-teal-100 text-[#0E2A47] font-bold rounded-xs px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <>
      {/* Search Input Trigger in Top Header */}
      <div className="relative flex items-center">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 bg-slate-100 hover:bg-slate-100/80 border border-slate-200/80 hover:border-slate-300 px-3 py-1.5 rounded-xl text-xs text-slate-500 w-44 sm:w-64 md:w-80 transition-all text-left group focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
        >
          <Search className="w-4 h-4 text-slate-400 group-hover:text-[#0FA3A3] transition-colors shrink-0" />
          <span className="truncate text-slate-500 font-medium">
            Search lectures, QBank, topics...
          </span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-auto px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Global Search Modal / Command Palette */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16 px-3 sm:px-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Search Bar Input Area */}
            <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/70">
              <Search className="w-5 h-5 text-[#0FA3A3] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDownInInput}
                placeholder="Search lectures, courses, QBank topics, systems, or questions..."
                className="w-full bg-transparent text-sm sm:text-base font-semibold text-[#0E2A47] placeholder-slate-400 focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="hidden sm:flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 shadow-2xs"
              >
                ESC
              </button>
            </div>

            {/* Category Navigation Filter Tabs (Shown when query is typed) */}
            {query.trim() && (
              <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto text-xs scrollbar-none">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedCategory === "all"
                      ? "bg-[#0E2A47] text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>All</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-white/20 text-white">
                    {counts.all}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedCategory("courses")}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedCategory === "courses"
                      ? "bg-[#0E2A47] text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#0FA3A3]" />
                  <span>Courses</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-200 text-slate-700">
                    {counts.courses}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedCategory("lessons")}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedCategory === "lessons"
                      ? "bg-[#0E2A47] text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <PlayCircle className="w-3.5 h-3.5 text-blue-500" />
                  <span>Lectures</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-200 text-slate-700">
                    {counts.lessons}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedCategory("qbank")}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedCategory === "qbank"
                      ? "bg-[#0E2A47] text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Stethoscope className="w-3.5 h-3.5 text-purple-500" />
                  <span>QBank Topics</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-200 text-slate-700">
                    {counts.qbank}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedCategory("questions")}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedCategory === "questions"
                      ? "bg-[#0E2A47] text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <FileQuestion className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Questions</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-200 text-slate-700">
                    {counts.questions}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedCategory("mock_exams")}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedCategory === "mock_exams"
                      ? "bg-[#0E2A47] text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Mock Exams</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-200 text-slate-700">
                    {counts.mock_exams}
                  </span>
                </button>
              </div>
            )}

            {/* Main Content Body */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 divide-y divide-slate-100">
              {/* State A: Empty search query state (Show Popular & Recent Searches) */}
              {!query.trim() && (
                <div className="space-y-5 py-2">
                  {/* Recent Searches */}
                  {recentSearches.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-slate-400" />
                          Recent Searches
                        </span>
                        <button
                          onClick={clearRecentSearches}
                          className="text-[11px] text-slate-400 hover:text-red-500 font-semibold normal-case"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {recentSearches.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => setQuery(item)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors"
                          >
                            <History className="w-3 h-3 text-slate-400" />
                            <span>{item}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Popular Topics & Suggested Keywords */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-[#0FA3A3]" />
                      High-Yield Topics & Popular Keywords
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {POPULAR_SUGGESTIONS.map((topic, idx) => (
                        <button
                          key={idx}
                          onClick={() => setQuery(topic)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-[#0FA3A3] bg-white hover:bg-teal-50/50 text-xs font-semibold text-[#0E2A47] transition-all shadow-2xs"
                        >
                          <Tag className="w-3 h-3 text-[#0FA3A3]" />
                          <span>{topic}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Browse Categories Quick Grid */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                      Quick Portal Shortcuts
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate("/app/courses");
                        }}
                        className="p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 text-left transition-all group"
                      >
                        <BookOpen className="w-5 h-5 text-[#0FA3A3] mb-1.5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold text-[#0E2A47] block">My Courses</span>
                        <span className="text-[10px] text-slate-600 font-medium">3 Masterclasses</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate("/app/qbank");
                        }}
                        className="p-3 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/30 text-left transition-all group"
                      >
                        <Stethoscope className="w-5 h-5 text-purple-600 mb-1.5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold text-[#0E2A47] block">QBank Practice</span>
                        <span className="text-[10px] text-slate-600 font-medium">60+ Vignettes</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate("/app/mock-exams");
                        }}
                        className="p-3 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/30 text-left transition-all group"
                      >
                        <Award className="w-5 h-5 text-amber-600 mb-1.5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold text-[#0E2A47] block">Mock Exams</span>
                        <span className="text-[10px] text-slate-600 font-medium">Full Simulations</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate("/app/analytics");
                        }}
                        className="p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 text-left transition-all group"
                      >
                        <Filter className="w-5 h-5 text-blue-600 mb-1.5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold text-[#0E2A47] block">Analytics</span>
                        <span className="text-[10px] text-slate-600 font-medium">Subject Scores</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* State B: Query Typed, but No Results Found */}
              {query.trim() && filteredResults.length === 0 && (
                <div className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Search className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-[#0E2A47]">
                    No matching results found for "{query}"
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Try checking for typos or searching with alternative medical keywords like "Pathology", "Cardiovascular", "NRE Step 1", or "Pharmacology".
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={() => setQuery("")}
                      className="px-3 py-1.5 text-xs font-bold text-[#0FA3A3] bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                    >
                      Clear Search Query
                    </button>
                  </div>
                </div>
              )}

              {/* State C: Search Results Display List */}
              {query.trim() && filteredResults.length > 0 && (
                <div className="space-y-2 pt-2">
                  {filteredResults.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleSelectResult(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`p-3 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? "bg-teal-50/70 border-[#0FA3A3] shadow-xs"
                            : "bg-white hover:bg-slate-50 border-slate-100"
                        }`}
                      >
                        {/* Course Card Result */}
                        {item.type === "course" && (
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-lg bg-[#0E2A47] text-[#0FA3A3] shrink-0 mt-0.5">
                              <BookOpen className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="navy" size="sm">
                                  {item.category} Course
                                </Badge>
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  PKR {item.price.toLocaleString()}
                                </span>
                              </div>
                              <h5 className="text-xs sm:text-sm font-bold text-[#0E2A47] truncate">
                                {highlightMatch(item.title, query)}
                              </h5>
                              <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                                {highlightMatch(item.subtitle, query)}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                          </div>
                        )}

                        {/* Lecture / Video Lesson Card Result */}
                        {item.type === "lecture" && (
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                              <PlayCircle className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                                  Video Lecture
                                </span>
                                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                                  <Clock className="w-3 h-3" /> {item.durationMinutes} mins
                                </span>
                                {item.isFreePreview && (
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-xs">
                                    Free Preview
                                  </span>
                                )}
                              </div>
                              <h5 className="text-xs sm:text-sm font-bold text-[#0E2A47]">
                                {highlightMatch(item.title, query)}
                              </h5>
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {highlightMatch(item.subtitle, query)}
                              </p>
                              <div className="text-[10px] font-semibold text-slate-600 mt-1 flex items-center gap-1.5">
                                <span>{item.courseTitle}</span>
                                <span>•</span>
                                <span className="truncate">{item.sectionTitle}</span>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                          </div>
                        )}

                        {/* QBank Topic / System Result */}
                        {item.type === "qbank_topic" && (
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                              <Stethoscope className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge variant="indigo" size="sm">
                                  QBank {item.kind === "subject" ? "Subject" : "Body System"}
                                </Badge>
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {item.questionsCount} High-Yield Questions
                                </span>
                              </div>
                              <h5 className="text-xs sm:text-sm font-bold text-[#0E2A47]">
                                {highlightMatch(item.title, query)}
                              </h5>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          </div>
                        )}

                        {/* Question Vignette Result */}
                        {item.type === "question" && (
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0 mt-0.5">
                              <FileQuestion className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                  Vignette #{item.id}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-600">
                                  {item.subjectName} • {item.systemName}
                                </span>
                                <span
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-xs ${
                                    item.difficulty === "easy"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : item.difficulty === "medium"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {item.difficulty}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-[#0E2A47] line-clamp-2">
                                {highlightMatch(item.title, query)}
                              </p>
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-1 italic">
                                High-Yield: {highlightMatch(item.explanation, query)}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                          </div>
                        )}

                        {/* Mock Exam Result */}
                        {item.type === "mock_exam" && (
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0 mt-0.5">
                              <Award className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="warning" size="sm">
                                  {item.category} Mock Exam
                                </Badge>
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {item.questionsCount} Qs • {item.durationMinutes} mins
                                </span>
                              </div>
                              <h5 className="text-xs sm:text-sm font-bold text-[#0E2A47]">
                                {highlightMatch(item.title, query)}
                              </h5>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Keyboard Shortcut & Result Summary Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-semibold text-slate-600 shadow-2xs">
                    ↑
                  </kbd>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-semibold text-slate-600 shadow-2xs">
                    ↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-semibold text-slate-600 shadow-2xs">
                    ↵
                  </kbd>
                  <span>Select</span>
                </span>
              </div>
              <div className="text-slate-400">
                {query.trim() ? (
                  <span>
                    Showing {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span>Press ESC to close</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
