"use client";

import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 24,
        gap: 16,
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--text)",
            lineHeight: 1.3,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
