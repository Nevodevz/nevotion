"use client";

import { SelectHTMLAttributes, useState } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ style, onFocus, onBlur, children, ...rest }: SelectProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        style={{
          width: "100%",
          height: 38,
          padding: "0 32px 0 12px",
          borderRadius: "var(--radius-md)",
          border: `0.5px solid ${focused ? "var(--border-focus)" : "var(--border)"}`,
          background: "var(--bg-input)",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: 13,
          outline: "none",
          transition: "border-color 0.15s",
          boxSizing: "border-box",
          appearance: "none",
          WebkitAppearance: "none",
          cursor: "pointer",
          ...style,
        }}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...rest}
      >
        {children}
      </select>
      <span
        className="material-symbols-outlined"
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 16,
          color: "var(--text3)",
          pointerEvents: "none",
        }}
      >
        expand_more
      </span>
    </div>
  );
}
