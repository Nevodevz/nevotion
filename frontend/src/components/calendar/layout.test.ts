import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/types";
import {
  addDays,
  addMonths,
  allDayEvents,
  clipToDay,
  daysInRange,
  eventBounds,
  fromLocal,
  layoutDayEvents,
  occursOnDay,
  rangeFor,
  startOfLocalDay,
  startOfLocalWeek,
  stepAnchor,
  toLocalParts,
} from "./layout";

/** 2026-08-03 is a Monday — used as the reference day throughout. */
const DAY = fromLocal(2026, 8, 3);

function ev(
  id: string,
  startHM: [number, number],
  endHM: [number, number] | null,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  const start = fromLocal(2026, 8, 3, startHM[0], startHM[1]);
  const end = endHM ? fromLocal(2026, 8, 3, endHM[0], endHM[1]) : null;
  return {
    id,
    source: "crm_meeting",
    title: id,
    start: new Date(start).toISOString(),
    end: end === null ? null : new Date(end).toISOString(),
    all_day: false,
    location: "",
    description: "",
    status: "scheduled",
    editable: true,
    task_id: null,
    meeting_id: null,
    lead_id: null,
    board_id: null,
    owner: null,
    closer: null,
    setter: null,
    ...extra,
  };
}

// ─────────────────────────── Bishkek date maths ───────────────────────────

describe("Bishkek date helpers", () => {
  it("treats the day boundary as local midnight (UTC+6)", () => {
    // 2026-08-03 00:00 Bishkek is 2026-08-02 18:00 UTC.
    expect(new Date(DAY).toISOString()).toBe("2026-08-02T18:00:00.000Z");
  });

  it("keeps an 01:00 local event on the local day, not the UTC one", () => {
    const early = fromLocal(2026, 8, 3, 1, 0);
    expect(startOfLocalDay(early)).toBe(DAY);
    expect(toLocalParts(early).day).toBe(3);
  });

  it("starts weeks on Monday", () => {
    const wednesday = fromLocal(2026, 8, 5);
    expect(startOfLocalWeek(wednesday)).toBe(DAY);
    // A Sunday belongs to the week that began the previous Monday.
    const sunday = fromLocal(2026, 8, 9);
    expect(startOfLocalWeek(sunday)).toBe(DAY);
  });

  it("adds days and months across boundaries", () => {
    expect(toLocalParts(addDays(fromLocal(2026, 12, 31), 1)).year).toBe(2027);
    expect(toLocalParts(addMonths(fromLocal(2026, 1, 31), 1)).month).toBe(3); // JS overflow → 2 Mar
  });
});

// ───────────────────────────── Event bounds ───────────────────────────────

describe("eventBounds", () => {
  it("defaults to 60 minutes when the end is missing", () => {
    const { start, end } = eventBounds(ev("a", [10, 0], null));
    expect(end - start).toBe(60 * 60_000);
  });

  it("defaults to 60 minutes when the end is not after the start", () => {
    const broken = ev("a", [10, 0], [9, 0]);
    const { start, end } = eventBounds(broken);
    expect(end - start).toBe(60 * 60_000);
  });

  it("uses the real end when it is valid", () => {
    const { start, end } = eventBounds(ev("a", [10, 0], [12, 30]));
    expect(end - start).toBe(150 * 60_000);
  });
});

// ─────────────────────────── Day clipping ─────────────────────────────────

describe("clipToDay", () => {
  it("reports minutes from local midnight", () => {
    const clip = clipToDay(ev("a", [9, 30], [11, 0]), DAY);
    expect(clip.startMinute).toBe(570);
    expect(clip.endMinute).toBe(660);
    expect(clip.continuesFromPrevDay).toBe(false);
    expect(clip.continuesToNextDay).toBe(false);
  });

  it("clips an event running past midnight and flags the overflow", () => {
    const overnight = ev("night", [23, 0], null);
    // 23:00 + default 60m lands exactly on midnight — extend it explicitly.
    overnight.end = new Date(fromLocal(2026, 8, 4, 2, 0)).toISOString();

    const first = clipToDay(overnight, DAY);
    expect(first.startMinute).toBe(23 * 60);
    expect(first.endMinute).toBe(24 * 60);
    expect(first.continuesToNextDay).toBe(true);

    const second = clipToDay(overnight, addDays(DAY, 1));
    expect(second.startMinute).toBe(0);
    expect(second.endMinute).toBe(120);
    expect(second.continuesFromPrevDay).toBe(true);
  });

  it("counts an overnight event as occurring on both days", () => {
    const overnight = ev("night", [23, 0], null);
    overnight.end = new Date(fromLocal(2026, 8, 4, 2, 0)).toISOString();
    expect(occursOnDay(overnight, DAY)).toBe(true);
    expect(occursOnDay(overnight, addDays(DAY, 1))).toBe(true);
    expect(occursOnDay(overnight, addDays(DAY, 2))).toBe(false);
  });
});

// ───────────────────────── Overlap layout ─────────────────────────────────

