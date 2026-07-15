"use client";

import React, { ButtonHTMLAttributes, CSSProperties, ReactNode, useState } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: string;
  children?: ReactNode;
}

const HEIGHT: Record<ButtonSize, number> = { md: 38, sm: 32 };
const FONT_SIZE: Record<ButtonSize, number> = { md: 13, sm: 12 };
const PADDING: Record<ButtonSize, string> = { md: "0 16px", sm: "0 12px" };

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--primary)",
    color: "#fff",
    border: "1px solid transparent",
  },
  ghost: {
    background: "transparent",
    color: "var(--text2)",
    border: "0.5px solid var(--border)",
  },
  danger: {
    background: "var(--red-bg)",
    color: "var(--red)",
    border: "0.5px solid var(--red)",
  },
};

const HOVER_BG: Record<ButtonVariant, string> = {
  primary: "var(--primary-hover)",
  ghost: "var(--bg3)",
  danger: "rgba(186,26,26,0.18)",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);

  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: HEIGHT[size],
    padding: PADDING[size],
    borderRadius: "var(--radius-md)",
    fontSize: FONT_SIZE[size],
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: disabled || loading ? "default" : "pointer",
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
    opacity: disabled || loading ? 0.6 : 1,
    userSelect: "none",
    whiteSpace: "nowrap",
    ...VARIANT_STYLES[variant],
    ...(hovered && !disabled && !loading ? { background: HOVER_BG[variant] } : {}),
    ...style,
  };

  return (
    <button
      disabled={disabled || loading}
      style={base}
      onMouseEnter={(e) => { setHovered(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHovered(false); onMouseLeave?.(e); }}
      {...rest}
    >
      {loading ? (
        <span className="material-symbols-outlined" style={{ fontSize: size === "sm" ? 14 : 16, animation: "spin 0.8s linear infinite" }}>
          progress_activity
        </span>
      ) : icon ? (
        <span className="material-symbols-outlined" style={{ fontSize: size === "sm" ? 16 : 18 }}>
          {icon}
        </span>
      ) : null}
      {children}
      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </button>
  );
}
