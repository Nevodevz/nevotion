"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui";
import type { CalendarEvent } from "@/lib/types";
import { CALENDAR_SOURCE } from "@/lib/types";
import { eventColors, eventPerson, eventStatusLabel } from "./CalendarEventCard";
import {
  MONTHS_GENITIVE, WEEKDAY_SHORT,
  allDayEvents, daysInRange, formatTime, startOfLocalDay, timedEventsOnDay, toLocalParts,
} from "./layout";

/**
 * Chronological list grouped by day.
 *
 * Days with no events are skipped so the list stays dense; the empty state
 * covers the case where the whole range is free.
 */
export function AgendaView({
  from, to, events, onEventClick, loading, error, onRetry,
}: {
  from: number;
  to: number;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const groups = useMemo(() => {
    return daysInRange(from, to)
      .map((day) => ({
        day,
        items: [...allDayEvents(events, day), ...timedEventsOnDay(events, day)],
      }))
      .filter((g) => g.items.length > 0);
  }, [from, to, events]);

  const today = startOfLocalDay(Date.now());

  if (error) {
    return (
      <div className="ag-state">
        <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Повторить</Button>}
        <style jsx>{stateCss}</style>
      </div>
    );
  }

  if (loading && groups.length === 0) {
    return (
      <div className="ag-state">
        <span style={{ color: "var(--text3)", fontSize: 13 }}>Загрузка…</span>
        <style jsx>{stateCss}</style>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="ag-state">
        <span className="material-symbols-outlined" style={{ fontSize: 32, color: "var(--text3)" }}>
          event_available
        </span>
        <div style={{ color: "var(--text3)", fontSize: 13, marginTop: 8 }}>
          В этом периоде событий нет
        </div>
        <style jsx>{stateCss}</style>
      </div>
    );
  }

  return (
    <div className="ag-root">
      {groups.map(({ day, items }) => {
        const p = toLocalParts(day);
        return (
          <div key={day} className="ag-group">
            <div className={`ag-day${day === today ? " today" : ""}`}>
              <span className="ag-day-num">{p.day}</span>
              <span className="ag-day-meta">
                {MONTHS_GENITIVE[p.month - 1]} · {WEEKDAY_SHORT[p.weekday]}
                {day === today && " · сегодня"}
              </span>
            </div>

            <div className="ag-items">
              {items.map((e) => {
                const { color, bg } = eventColors(e);
                const meta = CALENDAR_SOURCE[e.source] ?? CALENDAR_SOURCE.task;
                const statusLabel = eventStatusLabel(e);
                const person = eventPerson(e);
                return (
                  <button key={e.id} type="button" className="ag-item" onClick={() => onEventClick(e)}>
                    <span className="ag-time">
                      {e.all_day ? "Весь день" : formatTime(Date.parse(e.start))}
                      {!e.all_day && e.end && (
                        <span className="ag-time-end">– {formatTime(Date.parse(e.end))}</span>
                      )}
                    </span>
                    <span className="ag-bar" style={{ background: color }} />
                    <span className="ag-body">
                      <span className="ag-title" style={{ textDecoration: e.status === "done" ? "line-through" : "none" }}>
                        {e.title}
                      </span>
                      <span className="ag-meta">
                        <span className="ag-tag" style={{ background: bg, color }}>{meta.label}</span>
                        {statusLabel && <span className="ag-sep">{statusLabel}</span>}
                        {e.location && (
                          <span className="ag-sep">
                            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: "-2px" }}>place</span>
                            {" "}{e.location}
                          </span>
                        )}
                        {person && <span className="ag-sep">{person}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <style jsx>{`
        .ag-root {
          border: 1px solid var(--border); border-radius: 10px;
          background: var(--bg2); overflow: hidden;
        }
        .ag-group { border-bottom: 1px solid var(--border); }
        .ag-group:last-child { border-bottom: none; }
        .ag-day {
          display: flex; align-items: baseline; gap: 8px;
          padding: 8px 14px; background: var(--bg3);
        }
        .ag-day.today .ag-day-num { color: var(--primary); }
        .ag-day-num { font-size: 15px; font-weight: 700; color: var(--text); }
        .ag-day-meta { font-size: 11px; color: var(--text3); text-transform: lowercase; }
        .ag-items { display: flex; flex-direction: column; }
        .ag-item {
          display: flex; align-items: flex-start; gap: 10px; width: 100%;
          padding: 10px 14px; border: none; background: transparent; cursor: pointer;
          text-align: left; font-family: inherit; border-top: 1px solid var(--border);
          transition: background 0.12s;
        }
        .ag-items .ag-item:first-child { border-top: none; }
        .ag-item:hover { background: var(--bg3); }
        .ag-time {
          flex-shrink: 0; width: 96px; font-size: 12px; color: var(--text2);
          font-family: "JetBrains Mono", monospace; padding-top: 1px;
        }
        .ag-time-end { color: var(--text3); }
        .ag-bar { width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }
        .ag-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .ag-title { font-size: 13px; font-weight: 500; color: var(--text); }
        .ag-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 11px; color: var(--text3); }
        .ag-tag { padding: 1px 7px; border-radius: 8px; font-weight: 600; }
        @media (max-width: 720px) {
          .ag-time { width: 66px; font-size: 11px; }
          .ag-item { padding: 10px; gap: 8px; }
        }
      `}</style>
    </div>
  );
}

const stateCss = `
  .ag-state {
    border: 1px solid var(--border); border-radius: 10px; background: var(--bg2);
    padding: 48px 20px; text-align: center;
  }
`;
