"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui";
import type { CalendarEvent, CalendarSource, CalendarViewMode } from "@/lib/types";
import { CALENDAR_SOURCE, CALENDAR_SOURCE_KEYS } from "@/lib/types";
import { AgendaView } from "./AgendaView";
import { CalendarToolbar } from "./CalendarToolbar";
import { MonthGrid } from "./MonthGrid";
import { DayTimeGrid, WeekTimeGrid } from "./TimeGrid";
import { rangeFor, startOfLocalWeek, stepAnchor } from "./layout";

export { rangeFor, stepAnchor };

/** Source visibility toggles — hiding a type never deletes anything. */
function SourceToggles({
  visible, onToggle, availableSources,
}: {
  visible: Record<CalendarSource, boolean>;
  onToggle: (source: CalendarSource) => void;
  availableSources: CalendarSource[];
}) {
  return (
    <div className="cal-toggles">
      {availableSources.map((s) => {
        const meta = CALENDAR_SOURCE[s];
        const on = visible[s];
        return (
          <button key={s} type="button" onClick={() => onToggle(s)}
            aria-pressed={on}
            title={on ? `Скрыть: ${meta.label}` : `Показать: ${meta.label}`}
            className={`cal-toggle${on ? " on" : ""}`}
            style={on ? { background: meta.bg, color: meta.color, borderColor: meta.color } : undefined}>
            <span className="cal-toggle-dot" style={{ background: on ? meta.color : "var(--text3)" }} />
            {meta.label}
          </button>
        );
      })}
      <style jsx>{`
        .cal-toggles { display: flex; gap: 6px; flex-wrap: wrap; }
        .cal-toggle {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 14px; cursor: pointer;
          border: 1px solid var(--border); background: var(--bg2);
          color: var(--text3); font-family: inherit; font-size: 11px;
          transition: all 0.13s;
        }
        .cal-toggle.on { font-weight: 600; }
        .cal-toggle:not(.on) { opacity: 0.6; text-decoration: line-through; }
        .cal-toggle-dot { width: 7px; height: 7px; border-radius: 50%; }
      `}</style>
    </div>
  );
}

/**
 * Reusable calendar core.
 *
 * Owns presentation only: view switching, navigation, layout and empty/loading/
 * error states. The host screen supplies the events, the filters and what
 * happens on create — which is the only thing that differs between «Мои задачи»
 * and the sales department calendar.
 */
export function Calendar({
  mode, anchor, events, loading, error,
  onModeChange, onAnchorChange, onEventClick, onSlotClick, onRetry,
  visibleSources, onToggleSource, availableSources = CALENDAR_SOURCE_KEYS,
  filters, legendNote,
}: {
  mode: CalendarViewMode;
  anchor: number;
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  onModeChange: (mode: CalendarViewMode) => void;
  /** Receives a delta (-1/1) or, with `absolute`, a timestamp. */
  onAnchorChange: (value: number, absolute?: boolean) => void;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick?: (startMs: number) => void;
  onRetry: () => void;
  visibleSources: Record<CalendarSource, boolean>;
  onToggleSource: (source: CalendarSource) => void;
  availableSources?: CalendarSource[];
  /** Extra controls (closer/setter/status filters) rendered in the toolbar. */
  filters?: React.ReactNode;
  legendNote?: React.ReactNode;
}) {
  const { from, to } = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);

  // Hiding a source is purely visual — the data stays loaded.
  const shown = useMemo(
    () => events.filter((e) => visibleSources[e.source] !== false),
    [events, visibleSources],
  );

  const body = (() => {
    if (error && mode !== "agenda") {
      return (
        <div className="cal-state">
          <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
          <Button size="sm" variant="ghost" onClick={onRetry}>Повторить</Button>
        </div>
      );
    }
    switch (mode) {
      case "day":
        return (
          <DayTimeGrid day={anchor} events={shown} loading={loading}
            onEventClick={onEventClick} onSlotClick={onSlotClick} />
        );
      case "week":
        return (
          <WeekTimeGrid weekStart={startOfLocalWeek(anchor)} events={shown} loading={loading}
            onEventClick={onEventClick} onSlotClick={onSlotClick} />
        );
      case "month":
        return (
          <MonthGrid anchor={anchor} events={shown} loading={loading}
            onEventClick={onEventClick} onSlotClick={onSlotClick} />
        );
      case "agenda":
        return (
          <AgendaView from={from} to={to} events={shown} loading={loading}
            error={error} onRetry={onRetry} onEventClick={onEventClick} />
        );
    }
  })();

  return (
    <div>
      <CalendarToolbar
        mode={mode}
        anchor={anchor}
        loading={loading}
        onModeChange={onModeChange}
        onAnchorChange={(v, absolute) => onAnchorChange(v, absolute)}
        onToday={() => onAnchorChange(Date.now(), true)}
        extra={filters}
      />

      <div className="cal-legend">
        <SourceToggles
          visible={visibleSources}
          onToggle={onToggleSource}
          availableSources={availableSources}
        />
        {legendNote}
      </div>

      {body}

      <style jsx>{`
        .cal-legend {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
        }
        .cal-state {
          border: 1px solid var(--border); border-radius: 10px; background: var(--bg2);
          padding: 48px 20px; text-align: center;
        }
      `}</style>
    </div>
  );
}
