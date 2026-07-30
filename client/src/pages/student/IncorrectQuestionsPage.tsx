import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  XCircle,
  FileQuestion,
  ArrowRight,
  Play,
  Bookmark,
  CheckCircle2,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Card, Button, Badge, Drawer } from "../../components/ui";
import { qbankApi } from "../../api/endpoints/qbank";
import { MOCK_QUESTIONS } from "../../mock-data";
import { Question } from "../../types";

export const IncorrectQuestionsPage: React.FC = () => {
  const navigate = useNavigate();

  // Load Past Incorrect Questions
  const [incorrectList, setIncorrectList] = useState<Question[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    // Pick questions from MOCK_QUESTIONS as representation of incorrect pool
    // (e.g. difficulty hard or odd indices)
    const list = MOCK_QUESTIONS.filter((_, idx) => idx % 3 === 1 || idx % 5 === 0);
    setIncorrectList(list);
  }, []);

  // Open Inspector Drawer
  const handleInspectQuestion = (question: Question) => {
    setSelectedQuestion(question);
    setIsDrawerOpen(true);
  };

  // Toggle Bookmark for a question inside drawer or list
  const handleToggleBookmark = async (questionId: number) => {
    try {
      await qbankApi.toggleQuestionBookmark(questionId);
      setIncorrectList((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, isBookmarked: !q.isBookmarked } : q))
      );
      if (selectedQuestion?.id === questionId) {
        setSelectedQuestion({
          ...selectedQuestion,
          isBookmarked: !selectedQuestion.isBookmarked,
        });
      }
    } catch (err) {
      console.error("Failed to toggle bookmark", err);
    }
  };

  // Practice Incorrect Pool CTA
  const handlePracticeIncorrect = () => {
    navigate("/app/qbank/new?pool=incorrect");
  };

  return (
    <div className="space-y-8 pb-12 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">Past Incorrect Questions Pool</h1>
          <p className="text-xs text-slate-500 mt-1">
            Revisit clinical vignettes answered incorrectly in previous test blocks to eliminate diagnostic weak spots.
          </p>
        </div>

        <Button
          variant="teal"
          size="md"
          disabled={incorrectList.length === 0}
          onClick={handlePracticeIncorrect}
          icon={<Play className="w-4 h-4" />}
        >
          Practice These Now ({incorrectList.length})
        </Button>
      </div>

      {/* Empty State */}
      {incorrectList.length === 0 ? (
        <Card className="p-12 text-center space-y-4 border-slate-200 bg-white rounded-2xl shadow-xs">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-[#0E2A47]">No Incorrect Questions Pool Found!</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You have answered all questions correctly in your previous blocks or haven't taken any tests yet.
            </p>
          </div>
          <Link to="/app/qbank/new">
            <Button variant="outline" size="sm" className="mt-2">
              Start a New Test Block
            </Button>
          </Link>
        </Card>
      ) : (
        /* Table / List of Incorrect Questions */
        <Card className="border-slate-200 overflow-hidden bg-white rounded-2xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider text-[11px] font-black">
                  <th className="p-4">Clinical Vignette Preview</th>
                  <th className="p-4">Subject & System</th>
                  <th className="p-4">Last Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {incorrectList.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Stem Preview */}
                    <td className="p-4 max-w-md">
                      <p className="font-semibold text-slate-900 line-clamp-2 leading-relaxed">
                        {q.stem}
                      </p>
                    </td>

                    {/* Subject & System */}
                    <td className="p-4">
                      <div className="space-y-1">
                        <Badge variant="teal" size="sm" className="font-extrabold">
                          {q.subjectName}
                        </Badge>
                        <div className="text-[11px] text-slate-500">{q.systemName}</div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      <Badge variant="danger" size="sm" className="font-extrabold">
                        INCORRECT
                      </Badge>
                    </td>

                    {/* Action Buttons */}
                    <td className="p-4 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleInspectQuestion(q)}
                      >
                        View Vignette
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className={q.isBookmarked ? "text-[#0FA3A3]" : "text-slate-400"}
                        onClick={() => handleToggleBookmark(q.id)}
                        icon={<Bookmark className={`w-4 h-4 ${q.isBookmarked ? "fill-[#0FA3A3]" : ""}`} />}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Side-Peek Drawer showing Full Question + Explanation */}
      <Drawer
        isOpen={isDrawerOpen && selectedQuestion !== null}
        onClose={() => setIsDrawerOpen(false)}
        title="Incorrect Vignette Inspector"
        position="right"
      >
        {selectedQuestion && (
          <div className="space-y-6 text-xs p-1">
            {/* Subject Tag & Bookmark Action */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Badge variant="teal" size="md">
                  {selectedQuestion.subjectName}
                </Badge>
                <span className="font-bold text-slate-600">{selectedQuestion.systemName}</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className={selectedQuestion.isBookmarked ? "text-[#0FA3A3]" : "text-slate-500"}
                onClick={() => handleToggleBookmark(selectedQuestion.id)}
                icon={
                  <Bookmark className={`w-4 h-4 ${selectedQuestion.isBookmarked ? "fill-[#0FA3A3]" : ""}`} />
                }
              >
                {selectedQuestion.isBookmarked ? "Bookmarked" : "Bookmark"}
              </Button>
            </div>

            {/* Question Stem */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                Vignette Stem
              </span>
              <p className="text-sm font-medium text-slate-800 leading-relaxed font-sans">
                {selectedQuestion.stem}
              </p>

              {selectedQuestion.imageUrl && (
                <img
                  src={selectedQuestion.imageUrl}
                  alt="Clinical Specimen"
                  className="rounded-xl border border-slate-200 max-h-52 object-cover shadow-xs"
                />
              )}
            </div>

            {/* Choices */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                Options & Correct Answer
              </span>
              {selectedQuestion.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                return (
                  <div
                    key={opt.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                      opt.isCorrect
                        ? "bg-emerald-50 border-emerald-500 font-extrabold text-emerald-900"
                        : "bg-slate-50 border-slate-200 text-slate-600 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center shrink-0 border ${
                          opt.isCorrect
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-slate-200 text-slate-600 border-slate-300"
                        }`}
                      >
                        {letter}
                      </div>
                      <span>{opt.optionText}</span>
                    </div>

                    {opt.isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                );
              })}
            </div>

            {/* Explanation */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-extrabold text-[#0E2A47] text-xs">Clinical Rationale</div>
              <p className="text-slate-700 leading-relaxed font-normal">
                {selectedQuestion.explanation}
              </p>
              {selectedQuestion.referenceText && (
                <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-200">
                  Ref: {selectedQuestion.referenceText}
                </p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
