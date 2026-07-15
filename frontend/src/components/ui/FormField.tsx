"use client";

import { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}

export function FormField({ label, hint, error, children, required }: FormFieldProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: error ? "var(--red)" : "var(--text2)",
          marginBottom: 6,
          userSelect: "none",
        }}
      >
        {label}
        {required && <span style={{ color: "var(--red)", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {(hint || error) && (
        <div
          style={{
            fontSize: 12,
            marginTop: 4,
            color: error ? "var(--red)" : "var(--text3)",
          }}
        >
          {error ?? hint}
        </div>
      )}
    </div>
  );
}
