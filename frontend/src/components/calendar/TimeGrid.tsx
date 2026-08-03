"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CalendarEvent } from "@/lib/types";
import { CalendarEventCard, CalendarEventChip } from "./CalendarEventCard";
import {
  MINUTES_PER_DAY, SLOT_MINUTES, WEEKDAY_SHORT,
  addDays, allDayEvents, isSameLocalDay, layoutDayEvents, startOfLocalDay,
  toLocalParts,
} from "./layout";

/** Pixels per hour — 48 keeps a 30-minute slot comfortably clickable. */
const HOUR_HEIGHT = 48;
const PX_PER_MINUTE = HOUR_HEIGHT / 60;
/** Opening scroll position, so the working day is visible immediately. */
const INITIAL_SCROLL_HOUR = 8;

const HOURS = Array.from({ length: 25 }, (_, i) => i); // 00:00 … 24:00

function nowMs() {
  return Date.now();
}

/**
 * Vertical hour grid shared by the «День» and «Неделя» views.
 *
 * Renders a fixed time gutter, per-day columns, a separate all-day row, the
 * current-time line, and events positioned by start/end with overlapping events
 * placed side by side.
 */
function TimeGrid({
  days, events, onEventClick, onSlotClick, loading,
}: {
  /** Local day starts (UTC ms) to render as columns. */
  days: number[];
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  /** Clicking empty space starts creating an event at that moment. */
  onSlotClick?: (startMs: number) => void;
  loading?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(nowMs);

  // Scroll to the working day once, on mount.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = INITIAL_SCROLL_HOUR * HOUR_HEIGHT;
    }
  }, []);

  // Keep the "now" line honest without re-rendering constantly.
  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 60_000);
    return () => clearInterval(t);
  }, []);

  const perDay = useMemo(
    () => days.map((day) => ({
      day,
      positioned: layoutDayEvents(events, day),
      allDay: allDayEvents(events, day),
    })),
    [days, events],
  );

  const hasAllDay = perDay.some((d) => d.allDay.length > 0);
  const today = startOfLocalDay(now);

  function handleSlotClick(day: number, e: React.MouseEvent<HTMLDivElement>) {
    if (!onSlotClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = (e.clientY - rect.top) / PX_PER_MINUTE;
    // Snap to the nearest 30-minute slot.
    const snapped = Math.max(
      0,
      Math.min(MINUTES_PER_DAY - SLOT_MINUTES, Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES),
    );
    onSlotClick(day + snapped * 60_000);
  }

  return (
    <div className="tg-root">
      {/* Day headers */}
      <div className="tg-head">
        <div className="tg-gutter tg-head-cell" />
        {days.map((day) => {
          const p = toLocalParts(day);
          const isToday = day === today;
          return (
            <div key={day} className={`tg-head-cell tg-day-head${isToday ? " today" : ""}`}>
              <span className="tg-dow">{WEEKDAY_SHORT[p.weekday]}</span>
              <span className={`tg-daynum${isToday ? " today" : ""}`}>{p.day}</span>
            </div>
          );
        })}
      </div>

      {/* All-day row — kept out of the hour grid */}
      {hasAllDay && (
        <div className="tg-allday">
          <div className="tg-gutter tg-allday-label">Весь день</div>
          {perDay.map(({ day, allDay }) => (
            <div key={day} className="tg-allday-cell">
              {allDay.map((e) => (
                <CalendarEventChip key={e.id} event={e} onClick={onEventClick} showTime={false} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable hour grid */}
      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="tg-gutter tg-times">
            {HOURS.slice(0, 24).map((h) => (
              <div key={h} className="tg-time" style={{ top: h * HOUR_HEIGHT }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
            <div className="tg-time" style={{ top: 24 * HOUR_HEIGHT }}>24:00</div>
          </div>

          {perDay.map(({ day, positioned }) => {
            const isToday = day === today;
            const nowMinutes = isToday ? (now - day) / 60_000 : null;
            return (
              <div
                key={day}
                className={`tg-col${isToday ? " today" : ""}${onSlotClick ? " clickable" : ""}`}
                onClick={(e) => handleSlotClick(day, e)}
              >
                {/* 30-minute rules */}
                {HOURS.slice(0, 24).map((h) => (
                  <div key={h}>
                    <div className="tg-line hour" style={{ top: h * HOUR_HEIGHT }} />
                    <div className="tg-line half" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  </div>
                ))}

                {positioned.map((p) => {
                  const top = p.startMinute * PX_PER_MINUTE;
                  const rawHeight = (p.endMinute - p.startMinute) * PX_PER_MINUTE;
                  // Floor the height so a very short event stays readable.
                  const height = Math.max(rawHeight, 18);
                  return (
                    <div
                      key={p.event.id}
                      className="tg-event"
                      style={{
                        top,
                        height,
                        left: `calc(${p.left * 100}% + 2px)`,
                        width: `calc(${p.width * 100}% - 4px)`,
                      }}
                    >
                      <CalendarEventCard
                        event={p.event}
                        onClick={onEventClick}
                        compact={height < 34}
                        continuesFromPrevDay={p.continuesFromPrevDay}
                        continuesToNextDay={p.continuesToNextDay}
                      />
                    </div>
                  );
                })}

                {nowMinutes !== null && nowMinutes >= 0 && nowMinutes <= MINUTES_PER_DAY && (
                  <div className="tg-now" style={{ top: nowMinutes * PX_PER_MINUTE }}>
                    <span className="tg-now-dot" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {loading && <div className="tg-loading">Загрузка…</div>}

      <style jsx>{`
        .tg-root {
          border: 1px solid var(--border); border-radius: 10px;
          background: var(--bg2); overflow: hidden; position: relative;
        }
        .tg-head, .tg-allday, .tg-body {
          display: grid;
          grid-template-columns: var(--gutter) repeat(${days.length}, minmax(var(--daymin), 1fr));
        }
        .tg-root { --gutter: 56px; --daymin: ${days.length > 1 ? "108px" : "0"}; }
        .tg-head { border-bottom: 1px solid var(--border); background: var(--bg2); }
        .tg-head-cell { padding: 8px 4px; }
        .tg-day-head {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          border-left: 1px solid var(--border);
        }
        .tg-dow {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
          color: var(--text3); font-weight: 600;
        }
        .tg-daynum { font-size: 16px; font-weight: 600; color: var(--text2); }
        .tg-daynum.today {
          background: var(--primary); color: #fff; border-radius: 50%;
          width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
        }
        .tg-allday { border-bottom: 1px solid var(--border); background: var(--bg3); max-height: 88px; overflow-y: auto; }
        .tg-allday-label {
          font-size: 10px; color: var(--text3); padding: 6px; text-align: right;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .tg-allday-cell {
          border-left: 1px solid var(--border); padding: 4px;
          display: flex; flex-direction: column; gap: 3px; min-height: 26px;
        }
        .tg-scroll { max-height: 62vh; overflow-y: auto; overflow-x: auto; }
        .tg-body { position: relative; }
        .tg-times { position: relative; }
        .tg-time {
          position: absolute; right: 6px; transform: translateY(-50%);
          font-size: 10px; color: var(--text3); font-family: "JetBrains Mono", monospace;
          white-space: nowrap;
        }
        .tg-col { position: relative; border-left: 1px solid var(--border); }
        .tg-col.today { background: var(--primary-dim); }
        .tg-col.clickable { cursor: cell; }
        .tg-line { position: absolute; left: 0; right: 0; pointer-events: none; }
        .tg-line.hour { border-top: 1px solid var(--border); }
        .tg-line.half { border-top: 1px dashed var(--border); opacity: 0.45; }
        .tg-event { position: absolute; z-index: 2; }
        .tg-now { position: absolute; left: 0; right: 0; height: 0; border-top: 2px solid var(--red); z-index: 3; pointer-events: none; }
        .tg-now-dot {
          position: absolute; left: -4px; top: -4px; width: 8px; height: 8px;
          border-radius: 50%; background: var(--red);
        }
        .tg-loading {
          position: absolute; top: 8px; right: 12px; font-size: 11px;
          color: var(--text3); background: var(--bg2); padding: 2px 8px; border-radius: 8px;
        }
        @media (max-width: 720px) {
          .tg-root { --gutter: 44px; --daymin: ${days.length > 1 ? "88px" : "0"}; }
          .tg-scroll { max-height: 70vh; }
        }
      `}</style>
    </div>
  );
}

/** Single-day hour grid. */
export function DayTimeGrid({
  day, events, onEventClick, onSlotClick, loading,
}: {
  day: number;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick?: (startMs: number) => void;
  loading?: boolean;
}) {
  return (
    <TimeGrid
      days={[startOfLocalDay(day)]}
      events={events}
      onEventClick={onEventClick}
      onSlotClick={onSlotClick}
      loading={loading}
    />
  );
}

/** Seven-day hour grid, Monday first. Scrolls horizontally on small screens. */
export function WeekTimeGrid({
  weekStart, events, onEventClick, onSlotClick, loading,
}: {
  weekStart: number;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick?: (startMs: number) => void;
  loading?: boolean;
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfLocalDay(weekStart), i)),
    [weekStart],
  );
  return (
    <TimeGrid
      days={days}
      events={events}
      onEventClick={onEventClick}
      onSlotClick={onSlotClick}
      loading={loading}
    />
  );
}

export { isSameLocalDay };
