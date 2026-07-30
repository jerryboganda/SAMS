import React, { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, Input, Textarea, Button, Badge } from "../../components/ui";

export const ContactPage: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [submitCount, setSubmitCount] = useState(0);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required.";
    if (!email.trim()) {
      errs.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Please enter a valid email address.";
    }
    if (!subject.trim()) errs.subject = "Subject is required.";
    if (!message.trim()) {
      errs.message = "Message cannot be empty.";
    } else if (message.trim().length < 10) {
      errs.message = "Message must be at least 10 characters long.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setRateLimitError(null);

    if (!validate()) return;

    setIsSubmitting(true);

    // Simulate Rate Limit Error trigger
    if (email.includes("+ratelimit") || submitCount >= 4) {
      setTimeout(() => {
        setIsSubmitting(false);
        setRateLimitError("429 Too Many Requests: You have submitted messages too frequently. Please wait 15 minutes before trying again.");
      }, 500);
      return;
    }

    // Mock API Submission delay
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitCount((prev) => prev + 1);
      setSuccessMessage("Thank you for contacting SAMS Academy! Your message has been sent successfully. Our support team will respond within 24 hours.");
      // Reset Form
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setErrors({});
    }, 600);
  };

  return (
    <div className="space-y-12 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Page Header Banner */}
      <div className="bg-[#0E2A47] text-white p-8 sm:p-12 rounded-3xl text-center space-y-4 shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-[#0FA3A3]/20 rounded-full blur-3xl pointer-events-none" />
        <Badge variant="teal">Contact & Student Support</Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">We're Here to Help You Succeed</h1>
        <p className="text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Have questions about course enrollments, JazzCash/EasyPaisa/Raast payments, or the 2-device policy? Send us a message or reach out directly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Contact Form Area (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 sm:p-8 border-slate-200 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#0E2A47]">Send Us a Message</h2>
              <p className="text-xs text-slate-500 mt-1">
                Fill out the form below and our admissions or technical support team will get back to you promptly.
              </p>
            </div>

            {/* Success Alert Banner */}
            {successMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{successMessage}</span>
              </div>
            )}

            {/* Rate Limit Alert Banner */}
            {rateLimitError && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{rateLimitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#0E2A47] mb-1">Your Full Name *</label>
                  <Input
                    placeholder="Dr. Hamza Malik"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={errors.name}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#0E2A47] mb-1">Your Email Address *</label>
                  <Input
                    placeholder="student@samsacademy.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={errors.email}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0E2A47] mb-1">Subject *</label>
                <Input
                  placeholder="e.g. NRE Step 1 Enrollment Inquiry / Payment Verification"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  error={errors.subject}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0E2A47] mb-1">Message Detail *</label>
                <Textarea
                  rows={5}
                  placeholder="Type your question or inquiry here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  error={errors.message}
                />
              </div>

              <Button
                type="submit"
                variant="teal"
                size="lg"
                isLoading={isSubmitting}
                rightIcon={<Send className="w-4 h-4" />}
                className="w-full sm:w-auto shadow-md shadow-[#0FA3A3]/20"
              >
                Send Message
              </Button>
            </form>
          </Card>
        </div>

        {/* Contact Info Sidebar (1 col) */}
        <div className="space-y-6">
          <Card className="p-6 border-slate-200 space-y-6 bg-white shadow-sm">
            <h3 className="text-base font-bold text-[#0E2A47] border-b border-slate-100 pb-3">
              Direct Contact Details
            </h3>

            <div className="space-y-4 text-xs text-slate-700">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-[#0E2A47] block">Phone & WhatsApp Support</span>
                  <p className="text-slate-600 mt-0.5">+92 300 1234567</p>
                  <p className="text-[10px] text-slate-400">Available Mon–Sat: 9 AM – 9 PM PKT</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-[#0E2A47] block">Email Support</span>
                  <p className="text-slate-600 mt-0.5">support@samsacademy.com</p>
                  <p className="text-[10px] text-slate-400">24/7 Response Window</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-[#0E2A47] block">Main Campus & Office</span>
                  <p className="text-slate-600 mt-0.5 leading-relaxed">
                    SAMS Tower, Main Boulevard, Gulberg III, Lahore, Pakistan
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0FA3A3]/10 text-[#0FA3A3] flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-[#0E2A47] block">Office Hours</span>
                  <p className="text-slate-600 mt-0.5">Monday – Saturday: 9:00 AM – 9:00 PM</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-slate-200 bg-slate-50 space-y-2">
            <h4 className="text-xs font-bold text-[#0E2A47]">Need Immediate Bank / Payment Help?</h4>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              If you have uploaded your Bank Transfer or Raast payment proof, please allow up to 1-3 hours for verification. You can track your order status in the Student Portal under 'My Orders'.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
