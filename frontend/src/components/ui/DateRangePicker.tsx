"use client";

import { useState } from "react";

interface DateRangeValue {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  onReset?: () => void;
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <label style={{ fontSize: 11, color: "var(--text3)", userSelect: "none" }}>{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: 34,
          padding: "0 10px",
          borderRadius: "var(--radius-md)",
          border: `0.5px solid ${focused ? "var(--border-focus)" : "var(--border)"}`,
          background: "var(--bg-input)",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: 13,
          outline: "none",
          transition: "border-color 0.15s",
          boxSizing: "border-box",
          width: "100%",
        }}
      />
    </div>
  );
}

export function DateRangePicker({ value, onChange, onReset }: DateRangePickerProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      <DateInput
        label="с"
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
      />
      <DateInput
        label="по"
        value={value.to}
        onChange={(to) => onChange({ ...value, to })}
      />
      {onReset && (value.from || value.to) && (
        <button
          onClick={onReset}
          title="Сбросить"
          style={{
            height: 34,
            width: 34,
            flexShrink: 0,
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "transparent",
            color: "var(--text3)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      )}
    </div>
  );
}
