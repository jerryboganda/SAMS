import React from "react";
import { Link } from "react-router-dom";
import { Star, Clock, BookOpen, ArrowRight, ShieldCheck } from "lucide-react";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Course } from "../../types";
import { formatPKR } from "../../utils/formatters";

interface CourseCardProps {
  course: Course;
  rating?: number;
  reviewsCount?: number;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  rating = 4.9,
  reviewsCount = 124,
}) => {
  // Generate initials for thumbnail fallback
  const initials = course.title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const courseLink = `/courses/${course.slug || course.id}`;

  return (
    <Card hover className="flex flex-col h-full border-slate-200 overflow-hidden group">
      {/* Thumbnail Area */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[#0E2A47] via-slate-800 to-[#0FA3A3]/80">
        {course.thumbnailUrl ? (
          <img
            src={course.thumbnailUrl}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              // Hide broken image to show gradient placeholder
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        ) : null}

        {/* Fallback Initials Display */}
        <div className="absolute inset-0 flex items-center justify-center text-white/20 font-black text-4xl select-none pointer-events-none">
          {initials}
        </div>

        {/* Exam Category Badge Top Left */}
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge variant="teal" size="sm" className="shadow-md">
            {course.examCategory}
          </Badge>
          {course.includesQBank && (
            <Badge variant="navy" size="sm" className="bg-[#0E2A47]/90 text-white backdrop-blur-xs">
              QBank Included
            </Badge>
          )}
        </div>
      </div>

      {/* Card Content Body */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          {/* Rating and Validity */}
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <div className="flex items-center gap-1 text-amber-500 font-semibold">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{rating.toFixed(1)}</span>
              <span className="text-slate-400 font-normal">({reviewsCount})</span>
            </div>
            <span className="flex items-center gap-1 text-slate-500">
              <Clock className="w-3.5 h-3.5 text-[#0FA3A3]" />
              {course.validityDays} Days Access
            </span>
          </div>

          {/* Title */}
          <Link to={courseLink} className="group-hover:text-[#0FA3A3] transition-colors">
            <h3 className="text-base font-bold text-[#0E2A47] line-clamp-2 leading-snug">
              {course.title}
            </h3>
          </Link>

          {/* Short Description */}
          <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
            {course.shortDescription}
          </p>
        </div>

        {/* Footer Area */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-[#0FA3A3]" />
              {course.lecturesCount || 24} HD Lectures
            </span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              Watermarked DRM
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Course Fee</span>
              <p className="text-lg font-extrabold text-[#0E2A47] leading-none">
                {formatPKR(course.price)}
              </p>
            </div>
            <Link to={courseLink}>
              <Button size="sm" variant="teal" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                View Course
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
};
