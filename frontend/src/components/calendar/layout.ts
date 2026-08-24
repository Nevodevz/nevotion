/**
 * Calendar time-grid helpers.
 *
 * Kept free of React so the overlap layout — the part most likely to break — can
 * be unit-tested directly.
 *
 * All timestamps are UTC milliseconds; conversion to Asia/Bishkek happens in the
 * date helpers below, never inside the layout maths.
 */

import type { CalendarEvent } from "@/lib/types";
import { DEFAULT_MEETING_MINUTES } from "@/lib/types";

export const BISHKEK_OFFSET_MS = 6 * 3600 * 1000;
export const MINUTES_PER_DAY = 24 * 60;
/** Grid resolution: 30-minute rows. */
export const SLOT_MINUTES = 30;
/** Shortest visual height, so a 5-minute event stays readable and clickable. */
export const MIN_EVENT_MINUTES = 20;

// ────────────────────────── Bishkek date helpers ──────────────────────────
//
// The app renders one fixed zone (UTC+6, no DST), so shifting the epoch and
// reading UTC fields is exact and avoids depending on the browser's zone.

/** Local (Bishkek) civil fields for a UTC instant. */
export function toLocalParts(ms: number) {
  const d = new Date(ms + BISHKEK_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    /** 0 = Monday … 6 = Sunday */
    weekday: (d.getUTCDay() + 6) % 7,
  };
}

/** UTC instant for a Bishkek-local wall-clock time. */
export function fromLocal(
  year: number, month: number, day: number, hours = 0, minutes = 0,
): number {
  return Date.UTC(year, month - 1, day, hours, minutes) - BISHKEK_OFFSET_MS;
}

/** Midnight (Bishkek) that starts the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const p = toLocalParts(ms);
  return fromLocal(p.year, p.month, p.day);
}

export function addDays(ms: number, days: number): number {
  const p = toLocalParts(ms);
  // Going through civil fields keeps the wall-clock time stable.
  return fromLocal(p.year, p.month, p.day + days, p.hours, p.minutes);
}

export function addMonths(ms: number, months: number): number {
  const p = toLocalParts(ms);
  return fromLocal(p.year, p.month + months, p.day, p.hours, p.minutes);
}

/** Monday of the week containing `ms` — weeks start on Monday. */
export function startOfLocalWeek(ms: number): number {
  const p = toLocalParts(ms);
  return fromLocal(p.year, p.month, p.day - p.weekday);
}

export function startOfLocalMonth(ms: number): number {
  const p = toLocalParts(ms);
  return fromLocal(p.year, p.month, 1);
}

export function isSameLocalDay(a: number, b: number): boolean {
  return startOfLocalDay(a) === startOfLocalDay(b);
}

/** `YYYY-MM-DD` in Bishkek time (safe for <input type="date">). */
export function toLocalDateKey(ms: number): string {
  const p = toLocalParts(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM-DDTHH:mm` in Bishkek time (safe for <input type="datetime-local">). */
export function toLocalDateTimeKey(ms: number): string {
  const p = toLocalParts(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toLocalDateKey(ms)}T${pad(p.hours)}:${pad(p.minutes)}`;
}

/** Parse `YYYY-MM-DD` as Bishkek midnight. */
export function fromLocalDateKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return fromLocal(y, m, d);
}

export function formatTime(ms: number): string {
  const p = toLocalParts(ms);
  return `${String(p.hours).padStart(2, "0")}:${String(p.minutes).padStart(2, "0")}`;
}

// ───────────────────────────── Event geometry ─────────────────────────────

export interface PositionedEvent {
  event: CalendarEvent;
  /** Minutes from local midnight of the day being rendered. */
  startMinute: number;
  endMinute: number;
  /** Horizontal share within the day column, 0..1. */
  left: number;
  width: number;
  /** True when the event started on an earlier day (crossed midnight). */
  continuesFromPrevDay: boolean;
  /** True when the event runs past this day's midnight. */
  continuesToNextDay: boolean;
}

/** Event bounds in UTC ms, applying the default duration when `end` is absent. */
export function eventBounds(event: CalendarEvent): { start: number; end: number } {
  const start = Date.parse(event.start);
  const parsedEnd = event.end ? Date.parse(event.end) : NaN;
  // An event with no end (or a broken/inverted one) gets the default length so
  // it can never render as a zero-height sliver.
  const end =
    Number.isFinite(parsedEnd) && parsedEnd > start
      ? parsedEnd
      : start + DEFAULT_MEETING_MINUTES * 60_000;
  return { start, end };
}

/** Does the event intersect the given local day at all? */
export function occursOnDay(event: CalendarEvent, dayStart: number): boolean {
  const dayEnd = dayStart + 24 * 3600 * 1000;
  const { start, end } = eventBounds(event);
  return start < dayEnd && end > dayStart;
}

/**
 * Slice an event to one day and express it in minutes from that day's midnight.
 *
 * An event crossing midnight is clipped to the day, which is what lets it show
 * on both days rather than overflowing one of them.
 */
export function clipToDay(event: CalendarEvent, dayStart: number) {
  const dayEnd = dayStart + 24 * 3600 * 1000;
  const { start, end } = eventBounds(event);
  const clippedStart = Math.max(start, dayStart);
  const clippedEnd = Math.min(end, dayEnd);
  return {
    startMinute: Math.max(0, Math.round((clippedStart - dayStart) / 60_000)),
    endMinute: Math.min(MINUTES_PER_DAY, Math.round((clippedEnd - dayStart) / 60_000)),
    continuesFromPrevDay: start < dayStart,
    continuesToNextDay: end > dayEnd,
  };
}

