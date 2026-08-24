"use client";

import { useState } from "react";
import { AVATAR_COLORS } from "@/lib/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    // for single names like "Ариет" use first 2 chars, "Азамат" -> "А"
    return name.slice(0, 1).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Shared avatar used everywhere in the system.
 *
 * Shows the uploaded photo when there is one; otherwise (and whenever the image
 * fails to load) falls back to the initials + colour rendering.
 */
export function Avatar({
  name,
  color = "indigo",
  size = 28,
  src,
  square = false,
}: {
  name: string;
  color?: string;
  size?: number;
  /** `avatar_url` from the API. Empty/undefined → initials fallback. */
  src?: string | null;
  /** Rounded square instead of a circle (used for the large profile preview). */
  square?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const c = AVATAR_COLORS[color] ?? AVATAR_COLORS.indigo;
  const radius = square ? Math.round(size * 0.14) : "50%";

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    objectFit: "cover",
    display: "block",
  };

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={base}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={{
        ...base,
        background: c.bg,
        color: c.fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 600,
      }}
    >
      {initials(name)}
    </div>
  );
}
