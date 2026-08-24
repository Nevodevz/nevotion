"use client";

import { CALENDAR_VIEW_OPTIONS, type CalendarViewMode } from "@/lib/types";
import { fromLocalDateKey, rangeLabel, toLocalDateKey } from "./layout";

/**
 * Shared calendar header: period navigation, «Сегодня», a compact date picker
 * and the day/week/month/agenda switch.
 *
 * Wraps on narrow screens so it never overflows the viewport.
 */
export function CalendarToolbar({
  mode, anchor, onModeChange, onAnchorChange, onToday, loading, extra,
}: {
  mode: CalendarViewMode;
  anchor: number;
  onModeChange: (mode: CalendarViewMode) => void;
  /** `(-1 | 1)` steps one period; `(timestamp, true)` jumps to an exact date. */
  onAnchorChange: (value: number, absolute?: boolean) => void;
  onToday: () => void;
  loading?: boolean;
  /** Source filters / create button supplied by the host screen. */
  extra?: React.ReactNode;
}) {
  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar-nav">
        <button className="cal-nav-btn" onClick={onToday} disabled={loading}>
          Сегодня
        </button>
        <button className="cal-icon-btn" aria-label="Предыдущий период"
          onClick={() => onAnchorChange(-1)} disabled={loading}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
        </button>
        <button className="cal-icon-btn" aria-label="Следующий период"
          onClick={() => onAnchorChange(1)} disabled={loading}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
        </button>

        <span className="cal-range-label">{rangeLabel(mode, anchor)}</span>

        <label className="cal-datepick" title="Перейти к дате">
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>event</span>
          <input
            type="date"
            aria-label="Перейти к дате"
            value={toLocalDateKey(anchor)}
            onChange={(e) => {
              if (e.target.value) onAnchorChange(fromLocalDateKey(e.target.value), true);
            }}
          />
        </label>
      </div>

      <div className="cal-toolbar-right">
        {extra}
        <div role="tablist" aria-label="Режим календаря" className="cal-modes">
          {CALENDAR_VIEW_OPTIONS.map((o) => {
            const active = mode === o.value;
            return (
              <button key={o.value} role="tab" aria-selected={active}
                className={`cal-mode-btn${active ? " active" : ""}`}
                onClick={() => onModeChange(o.value)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{o.icon}</span>
                <span className="cal-mode-label">{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .cal-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap; margin-bottom: 14px;
        }
        .cal-toolbar-nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
        .cal-toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
        .cal-nav-btn {
          padding: 6px 14px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--bg2); color: var(--text2); font-family: inherit;
          font-size: 13px; cursor: pointer; transition: all 0.13s; white-space: nowrap;
        }
        .cal-nav-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
        .cal-nav-btn:disabled, .cal-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cal-icon-btn {
          width: 32px; height: 32px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--bg2); color: var(--text2); cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: all 0.13s;
        }
        .cal-icon-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
        .cal-range-label {
          font-size: 15px; font-weight: 600; color: var(--text);
          margin-left: 6px; white-space: nowrap;
        }
        .cal-datepick {
          display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
          padding: 5px 8px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--bg2); color: var(--text3);
        }
        .cal-datepick:hover { border-color: var(--primary); color: var(--primary); }
        .cal-datepick input {
          border: none; background: none; outline: none; font-family: inherit;
          font-size: 12px; color: var(--text2); width: 108px; cursor: pointer;
        }
        .cal-modes { display: inline-flex; background: var(--bg3); border-radius: 8px; padding: 3px; gap: 2px; }
        .cal-mode-btn {
          display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 6px;
          border: none; background: transparent; color: var(--text3); cursor: pointer;
          font-family: inherit; font-size: 13px; transition: all 0.15s; white-space: nowrap;
        }
        .cal-mode-btn.active { background: var(--bg2); color: var(--text); font-weight: 600; }
        @media (max-width: 720px) {
          .cal-toolbar-right { margin-left: 0; width: 100%; }
          .cal-modes { width: 100%; }
          .cal-mode-btn { flex: 1; justify-content: center; padding: 6px 8px; }
          /* Icons alone keep the switch on-screen on small devices. */
          .cal-mode-label { display: none; }
          .cal-range-label { font-size: 14px; width: 100%; margin-left: 0; }
          .cal-datepick input { width: 92px; }
        }
      `}</style>
    </div>
  );
}