/**
 * Lay out a day's timed events side by side instead of stacking them.
 *
 * Two passes:
 *   1. Split events into clusters of transitively overlapping events.
 *   2. Inside a cluster, greedily pack events into the first free column, then
 *      give every event `1 / columnCount` of the width.
 *
 * A short event still occupies `MIN_EVENT_MINUTES` for collision purposes, so
 * two 5-minute events at the same time do not visually cover each other.
 */
export function layoutDayEvents(
  events: CalendarEvent[],
  dayStart: number,
): PositionedEvent[] {
  const items = events
    .filter((e) => !e.all_day && occursOnDay(e, dayStart))
    .map((event) => {
      const clip = clipToDay(event, dayStart);
      return { event, ...clip };
    })
    // Earlier first; longer first on ties, so the wider block takes column 0.
    .sort((a, b) =>
      a.startMinute - b.startMinute ||
      (b.endMinute - b.startMinute) - (a.endMinute - a.startMinute) ||
      a.event.id.localeCompare(b.event.id),
    );

  if (items.length === 0) return [];

  /** Collision span — never shorter than MIN_EVENT_MINUTES. */
  const spanEnd = (i: typeof items[number]) =>
    Math.max(i.endMinute, i.startMinute + MIN_EVENT_MINUTES);

  const positioned: PositionedEvent[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;

    // Greedy column packing within the cluster.
    const columnEnds: number[] = [];
    const columnOf = new Map<string, number>();
    for (const item of cluster) {
      let col = columnEnds.findIndex((end) => end <= item.startMinute);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[col] = spanEnd(item);
      columnOf.set(item.event.id, col);
    }

    const total = columnEnds.length;
    for (const item of cluster) {
      const col = columnOf.get(item.event.id) ?? 0;
      positioned.push({
        event: item.event,
        startMinute: item.startMinute,
        endMinute: item.endMinute,
        continuesFromPrevDay: item.continuesFromPrevDay,
        continuesToNextDay: item.continuesToNextDay,
        left: col / total,
        width: 1 / total,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.startMinute >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, spanEnd(item));
  }
  flush();

  return positioned;
}

/** All-day events (and tasks) for a given day, in stable order. */
export function allDayEvents(events: CalendarEvent[], dayStart: number): CalendarEvent[] {
  return events
    .filter((e) => e.all_day && occursOnDay(e, dayStart))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Timed events intersecting a day, unpositioned (month/agenda use this). */
export function timedEventsOnDay(events: CalendarEvent[], dayStart: number): CalendarEvent[] {
  return events
    .filter((e) => !e.all_day && occursOnDay(e, dayStart))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

// ───────────────────────────── View ranges ────────────────────────────────

export type ViewMode = "day" | "week" | "month" | "agenda";

/** Number of days the agenda view spans. */
export const AGENDA_DAYS = 30;

/**
 * Exact [from, to) window for a view — this is what the API is asked for, so no
 * extra months are ever fetched.
 *
 * The month view is padded to whole weeks because its grid shows leading and
 * trailing days from the neighbouring months.
 */
export function rangeFor(mode: ViewMode, anchor: number): { from: number; to: number } {
  switch (mode) {
    case "day": {
      const from = startOfLocalDay(anchor);
      return { from, to: addDays(from, 1) };
    }
    case "week": {
      const from = startOfLocalWeek(anchor);
      return { from, to: addDays(from, 7) };
    }
    case "month": {
      const monthStart = startOfLocalMonth(anchor);
      const from = startOfLocalWeek(monthStart);
      const nextMonth = addMonths(monthStart, 1);
      // Extend to the end of the week containing the month's last day.
      const lastDay = addDays(nextMonth, -1);
      const to = addDays(startOfLocalWeek(lastDay), 7);
      return { from, to };
    }
    case "agenda": {
      const from = startOfLocalDay(anchor);
      return { from, to: addDays(from, AGENDA_DAYS) };
    }
  }
}

/** Step the anchor by one period in the given direction. */
export function stepAnchor(mode: ViewMode, anchor: number, direction: 1 | -1): number {
  switch (mode) {
    case "day":
      return addDays(anchor, direction);
    case "week":
      return addDays(anchor, 7 * direction);
    case "month":
      return addMonths(anchor, direction);
    case "agenda":
      return addDays(anchor, AGENDA_DAYS * direction);
  }
}

/** Every local day start in [from, to). */
export function daysInRange(from: number, to: number): number[] {
  const out: number[] = [];
  let cursor = startOfLocalDay(from);
  while (cursor < to) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Human label for the currently displayed range. */
export function rangeLabel(mode: ViewMode, anchor: number): string {
  const { from, to } = rangeFor(mode, anchor);
  const a = toLocalParts(from);

  if (mode === "day") {
    return `${a.day} ${MONTHS_GENITIVE[a.month - 1]} ${a.year}`;
  }
  if (mode === "month") {
    const m = toLocalParts(startOfLocalMonth(anchor));
    return `${MONTHS_NOMINATIVE[m.month - 1]} ${m.year}`;
  }
  const lastDay = toLocalParts(addDays(to, -1));
  if (a.month === lastDay.month) {
    return `${a.day}–${lastDay.day} ${MONTHS_GENITIVE[a.month - 1]} ${a.year}`;
  }
  const yearSuffix = a.year === lastDay.year ? `${a.year}` : `${a.year}–${lastDay.year}`;
  return `${a.day} ${MONTHS_GENITIVE[a.month - 1]} – ${lastDay.day} ${MONTHS_GENITIVE[lastDay.month - 1]} ${yearSuffix}`;
}

export { MONTHS_NOMINATIVE, MONTHS_GENITIVE };
