"use client";

import { useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import type { CalendarEvent } from "@/lib/types";
import { CalendarEventChip } from "./CalendarEventCard";
import {
  MONTHS_NOMINATIVE, WEEKDAY_SHORT,
  allDayEvents, daysInRange, rangeFor, startOfLocalDay, startOfLocalMonth,
  timedEventsOnDay, toLocalParts,
} from "./layout";

/** Rows shown inside a day cell before collapsing into "+N". */
const MAX_VISIBLE = 3;

/**
 * Month grid with compact event rows (time · colour · short title) rather than
 * bare dots, plus a "+N" overflow that opens the full day list.
 *
 * Tasks with a due date arrive as all-day events and are listed first.
 */
export function MonthGrid({
  anchor, events, onEventClick, onSlotClick, loading,
}: {
  anchor: number;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  /** Clicking an empty day starts creating an event at midday on that date. */
  onSlotClick?: (startMs: number) => void;
  loading?: boolean;
}) {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const { days, monthNumber } = useMemo(() => {
    const { from, to } = rangeFor("month", anchor);
    return {
      days: daysInRange(from, to),
      monthNumber: toLocalParts(startOfLocalMonth(anchor)).month,
    };
  }, [anchor]);

  const byDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const day of days) {
      // All-day items (tasks) sit above timed events within the cell.
      map.set(day, [...allDayEvents(events, day), ...timedEventsOnDay(events, day)]);
    }
    return map;
  }, [days, events]);

  const today = startOfLocalDay(Date.now());
  const expandedEvents = expandedDay !== null ? (byDay.get(expandedDay) ?? []) : [];

  return (
    <div className="mg-root">
      <div className="mg-head">
        {WEEKDAY_SHORT.map((d) => <div key={d} className="mg-head-cell">{d}</div>)}
      </div>

      <div className="mg-grid">
        {days.map((day) => {
          const parts = toLocalParts(day);
          const dayEvents = byDay.get(day) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const hidden = dayEvents.length - visible.length;
          const outside = parts.month !== monthNumber;

          return (
            <div
              key={day}
              className={`mg-cell${outside ? " outside" : ""}${day === today ? " today" : ""}${onSlotClick ? " clickable" : ""}`}
              onClick={() => onSlotClick?.(day + 12 * 3600 * 1000)}
            >
              <div className="mg-daynum-row">
                <span className={`mg-daynum${day === today ? " today" : ""}`}>{parts.day}</span>
              </div>
              <div className="mg-events">
                {visible.map((e) => (
                  <CalendarEventChip key={e.id} event={e} onClick={onEventClick} />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    className="mg-more"
                    onClick={(e) => { e.stopPropagation(); setExpandedDay(day); }}
                  >
                    +{hidden}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div className="mg-loading">Загрузка…</div>}

      {expandedDay !== null && (
        <Modal
          open
          title={`${toLocalParts(expandedDay).day} ${MONTHS_NOMINATIVE[toLocalParts(expandedDay).month - 1]}`}
          onClose={() => setExpandedDay(null)}
          width={420}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {expandedEvents.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, padding: "12px 0" }}>Событий нет</div>
            ) : expandedEvents.map((e) => (
              <CalendarEventChip
                key={e.id}
                event={e}
                onClick={(ev) => { setExpandedDay(null); onEventClick(ev); }}
              />
            ))}
          </div>
        </Modal>
      )}

      <style jsx>{`
        .mg-root {
          border: 1px solid var(--border); border-radius: 10px;
          background: var(--bg2); overflow: hidden; position: relative;
        }
        .mg-head { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid var(--border); }
        .mg-head-cell {
          padding: 8px 4px; text-align: center; font-size: 10px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3);
        }
        .mg-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
        .mg-cell {
          min-height: 104px; border-left: 1px solid var(--border);
          border-top: 1px solid var(--border); padding: 4px;
          display: flex; flex-direction: column; gap: 3px; overflow: hidden;
        }
        .mg-cell:nth-child(7n + 1) { border-left: none; }
        .mg-cell.outside { background: var(--bg3); opacity: 0.6; }
        .mg-cell.today { background: var(--primary-dim); }
        .mg-cell.clickable { cursor: cell; }
        .mg-daynum-row { display: flex; justify-content: flex-end; }
        .mg-daynum { font-size: 12px; color: var(--text2); padding: 1px 4px; }
        .mg-daynum.today {
          background: var(--primary); color: #fff; border-radius: 50%;
          width: 20px; height: 20px; display: flex; align-items: center;
          justify-content: center; padding: 0;
        }
        .mg-events { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .mg-more {
          border: none; background: transparent; color: var(--primary);
          font-family: inherit; font-size: 10px; text-align: left;
          cursor: pointer; padding: 1px 5px;
        }
        .mg-more:hover { text-decoration: underline; }
        .mg-loading {
          position: absolute; top: 8px; right: 12px; font-size: 11px;
          color: var(--text3); background: var(--bg2); padding: 2px 8px; border-radius: 8px;
        }
        @media (max-width: 720px) {
          .mg-cell { min-height: 74px; padding: 2px; }
        }
      `}</style>
    </div>
  );
}