describe("layoutDayEvents", () => {
  const widthOf = (r: ReturnType<typeof layoutDayEvents>, id: string) =>
    r.find((p) => p.event.id === id)!;

  it("gives a lone event the full width", () => {
    const [only] = layoutDayEvents([ev("a", [10, 0], [11, 0])], DAY);
    expect(only.left).toBe(0);
    expect(only.width).toBe(1);
  });

  it("places two fully overlapping events side by side, not stacked", () => {
    const result = layoutDayEvents(
      [ev("a", [10, 0], [11, 0]), ev("b", [10, 0], [11, 0])],
      DAY,
    );
    expect(result).toHaveLength(2);
    const lefts = result.map((r) => r.left).sort();
    expect(lefts).toEqual([0, 0.5]);
    expect(result.every((r) => r.width === 0.5)).toBe(true);
  });

  it("handles partial overlap", () => {
    const result = layoutDayEvents(
      [ev("a", [10, 0], [11, 0]), ev("b", [10, 30], [11, 30])],
      DAY,
    );
    expect(result.every((r) => r.width === 0.5)).toBe(true);
    expect(widthOf(result, "a").left).toBe(0);
    expect(widthOf(result, "b").left).toBe(0.5);
  });

  it("does not shrink events that merely touch end-to-start", () => {
    const result = layoutDayEvents(
      [ev("a", [10, 0], [11, 0]), ev("b", [11, 0], [12, 0])],
      DAY,
    );
    expect(result.every((r) => r.width === 1)).toBe(true);
  });

  it("keeps separate clusters at full width", () => {
    const result = layoutDayEvents(
      [
        ev("a", [9, 0], [10, 0]), ev("b", [9, 30], [10, 30]), // cluster 1
        ev("c", [15, 0], [16, 0]),                            // cluster 2
      ],
      DAY,
    );
    expect(widthOf(result, "c").width).toBe(1);
    expect(widthOf(result, "a").width).toBe(0.5);
  });

  it("splits three mutually overlapping events into thirds", () => {
    const result = layoutDayEvents(
      [
        ev("a", [10, 0], [12, 0]),
        ev("b", [10, 15], [11, 0]),
        ev("c", [10, 30], [11, 30]),
      ],
      DAY,
    );
    expect(result.every((r) => Math.abs(r.width - 1 / 3) < 1e-9)).toBe(true);
    expect(new Set(result.map((r) => r.left)).size).toBe(3);
  });

  it("reuses a freed column instead of narrowing everything", () => {
    // b ends before c starts, so c can take b's column: 2 columns, not 3.
    const result = layoutDayEvents(
      [
        ev("a", [10, 0], [13, 0]),
        ev("b", [10, 0], [11, 0]),
        ev("c", [11, 30], [12, 30]),
      ],
      DAY,
    );
    expect(result.every((r) => r.width === 0.5)).toBe(true);
    expect(widthOf(result, "b").left).toBe(widthOf(result, "c").left);
  });

  it("treats very short events as tall enough to collide", () => {
    // Two 5-minute events at the same instant must not sit on top of each other.
    const result = layoutDayEvents(
      [ev("a", [10, 0], [10, 5]), ev("b", [10, 0], [10, 5])],
      DAY,
    );
    expect(result.every((r) => r.width === 0.5)).toBe(true);
  });

  it("lays out events with no end using the default duration", () => {
    const result = layoutDayEvents(
      [ev("a", [10, 0], null), ev("b", [10, 30], null)],
      DAY,
    );
    // Both are 60 minutes long, so they overlap 10:30–11:00.
    expect(result.every((r) => r.width === 0.5)).toBe(true);
    expect(widthOf(result, "a").endMinute).toBe(11 * 60);
  });

  it("excludes all-day events from the time grid", () => {
    const allDay = ev("t", [0, 0], null, { all_day: true, source: "task" });
    expect(layoutDayEvents([allDay], DAY)).toHaveLength(0);
    expect(allDayEvents([allDay], DAY)).toHaveLength(1);
  });

  it("excludes events from other days", () => {
    expect(layoutDayEvents([ev("a", [10, 0], [11, 0])], addDays(DAY, 1))).toHaveLength(0);
  });
});

// ───────────────────────────── View ranges ────────────────────────────────

describe("rangeFor", () => {
  it("day covers exactly 24 hours", () => {
    const { from, to } = rangeFor("day", DAY);
    expect(to - from).toBe(24 * 3600 * 1000);
    expect(from).toBe(DAY);
  });

  it("week covers 7 days starting Monday", () => {
    const { from, to } = rangeFor("week", fromLocal(2026, 8, 6)); // a Thursday
    expect(from).toBe(DAY);
    expect(daysInRange(from, to)).toHaveLength(7);
  });

  it("month is padded to whole weeks and starts on a Monday", () => {
    const { from, to } = rangeFor("month", fromLocal(2026, 8, 15));
    expect(toLocalParts(from).weekday).toBe(0);
    const days = daysInRange(from, to);
    expect(days.length % 7).toBe(0);
    // The padded grid must contain every day of August.
    expect(days).toContain(fromLocal(2026, 8, 1));
    expect(days).toContain(fromLocal(2026, 8, 31));
  });

  it("agenda covers a fixed forward span", () => {
    const { from, to } = rangeFor("agenda", DAY);
    expect(from).toBe(DAY);
    expect(daysInRange(from, to)).toHaveLength(30);
  });

  it("never requests more than its own view needs", () => {
    // Guards the requirement that we do not over-fetch several months.
    const week = rangeFor("week", DAY);
    expect((week.to - week.from) / 86_400_000).toBe(7);
    const month = rangeFor("month", DAY);
    expect((month.to - month.from) / 86_400_000).toBeLessThanOrEqual(42);
  });
});

describe("stepAnchor", () => {
  it("moves by one day in day view", () => {
    expect(toLocalParts(stepAnchor("day", DAY, 1)).day).toBe(4);
    expect(toLocalParts(stepAnchor("day", DAY, -1)).day).toBe(2);
  });

  it("moves by one week in week view", () => {
    expect(stepAnchor("week", DAY, 1)).toBe(addDays(DAY, 7));
  });

  it("moves by one month in month view", () => {
    expect(toLocalParts(stepAnchor("month", DAY, 1)).month).toBe(9);
    expect(toLocalParts(stepAnchor("month", DAY, -1)).month).toBe(7);
  });
});
