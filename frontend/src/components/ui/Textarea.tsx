"use client";

import { TextareaHTMLAttributes, useState } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ style, onFocus, onBlur, ...rest }: TextareaProps) {
  const [focused, setFocused] = useState(false);

  return (
    <textarea
      style={{
        width: "100%",
        padding: "9px 12px",
        borderRadius: "var(--radius-md)",
        border: `0.5px solid ${focused ? "var(--border-focus)" : "var(--border)"}`,
        background: "var(--bg-input)",
        color: "var(--text)",
        fontFamily: "inherit",
        fontSize: 13,
        outline: "none",
        transition: "border-color 0.15s",
        boxSizing: "border-box",
        resize: "vertical",
        lineHeight: 1.5,
        minHeight: 80,
        ...style,
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      {...rest}
    />
  );
}
