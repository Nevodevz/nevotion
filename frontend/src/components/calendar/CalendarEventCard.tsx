"use client";

import type { CalendarEvent, MeetingStatus } from "@/lib/types";
import { CALENDAR_SOURCE, MEETING_STATUS } from "@/lib/types";
import { formatTime } from "./layout";

/**
 * Colour for an event: its source, refined by CRM meeting status so closers can
 * read outcomes straight off the grid.
 */
export function eventColors(event: CalendarEvent): { color: string; bg: string } {
  const base = CALENDAR_SOURCE[event.source] ?? CALENDAR_SOURCE.task;
  if (event.source === "crm_meeting") {
    const st = MEETING_STATUS[event.status as MeetingStatus];
    if (st) return { color: st.color, bg: st.bg };
  }
  return { color: base.color, bg: base.bg };
}

export function eventStatusLabel(event: CalendarEvent): string {
  if (event.source === "crm_meeting") {
    return MEETING_STATUS[event.status as MeetingStatus]?.label ?? "";
  }
  return event.status === "done" ? "Выполнено" : "";
}

/** Person shown on the chip — the closer for CRM, the owner otherwise. */
export function eventPerson(event: CalendarEvent): string {
  if (event.source === "crm_meeting") return event.closer?.name ?? event.setter?.name ?? "";
  return event.owner?.name ?? "";
}

/**
 * Block rendered inside the day/week hour grid.
 *
 * `compact` is used when the block is too short to fit two lines.
 */
export function CalendarEventCard({
  event, onClick, compact = false, continuesFromPrevDay, continuesToNextDay,
}: {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
  compact?: boolean;
  continuesFromPrevDay?: boolean;
  continuesToNextDay?: boolean;
}) {
  const { color, bg } = eventColors(event);
  const done = event.status === "done";
  const person = eventPerson(event);

  return (
    <button
      type="button"
      className="cal-event"
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      title={`${formatTime(Date.parse(event.start))} ${event.title}${event.location ? ` · ${event.location}` : ""}`}
      style={{ background: bg, borderLeftColor: color, opacity: done ? 0.65 : 1 }}
    >
      <span className="cal-event-title" style={{ color, textDecoration: done ? "line-through" : "none" }}>
        {continuesFromPrevDay && "↑ "}
        {event.title}
        {continuesToNextDay && " ↓"}
      </span>
      {!compact && (
        <span className="cal-event-meta">
          {formatTime(Date.parse(event.start))}
          {event.location ? ` · ${event.location}` : ""}
          {person ? ` · ${person}` : ""}
        </span>
      )}

      <style jsx>{`
        .cal-event {
          width: 100%; height: 100%; overflow: hidden; text-align: left;
          border: none; border-left: 3px solid; border-radius: 5px;
          padding: 3px 6px; cursor: pointer; font-family: inherit;
          display: flex; flex-direction: column; gap: 1px; line-height: 1.25;
          transition: filter 0.13s;
        }
        .cal-event:hover { filter: brightness(0.96); }
        .cal-event:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
        .cal-event-title {
          font-size: 11px; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cal-event-meta {
          font-size: 10px; color: var(--text3);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
      `}</style>
    </button>
  );
}

/** Single-line variant used in the month cells and the all-day row. */
export function CalendarEventChip({
  event, onClick, showTime = true,
}: {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
  showTime?: boolean;
}) {
  const { color, bg } = eventColors(event);
  const done = event.status === "done";

  return (
    <button
      type="button"
      className="cal-chip"
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      title={event.title}
      style={{ background: bg, opacity: done ? 0.65 : 1 }}
    >
      <span className="cal-chip-dot" style={{ background: color }} />
      {showTime && !event.all_day && (
        <span className="cal-chip-time">{formatTime(Date.parse(event.start))}</span>
      )}
      <span className="cal-chip-title" style={{ textDecoration: done ? "line-through" : "none" }}>
        {event.title}
      </span>

      <style jsx>{`
        .cal-chip {
          display: flex; align-items: center; gap: 4px; width: 100%;
          padding: 2px 5px; border: none; border-radius: 4px; cursor: pointer;
          font-family: inherit; font-size: 11px; color: var(--text2);
          text-align: left; overflow: hidden; transition: filter 0.13s;
        }
        .cal-chip:hover { filter: brightness(0.95); }
        .cal-chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
        .cal-chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .cal-chip-time {
          font-size: 10px; color: var(--text3); flex-shrink: 0;
          font-family: "JetBrains Mono", monospace;
        }
        .cal-chip-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </button>
  );
}
