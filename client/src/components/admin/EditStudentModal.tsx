import React, { useState, useEffect } from "react";
import {
  UserCheck,
  Mail,
  Phone,
  Lock,
  AlertCircle,
  Shield,
} from "lucide-react";
import { Modal, Button, Input, PasswordInput, Select, Checkbox } from "../ui";
import { adminApi } from "../../api/endpoints/admin";
import { UpdateStudentPayload, User, UserStatus } from "../../types";

export interface EditStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (student: User) => void;
  student: User | null;
}

export const EditStudentModal: React.FC<EditStudentModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  student,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<UserStatus>("active");
  const [emailVerified, setEmailVerified] = useState(false);
  const [password, setPassword] = useState("");

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && student) {
      setName(student.name || "");
      setEmail(student.email || "");
      setPhone(student.phone || "");
      setStatus(student.status || "active");
      setEmailVerified(Boolean(student.emailVerifiedAt));
      setPassword("");
      setFormErrors({});
      setSubmitError(null);
    }
  }, [isOpen, student]);

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

    if (password.trim() && password.trim().length < 6) {
      errors.password = "New password must be at least 6 characters.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: UpdateStudentPayload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() ? phone.trim() : null,
        status,
        emailVerified,
      };

      if (password.trim()) {
        payload.password = password.trim();
      }

      const updated = await adminApi.updateStudent(student.id, payload);
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      console.error("Failed to update student:", err);
      setSubmitError(err.message || "Failed to save student profile changes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!student) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Student Profile"
      description={`Update account details and security settings for ${student.name} (Candidate #${student.id}).`}
      size="lg"
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
            variant="primary"
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {submitError && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold">Update Error</p>
              <p className="text-xs text-red-700 mt-0.5">{submitError}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full Name *"
              placeholder="Candidate's full name"
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
                helperText="International format with country code (e.g. +92 300 1234567)."
              />
            </div>

            <Select
              label="Account Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as UserStatus)}
              options={[
                { value: "active", label: "Active (Standard Access)" },
                { value: "pending", label: "Pending (Awaiting Verification)" },
                { value: "suspended", label: "Suspended (Locked Account)" },
              ]}
            />

            <div className="flex flex-col justify-end pb-1.5">
              <Checkbox
                label={
                  <span className="text-xs font-semibold text-[#1E293B]">
                    Mark email as verified
                  </span>
                }
                checked={emailVerified}
                onChange={(e) => setEmailVerified(e.target.checked)}
              />
              <p className="text-[11px] text-[#64748B] pl-6 mt-0.5">
                {emailVerified
                  ? "Email is marked as verified."
                  : "Candidate must verify email or admin can check this box."}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#0FA3A3]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0E2A47]">
                Reset / Change Password
              </h4>
            </div>
            <PasswordInput
              label="New Password (Optional)"
              placeholder="Enter new password to reset"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: "" }));
              }}
              error={formErrors.password}
              helperText="Leave blank to keep candidate's existing password unchanged."
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};
