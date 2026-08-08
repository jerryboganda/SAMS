import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, RefreshCw, BookOpen } from "lucide-react";
import { Card, Input, Select, Badge, Button, EmptyState, Skeleton, CourseCard } from "../../components/ui";
import { coursesApi } from "../../api/endpoints/courses";
import { MOCK_COURSES } from "../../mock-data";
import { Course, ExamCategory } from "../../types";

export const CoursesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategory = searchParams.get("cat") || "ALL";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [sortBy, setSortBy] = useState<string>("featured");
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync category state if URL parameter changes
  useEffect(() => {
    const cat = searchParams.get("cat");
    if (cat) {
      setSelectedCategory(cat);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadCourses() {
      setIsLoading(true);
      try {
        const data = await coursesApi.getCourses();
        setCourses(data);
      } catch {
        setCourses(MOCK_COURSES);
      } finally {
        setIsLoading(false);
      }
    }
    loadCourses();
  }, []);

  const categories: { label: string; value: string }[] = [
    { label: "All Courses", value: "ALL" },
    { label: "NRE Step 1", value: "NRE1" },
    { label: "SMLE (Saudi)", value: "SMLE" },
    { label: "USMLE Step 1", value: "USMLE1" },
    { label: "DHA & Prometric", value: "DHA" },
    { label: "MBBS Sciences", value: "MBBS" },
  ];

  const handleCategorySelect = (val: string) => {
    setSelectedCategory(val);
    if (val === "ALL") {
      searchParams.delete("cat");
      setSearchParams(searchParams);
    } else {
      setSearchParams({ cat: val });
    }
  };

  const filteredAndSortedCourses = useMemo(() => {
    let result = [...courses];

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.shortDescription.toLowerCase().includes(q) ||
          c.examCategory.toLowerCase().includes(q)
      );
    }

    // Filter by Exam Category
    if (selectedCategory !== "ALL") {
      result = result.filter((c) => c.examCategory === selectedCategory);
    }

    // Sort Options
    if (sortBy === "price_asc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price_desc") {
      result.sort((a, b) => b.price - a.price);
    } else {
      result.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return result;
  }, [courses, searchQuery, selectedCategory, sortBy]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("ALL");
    setSortBy("featured");
    setSearchParams({});
  };

  return (
    <div className="space-y-10 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Header Banner */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl space-y-4 shadow-lg relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <Badge variant="teal">Official Exam Programs</Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Medical Licensing Course Catalog
        </h1>
        <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
          Explore high-yield video courses tailored for PMDC NRE Step 1, SMLE, DHA, and MBBS board exams. All packages include secure DRM video streaming and integrated QBank access.
        </p>
      </div>

      {/* Filter and Control Bar */}
      <Card className="p-4 sm:p-6 border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row items-center gap-4">
          {/* Search Box */}
          <div className="flex-1 w-full">
            <Input
              placeholder="Search courses by exam name, topic, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          {/* Sort Selector */}
          <div className="w-full lg:w-56">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { label: "Sort: Featured / Default", value: "featured" },
                { label: "Price: Low to High", value: "price_asc" },
                { label: "Price: High to Low", value: "price_desc" },
              ]}
            />
          </div>
        </div>

        {/* Category Chips Bar */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-[#0FA3A3]" /> Category:
          </span>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => handleCategorySelect(cat.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#0E2A47] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Showing <strong className="text-[#0E2A47] font-bold">{filteredAndSortedCourses.length}</strong> available course bundles
        </span>
        {(searchQuery || selectedCategory !== "ALL" || sortBy !== "featured") && (
          <button
            onClick={handleResetFilters}
            className="text-[#0FA3A3] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Clear Filters
          </button>
        )}
      </div>

      {/* Course Grid / Loading / Empty States */}
      {isLoading ? (
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
      ) : filteredAndSortedCourses.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <EmptyState
            icon={<BookOpen className="w-10 h-10 text-slate-400" />}
            title="No Courses Found"
            description="No medical preparation courses match your current search criteria or exam filter."
            actionText="Reset All Filters"
            onAction={handleResetFilters}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {filteredAndSortedCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
};
