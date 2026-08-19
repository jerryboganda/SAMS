import React, { useState, useEffect } from "react";
import {
  UserCheck,
  Mail,
  Phone,
  Sparkles,
  BookOpen,
  Trash2,
  Plus,
  AlertCircle,
  Clock,
  Key,
  Zap,
} from "lucide-react";
import { Modal, Button, Input, PasswordInput, Select, Checkbox, Badge } from "../ui";
import { adminApi } from "../../api/endpoints/admin";
import { Course, CourseAllocationItem, SubscriptionPackage, User } from "../../types";
import { formatDate } from "../../utils/formatters";

export interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (
    student: User,
    credentials: {
      name: string;
      email: string;
      password: string;
      enrollments: { courseTitle: string; expiresAt: string }[];
    }
  ) => void;
  courses: Course[];
  packages?: SubscriptionPackage[];
}

interface SelectedCourseState {
  courseId: number;
  validityOption: "default" | "30" | "60" | "90" | "180" | "365" | "custom" | string;
  customDate?: string;
}

const generateStrongPassword = (): string => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const allChars = upper + lower + digits + symbols;

  let pwd = "";
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = 4; i < 12; i++) {
    pwd += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

const getTomorrowDateString = (): string => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split("T")[0];
};

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  courses,
  packages,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "pending" | "suspended">("active");
  const [emailVerified, setEmailVerified] = useState(true);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [selectedCourses, setSelectedCourses] = useState<SelectedCourseState[]>([]);
  const [courseToAdd, setCourseToAdd] = useState<number>(0);

  const [packagesList, setPackagesList] = useState<SubscriptionPackage[]>(packages || []);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setEmail("");
      setPhone("");
      const initialPassword = generateStrongPassword();
      setPassword(initialPassword);
      setStatus("active");
      setEmailVerified(true);
      setSendWelcomeEmail(true);
      setSelectedCourses([]);
      setCourseToAdd(0);
      setSelectedPackageId("");
      setFormErrors({});
      setSubmitError(null);

      // Load packages if not passed as prop
      if (packages && packages.length > 0) {
        setPackagesList(packages);
      } else {
        adminApi
          .getPackages()
          .then((data) => setPackagesList(data))
          .catch((err) => console.error("Failed to load packages in AddStudentModal:", err));
      }
    }
  }, [isOpen, packages]);

  const handleQuickApplyPackage = (pkgIdStr: string) => {
    if (!pkgIdStr) return;
    const pkgId = Number(pkgIdStr);
    const pkg = packagesList.find((p) => p.id === pkgId);
    if (!pkg) return;

    const courseIdsToAdd: number[] = [];
    if (pkg.includedCourseIds && pkg.includedCourseIds.length > 0) {
      courseIdsToAdd.push(...pkg.includedCourseIds);
    } else if (pkg.includedCourses && pkg.includedCourses.length > 0) {
      courseIdsToAdd.push(...pkg.includedCourses.map((c) => c.id));
    }

    if (courseIdsToAdd.length > 0) {
      setSelectedCourses((prev) => {
        const next = [...prev];
        const validityOpt = String(pkg.validityDays);
        for (const cid of courseIdsToAdd) {
          const existingIdx = next.findIndex((sc) => sc.courseId === cid);
          if (existingIdx >= 0) {
            next[existingIdx] = {
              ...next[existingIdx],
              validityOption: validityOpt,
            };
          } else {
            next.push({
              courseId: cid,
              validityOption: validityOpt,
            });
          }
        }
        return next;
      });
    }
    setSelectedPackageId("");
  };

  const handleGeneratePassword = () => {
    const newPass = generateStrongPassword();
    setPassword(newPass);
    if (formErrors.password) {
      setFormErrors((prev) => ({ ...prev, password: "" }));
    }
  };

  const calculateExpiryDate = (
    course: Course | undefined,
    validityOption: string,
    customDate?: string
  ): Date => {
    if (validityOption === "custom" && customDate) {
      return new Date(`${customDate}T23:59:59`);
    }
    const days =
      validityOption === "default"
        ? course?.validityDays || 180
        : parseInt(validityOption, 10);
    const d = new Date();
    d.setDate(d.getDate() + (isNaN(days) ? 180 : days));
    return d;
  };

  const handleAddCourse = () => {
    if (!courseToAdd) return;
    if (selectedCourses.some((sc) => sc.courseId === courseToAdd)) return;

    setSelectedCourses((prev) => [
      ...prev,
      {
        courseId: courseToAdd,
        validityOption: "default",
      },
    ]);
    setCourseToAdd(0);
  };

  const handleRemoveCourse = (courseId: number) => {
    setSelectedCourses((prev) => prev.filter((sc) => sc.courseId !== courseId));
  };

  const handleUpdateCourseValidity = (
    courseId: number,
    validityOption: SelectedCourseState["validityOption"],
    customDate?: string
  ) => {
    setSelectedCourses((prev) =>
      prev.map((sc) => {
        if (sc.courseId === courseId) {
          return {
            ...sc,
            validityOption,
            customDate:
              validityOption === "custom"
                ? customDate || sc.customDate || getTomorrowDateString()
                : undefined,
          };
        }
        return sc;
      })
    );
  };

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!name.trim()) {
      errors.name = "Full Name is required.";
    }

    if (!email.trim()) {
      errors.email = "Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password.trim()) {
      errors.password = "Password is required.";
    } else if (password.trim().length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }

    for (const sc of selectedCourses) {
      if (sc.validityOption === "custom" && !sc.customDate) {
        errors.courses = "Please select an expiration date for all custom-dated courses.";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Build enrollment payload
      const enrollmentsPayload: CourseAllocationItem[] = selectedCourses.map((sc) => {
        const course = courses.find((c) => c.id === sc.courseId);
        if (sc.validityOption === "custom" && sc.customDate) {
          return {
            courseId: sc.courseId,
            validityMode: "date",
            expiresAt: new Date(`${sc.customDate}T23:59:59`).toISOString(),
          };
        }
        const days =
          sc.validityOption === "default"
            ? course?.validityDays || 180
            : parseInt(sc.validityOption, 10);
        return {
          courseId: sc.courseId,
          validityMode: "days",
          days,
        };
      });

      const studentData = await adminApi.createStudent({
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        phone: phone.trim() || undefined,
        status,
        emailVerified,
        enrollments: enrollmentsPayload,
        sendWelcomeEmail,
      });

      // Prepare credentials summary for post-creation modal
      const credentialsEnrollments = selectedCourses.map((sc) => {
        const course = courses.find((c) => c.id === sc.courseId);
        const expiryDate = calculateExpiryDate(course, sc.validityOption, sc.customDate);
        return {
          courseTitle: course?.title || `Course #${sc.courseId}`,
          expiresAt: expiryDate.toISOString(),
        };
      });

      onCreated(studentData, {
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        enrollments: credentialsEnrollments,
      });

      onClose();
    } catch (err: any) {
      console.error("Failed to create student:", err);
      setSubmitError(err.message || "Failed to create student account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableCourses = courses.filter(
    (c) => !selectedCourses.some((sc) => sc.courseId === c.id)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Student Candidate"
      description="Register a new student account, generate secure credentials, and allocate course packages."
      size="xl"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="teal"
            isLoading={isSubmitting}
            onClick={handleSubmit}
            leftIcon={<UserCheck className="w-4 h-4" />}
          >
            Create Student & Allocate Access
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {submitError && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold">Creation Error</p>
              <p className="text-xs text-red-700 mt-0.5">{submitError}</p>
            </div>
          </div>
        )}

        {/* Section 1: Personal Details */}
        <div className="space-y-3.5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <UserCheck className="w-4 h-4 text-[#0FA3A3]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#0E2A47]">
              1. Candidate Personal Details
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full Name *"
              placeholder="e.g. Dr. Ayesha Khan"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: "" }));
              }}
              leftIcon={<UserCheck className="w-4 h-4" />}
              error={formErrors.name}
            />

            <Input
              label="Email Address *"
              type="email"
              placeholder="candidate@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: "" }));
              }}
              leftIcon={<Mail className="w-4 h-4" />}
              error={formErrors.email}
            />

            <div className="sm:col-span-2">
              <Input
                label="WhatsApp Phone Number (Optional)"
                placeholder="+92 300 1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                leftIcon={<Phone className="w-4 h-4" />}
                helperText="Used for automated credential dispatch and WhatsApp student support."
              />
            </div>
          </div>
        </div>

        {/* Section 2: Security & Credentials */}
        <div className="space-y-3.5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Key className="w-4 h-4 text-[#0FA3A3]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#0E2A47]">
              2. Security & Credentials
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-end gap-2.5">
                <div className="flex-1">
                  <PasswordInput
                    label="Account Password *"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: "" }));
                    }}
                    error={formErrors.password}
                    placeholder="Enter or generate secure password"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleGeneratePassword}
                  leftIcon={<Sparkles className="w-4 h-4 text-[#0FA3A3]" />}
                  className="shrink-0 mb-[1px]"
                >
                  Generate Strong
                </Button>
              </div>
              <p className="text-[11px] text-[#64748B]">
                A strong 12-character alphanumeric password is auto-generated. You can also customize it.
              </p>
            </div>

            <Select
              label="Account Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "pending" | "suspended")}
              options={[
                { value: "active", label: "Active (Standard Access)" },
                { value: "pending", label: "Pending (Awaiting Verification)" },
                { value: "suspended", label: "Suspended (Locked Account)" },
              ]}
            />

            <div className="flex flex-col justify-end pb-1.5">
              <Checkbox
                label={
                  <span className="text-xs font-medium text-[#1E293B]">
                    Mark email as verified immediately
                  </span>
                }
                checked={emailVerified}
                onChange={(e) => setEmailVerified(e.target.checked)}
              />
              <p className="text-[11px] text-[#64748B] pl-6 mt-0.5">
                Allows candidate to log in without clicking email verification links.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Course & Package Allocation */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0FA3A3]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0E2A47]">
                3. Course & Package Allocation
              </h4>
            </div>
            <span className="text-xs text-[#64748B]">
              {selectedCourses.length} {selectedCourses.length === 1 ? "course" : "courses"} selected
            </span>
          </div>

          {formErrors.courses && (
            <p className="text-xs text-[#DC2626] font-medium">{formErrors.courses}</p>
          )}

          {/* 1-Click Quick-Apply Subscription Package Selector */}
          {packagesList.length > 0 && (
            <div className="p-3 bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40 border border-teal-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0E2A47]">
                <div className="p-1 rounded-md bg-amber-100 text-amber-700">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <span>1-Click Package Apply:</span>
              </div>
              <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                <select
                  value={selectedPackageId}
                  onChange={(e) => handleQuickApplyPackage(e.target.value)}
                  className="w-full rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 text-xs text-[#1E293B] font-medium focus:border-[#0FA3A3] focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]/20 transition-all"
                >
                  <option value="">Quick-Apply Subscription Package...</option>
                  {packagesList
                    .filter((p) => p.isActive !== false)
                    .map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.title} ({pkg.validityDays}d — {pkg.includedCourseIds?.length || 0} courses)
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {/* Allocated Courses List */}
          {selectedCourses.length > 0 ? (
            <div className="space-y-2.5">
              {selectedCourses.map((sc) => {
                const course = courses.find((c) => c.id === sc.courseId);
                const expiryDate = calculateExpiryDate(course, sc.validityOption, sc.customDate);

                return (
                  <div
                    key={sc.courseId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition-all hover:border-slate-300"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="text-sm font-semibold text-[#0E2A47] truncate">
                          {course?.title || `Course #${sc.courseId}`}
                        </h5>
                        {course?.examCategory && (
                          <Badge variant="teal" size="sm">
                            {course.examCategory}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[#0FA3A3] font-medium mt-1">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Access expires on: {formatDate(expiryDate)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={sc.validityOption}
                        onChange={(e) =>
                          handleUpdateCourseValidity(
                            sc.courseId,
                            e.target.value as SelectedCourseState["validityOption"],
                            sc.customDate
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-[#1E293B] focus:border-[#0FA3A3] focus:outline-none focus:ring-1 focus:ring-[#0FA3A3]"
                      >
                        <option value="default">
                          Course Default ({course?.validityDays || 180} Days)
                        </option>
                        {["30", "60", "90", "180", "365", "730"].map((days) => (
                          <option key={days} value={days}>
                            {days} Days ({Math.round(Number(days) / 30)} Months)
                          </option>
                        ))}
                        {!["default", "30", "60", "90", "180", "365", "730", "custom"].includes(
                          sc.validityOption
                        ) && (
                          <option value={sc.validityOption}>
                            {sc.validityOption} Days (Package Plan)
                          </option>
                        )}
                        <option value="custom">Custom Expiry Date</option>
                      </select>

                      {sc.validityOption === "custom" && (
                        <input
                          type="date"
                          min={getTomorrowDateString()}
                          value={sc.customDate || getTomorrowDateString()}
                          onChange={(e) =>
                            handleUpdateCourseValidity(
                              sc.courseId,
                              "custom",
                              e.target.value
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-[#1E293B] focus:border-[#0FA3A3] focus:outline-none focus:ring-1 focus:ring-[#0FA3A3]"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveCourse(sc.courseId)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Remove Course"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-[#64748B]">
              No courses allocated yet. Use the dropdown below to allocate courses to this candidate.
            </div>
          )}

          {/* Add Course Row */}
          {availableCourses.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={courseToAdd}
                onChange={(e) => setCourseToAdd(Number(e.target.value))}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-[#1E293B] focus:border-[#0FA3A3] focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]/20"
              >
                <option value={0}>Select a course package to allocate...</option>
                {availableCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.examCategory}) — {c.validityDays || 180} Days Default
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!courseToAdd || courseToAdd === 0}
                onClick={handleAddCourse}
                leftIcon={<Plus className="w-3.5 h-3.5 text-[#0FA3A3]" />}
                className="shrink-0"
              >
                Allocate Package
              </Button>
            </div>
          )}
        </div>

        {/* Section 4: Notifications */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="rounded-xl bg-teal-50/60 border border-teal-100 p-3.5">
            <Checkbox
              label={
                <span className="text-xs font-semibold text-[#0E2A47]">
                  Send welcome email with login credentials to student
                </span>
              }
              checked={sendWelcomeEmail}
              onChange={(e) => setSendWelcomeEmail(e.target.checked)}
            />
            <p className="text-[11px] text-[#64748B] pl-6 mt-1">
              Dispatches portal link, credentials, and allocated course summary directly to candidate's email.
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
};
