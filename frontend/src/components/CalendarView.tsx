"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Calendar } from "@/components/calendar/Calendar";
import { toLocalDateTimeKey } from "@/components/calendar/layout";
import { isCalendarView, useCalendarState } from "@/components/calendar/useCalendarState";
import { MeetingDetailModal } from "@/components/meetings/MeetingDetailModal";
import { TaskModal } from "@/components/TaskModal";
import { useApp } from "@/context/AppContext";
import { api, calendarApi, meetingApi } from "@/lib/api";
import type {
  Board, CalendarEvent, Meeting, Task, UserWithStats,
} from "@/lib/types";

/**
 * «Календарь» tab of «Мои задачи».
 *
 * Sources: personal tasks, personal meetings and CRM meetings where the user is
 * setter or closer. Clicking an empty slot creates a personal meeting; clicking
 * an event opens the matching card, never a generic page.
 */
export function CalendarView({ userId, isOwnCalendar }: { userId: number; isOwnCalendar: boolean }) {
  const { user } = useApp();
  const searchParams = useSearchParams();

  const cal = useCalendarState({
    storageKey: "my-tasks",
    initialMode: isCalendarView(searchParams.get("calendarView"))
      ? (searchParams.get("calendarView") as never)
      : null,
  });

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [board, setBoard] = useState<Board | null>(null);
  const [users, setUsers] = useState<UserWithStats[]>([]);

  // Task editing / creation
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [presetStart, setPresetStart] = useState<string | null>(null);

  // CRM meeting detail
  const [meeting, setMeeting] = useState<Meeting | null>(null);

  const { from, to } = cal.range;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Exactly the window the current view renders — no extra months.
      const data = await calendarApi.get({
        user_id: userId,
        date_from: new Date(from).toISOString(),
        date_to: new Date(to).toISOString(),
      });
      setEvents(data.events);
    } catch (e: unknown) {
      setError((e as Error).message || "Не удалось загрузить календарь");
    } finally {
      setLoading(false);
    }
  }, [userId, from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.getPersonalBoard(userId).then(setBoard).catch(() => {});
    api.listUsers().then(setUsers).catch(() => {});
  }, [userId]);

  const canCreate = isOwnCalendar && !!board;

  function openSlot(startMs: number) {
    if (!canCreate) return;
    setEditingTask(null);
    setPresetStart(toLocalDateTimeKey(startMs));
    setTaskModalOpen(true);
  }

  async function openEvent(event: CalendarEvent) {
    if (event.source === "crm_meeting" && event.meeting_id) {
      try {
        setMeeting(await meetingApi.get(event.meeting_id));
      } catch {
        setError("Не удалось открыть встречу");
      }
      return;
    }
    if (event.task_id) {
      try {
        const tasks = await api.listTasks(event.board_id ?? board!.id);
        const found = tasks.find((t) => t.id === event.task_id);
        if (found) {
          setEditingTask(found);
          setPresetStart(null);
          setTaskModalOpen(true);
        }
      } catch {
        setError("Не удалось открыть задачу");
      }
    }
  }

  return (
    <>
      <Calendar
        mode={cal.mode}
        anchor={cal.anchor}
        events={events}
        loading={loading}
        error={error}
        onModeChange={cal.setMode}
        onAnchorChange={cal.moveAnchor}
        onEventClick={openEvent}
        onSlotClick={canCreate ? openSlot : undefined}
        onRetry={load}
        visibleSources={cal.visibleSources}
        onToggleSource={cal.toggleSource}
        legendNote={
          canCreate ? (
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              Клик по свободному времени — создать личную встречу
            </span>
          ) : !isOwnCalendar ? (
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              Календарь сотрудника — только просмотр
            </span>
          ) : null
        }
      />

      {board && (
        <TaskModal
          open={taskModalOpen}
          onClose={() => { setTaskModalOpen(false); setPresetStart(null); }}
          onSaved={load}
          board={board}
          task={editingTask}
          defaultColumnId={board.columns[0]?.id ?? null}
          lockOwnerId={userId}
          users={users}
          // Prefills kind=meeting with the clicked date and time.
          presetMeetingStart={presetStart}
        />
      )}

      {meeting && (
        <MeetingDetailModal
          open
          meeting={meeting}
          closers={users}
          currentUser={users.find((u) => u.id === user?.id)}
          isAdmin={user?.role === "admin"}
          onClose={() => setMeeting(null)}
          onSaved={() => { load(); }}
          onDeleted={() => { setMeeting(null); load(); }}
          onStatusChanged={async (updated) => { setMeeting(updated); load(); }}
        />
      )}
    </>
  );
}
