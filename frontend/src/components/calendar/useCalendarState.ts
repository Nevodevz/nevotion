"use client";

import { useCallback, useEffect, useState } from "react";

import type { CalendarSource, CalendarViewMode } from "@/lib/types";
import { CALENDAR_SOURCE_KEYS } from "@/lib/types";
import { rangeFor, startOfLocalDay, stepAnchor } from "./layout";

const VALID_MODES: CalendarViewMode[] = ["day", "week", "month", "agenda"];

export function isCalendarView(value: string | null): value is CalendarViewMode {
  return !!value && (VALID_MODES as string[]).includes(value);
}

/** Narrow screens default to a one-column view; wide screens to the week. */
function defaultMode(): CalendarViewMode {
  if (typeof window !== "undefined" && window.innerWidth < 720) return "day";
  return "week";
}

/**
 * View mode + anchor date + source visibility, shared by every calendar screen.
 *
 * The mode is mirrored into `?calendarView=` so it survives navigation — opening
 * an event and coming back must not reset the view.
 */
export function useCalendarState({
  storageKey, initialMode, availableSources = CALENDAR_SOURCE_KEYS, syncUrl = true,
}: {
  /** Distinguishes screens so they can keep independent view preferences. */
  storageKey: string;
  initialMode?: CalendarViewMode | null;
  availableSources?: CalendarSource[];
  syncUrl?: boolean;
} = { storageKey: "calendar" }) {
  const [mode, setMode] = useState<CalendarViewMode>(() => initialMode ?? "week");
  const [anchor, setAnchor] = useState<number>(() => startOfLocalDay(Date.now()));
  const [visibleSources, setVisibleSources] = useState<Record<CalendarSource, boolean>>(
    () => Object.fromEntries(CALENDAR_SOURCE_KEYS.map((s) => [s, true])) as Record<CalendarSource, boolean>,
  );

  // Pick the responsive default only when the URL did not specify one.
  useEffect(() => {
    if (!initialMode) setMode(defaultMode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep `?calendarView=` in step with the chosen mode.
  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("calendarView") === mode) return;
    url.searchParams.set("calendarView", mode);
    window.history.replaceState({}, "", url.toString());
  }, [mode, syncUrl]);

  const moveAnchor = useCallback((value: number, absolute?: boolean) => {
    setAnchor((prev) =>
      absolute ? startOfLocalDay(value) : stepAnchor(mode, prev, value >= 0 ? 1 : -1),
    );
  }, [mode]);

  const toggleSource = useCallback((source: CalendarSource) => {
    setVisibleSources((prev) => ({ ...prev, [source]: !prev[source] }));
  }, []);

  const range = rangeFor(mode, anchor);

  return {
    mode, setMode,
    anchor, setAnchor, moveAnchor,
    visibleSources, toggleSource,
    availableSources,
    range,
    storageKey,
  };
}
