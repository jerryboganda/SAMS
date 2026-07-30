import React, { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, HelpCircle, BookOpen, CreditCard, ShieldCheck, FileQuestion } from "lucide-react";
import { Card, Input, Badge, Button } from "../../components/ui";

interface FAQItem {
  id: number;
  category: "courses" | "payments" | "devices" | "qbank";
  question: string;
  answer: string;
}

export const FaqsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [openFaqId, setOpenFaqId] = useState<number | null>(1);

  const faqs: FAQItem[] = [
    // Courses
    {
      id: 1,
      category: "courses",
      question: "How long is my course access valid after purchase?",
      answer: "Every SAMS Academy course bundle includes full 180 days (6 months) of unlimited access to HD video lectures and integrated QBank materials. The expiry date is prominently displayed on your student dashboard.",
    },
    {
      id: 2,
      category: "courses",
      question: "Can I watch the video lectures on mobile devices?",
      answer: "Yes, our adaptive HLS video streaming player works seamlessly on modern mobile browsers, tablets, and laptops. However, please note that downloads are strictly disabled for content security.",
    },
    {
      id: 3,
      category: "courses",
      question: "Are free preview lectures available before enrolling?",
      answer: "Yes! Selected lectures in our NRE Step 1, SMLE, and MBBS courses feature a 'FREE PREVIEW' badge. You can watch these preview videos directly from the Course Detail page or the Free Trial section without an active enrollment.",
    },

    // Payments
    {
      id: 4,
      category: "payments",
      question: "How do I pay using Raast, JazzCash, EasyPaisa, or Bank Transfer?",
      answer: "At checkout, select your preferred payment method: JazzCash and EasyPaisa provide instant automated redirect activation. For Raast and Manual Bank Transfer, our account details, IBAN, and Raast QR Code will be displayed. Simply make the transfer in your banking app and upload your transaction reference / proof screenshot. Your course will be verified and activated within 1–3 hours.",
    },
    {
      id: 5,
      category: "payments",
      question: "Can I apply discount coupons at checkout?",
      answer: "Yes! During checkout, enter your valid promotional code (e.g. WELCOME10) in the coupon field and click 'Apply'. The discount will be quoted and deducted immediately by our server before payment.",
    },
    {
      id: 6,
      category: "payments",
      question: "Where can I download my payment invoice?",
      answer: "Once your order is marked 'Paid', a formal PDF invoice with your sequential invoice number (e.g. SAMS-2026-00001) will be generated. You can download this invoice anytime from your Student Portal under 'My Orders'.",
    },

    // Devices & Security
    {
      id: 7,
      category: "devices",
      question: "What is the 2-Device Policy and how does it work?",
      answer: "To prevent unauthorized account sharing, each student account is permitted a maximum of 2 registered primary devices (e.g. 1 laptop + 1 phone). Attempting to log in on a 3rd device will trigger a '423 DEVICE_LIMIT_REACHED' error. If you change your primary device, you can request an administrator device reset.",
    },
    {
      id: 8,
      category: "devices",
      question: "Why do I see my name and email watermark floating across the video?",
      answer: "SAMS Academy employs dynamic forensic watermark security. A semi-transparent overlay displaying your name, email, and current timestamp shifts position periodically to protect our instructors' intellectual property.",
    },
    {
      id: 9,
      category: "devices",
      question: "Can I watch videos on two devices simultaneously?",
      answer: "No. Our player maintains a single active concurrent stream lock per student. Starting a video stream on a second device or tab will automatically pause and takeover the session from the first device.",
    },

    // QBank
    {
      id: 10,
      category: "qbank",
      question: "What is the difference between Practice Mode and Exam Mode in QBank?",
      answer: "In Practice Mode, you receive immediate feedback, correct option highlight, and detailed explanations after answering each question. In Exam Mode, feedback is hidden until you complete and submit the entire test under timed conditions.",
    },
    {
      id: 11,
      category: "qbank",
      question: "Can I create customized tests based on specific organ systems or my past incorrect questions?",
      answer: "Yes! Our QBank Test Wizard allows you to select specific subjects (e.g. Pathology, Pharmacology) or body systems (e.g. Cardiovascular, Renal), filter by question pools ('Unused', 'Incorrect', or 'Bookmarked'), and set question counts from 5 to 200.",
    },
    {
      id: 12,
      category: "qbank",
      question: "How does the QBank Analytics dashboard track my progress?",
      answer: "The Analytics section automatically calculates your overall accuracy percentage, average time per question, subject-wise strengths and weaknesses, and daily question velocity graphs.",
    },
  ];

  const filteredFaqs = useMemo(() => {
    let result = faqs;

    if (selectedCategory !== "all") {
      result = result.filter((item) => item.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q)
      );
    }

    return result;
  }, [selectedCategory, searchQuery]);

  const toggleFaq = (id: number) => {
    setOpenFaqId((prev) => (prev === id ? null : id));
  };

  const categories = [
    { key: "all", label: "All Questions", icon: <HelpCircle className="w-4 h-4" /> },
    { key: "courses", label: "Courses & Validity", icon: <BookOpen className="w-4 h-4" /> },
    { key: "payments", label: "Payments & Raast / JazzCash", icon: <CreditCard className="w-4 h-4" /> },
    { key: "devices", label: "2-Device Security Policy", icon: <ShieldCheck className="w-4 h-4" /> },
    { key: "qbank", label: "QBank & Mock Exams", icon: <FileQuestion className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-12 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Header Banner */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl text-center space-y-4 shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <Badge variant="teal">Help Center & FAQs</Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Frequently Asked Questions</h1>
        <p className="text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Find instant answers to questions regarding course enrollments, JazzCash & Raast payment activation, 2-device limits, and QBank practice modes.
        </p>

        {/* Search Bar */}
        <div className="max-w-xl mx-auto pt-2">
          <Input
            placeholder="Search FAQs by topic or keyword (e.g. Raast, 2-device, QBank)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-4 h-4 text-slate-400" />}
            className="bg-white text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? "bg-[#0E2A47] text-white shadow-md"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search Results Summary */}
      <div className="text-xs text-slate-500 flex items-center justify-between px-1">
        <span>Showing <strong>{filteredFaqs.length}</strong> relevant questions</span>
        {(searchQuery || selectedCategory !== "all") && (
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
            }}
            className="text-[#0FA3A3] font-semibold hover:underline cursor-pointer"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Accordion List */}
      <div className="space-y-4">
        {filteredFaqs.length === 0 ? (
          <Card className="p-12 text-center text-slate-500 border-slate-200">
            <p className="text-sm font-semibold">No questions matched your query.</p>
            <p className="text-xs mt-1 text-slate-400">Try searching for broader keywords or reset the category filters.</p>
          </Card>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <Card key={faq.id} className="border-slate-200 overflow-hidden shadow-xs">
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full p-5 text-left bg-white hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span className="text-sm font-bold text-[#0E2A47] flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                    {faq.question}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#0FA3A3] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 bg-slate-50/80 border-t border-slate-100 text-xs text-slate-600 leading-relaxed pl-11">
                    {faq.answer}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};
