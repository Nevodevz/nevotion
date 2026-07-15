"use client";

import { InputHTMLAttributes, useState } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: string;
  suffix?: string;
}

export function Input({ icon, suffix, style, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  if (!icon && !suffix) {
    return (
      <input
        style={{
          width: "100%",
          height: 38,
          padding: "0 12px",
          borderRadius: "var(--radius-md)",
          border: `0.5px solid ${focused ? "var(--border-focus)" : "var(--border)"}`,
          background: "var(--bg-input)",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: 13,
          outline: "none",
          transition: "border-color 0.15s",
          boxSizing: "border-box",
          ...style,
        }}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...rest}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: 38,
        borderRadius: "var(--radius-md)",
        border: `0.5px solid ${focused ? "var(--border-focus)" : "var(--border)"}`,
        background: "var(--bg-input)",
        transition: "border-color 0.15s",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {icon && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: "var(--text3)", paddingLeft: 10, flexShrink: 0 }}
        >
          {icon}
        </span>
      )}
      <input
        style={{
          flex: 1,
          height: "100%",
          padding: icon ? "0 8px" : "0 12px",
          background: "transparent",
          border: "none",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: 13,
          outline: "none",
          minWidth: 0,
          ...style,
        }}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...rest}
      />
      {suffix && (
        <span style={{ fontSize: 12, color: "var(--text3)", paddingRight: 10, flexShrink: 0, userSelect: "none" }}>
          {suffix}
        </span>
      )}
    </div>
  );
}
