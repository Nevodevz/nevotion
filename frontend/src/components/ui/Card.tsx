"use client";

import { CSSProperties, ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  padding?: string | number;
  header?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Card({ children, padding = "20px", header, style, className }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--bg-card)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        ...style,
      }}
    >
      {header && (
        <div
          style={{
            padding: typeof padding === "number" ? `${padding}px` : padding,
            borderBottom: "0.5px solid var(--border)",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--text)",
          }}
        >
          {header}
        </div>
      )}
      <div style={{ padding: typeof padding === "number" ? `${padding}px` : padding }}>
        {children}
      </div>
    </div>
  );
}
