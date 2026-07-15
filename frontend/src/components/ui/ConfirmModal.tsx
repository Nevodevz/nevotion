"use client";

import { Modal } from "@/components/Modal";
import { Button, ButtonVariant } from "./Button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  variant = "primary",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={380}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: "var(--text2)", lineHeight: 1.6 }}>
        {message}
      </p>
    </Modal>
  );
}
