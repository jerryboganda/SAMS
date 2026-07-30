import React from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "teal" | "warning" | "info" | "secondary";
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
}) => {
  const handleClose = onClose || onCancel || (() => {});
  const buttonVariantMap: Record<string, "danger" | "primary" | "teal" | "secondary"> = {
    danger: "danger",
    primary: "primary",
    teal: "teal",
    info: "teal",
    warning: "teal",
    secondary: "secondary",
  };
  const effectiveButtonVariant = buttonVariantMap[variant] || "danger";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-full bg-red-100 text-[#DC2626] shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-[#0E2A47]">{title}</h3>
          <p className="text-sm text-[#64748B]">{message}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={effectiveButtonVariant} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};
