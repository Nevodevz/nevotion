"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Select } from "@/components/ui";
import { Calendar } from "@/components/calendar/Calendar";
import { toLocalDateTimeKey } from "@/components/calendar/layout";
import { useCalendarState } from "@/components/calendar/useCalendarState";
import { DEFAULT_MEETING_MINUTES } from "@/lib/types";
import { api, meetingApi } from "@/lib/api";
import type {
  CalendarEvent, Department, Meeting, MeetingStatus, UserWithStats,
} from "@/lib/types";
import { MEETING_STATUS, MEETING_STATUS_KEYS } from "@/lib/types";
import { MeetingDetailModal } from "./MeetingDetailModal";
import { MeetingModal } from "./MeetingModal";

const CLOSER_POSITIONS = new Set(["Клоузер", "Финансовый директор"]);
const SETTER_POSITIONS = new Set(["Сеттер", "Руководитель продаж"]);

export const isCloser = (position: string) => CLOSER_POSITIONS.has(position);
const isSetter = (position: string) => SETTER_POSITIONS.has(position);

/** CRM meetings become calendar events, reusing the shared event shape. */
function toEvent(m: Meeting): CalendarEvent {
  const start = Date.parse(m.meeting_date);
  const end = start + (m.duration_minutes || DEFAULT_MEETING_MINUTES) * 60_000;
  return {
    id: `meeting-${m.id}`,
    source: "crm_meeting",
    title: m.client_name,
    start: m.meeting_date,
    end: new Date(end).toISOString(),
    all_day: false,
    location: m.address || "",
    description: m.notes || "",
    status: m.status,
    editable: true,
    task_id: null,
    meeting_id: m.id,
    lead_id: m.lead_id,
    board_id: null,
    owner: null,
    closer: m.closer,
    setter: m.setter,
  };
}

/**
 * Sales department meetings calendar.
 *
 * Same calendar core as «Мои задачи» — only the data source, the filters and
 * the create action differ. Filters double as a reporting view for closers.
 */
export function SalesMeetingsCalendar({
  dept, isAdmin, currentUser,
}: {
  dept: Department;
  isAdmin: boolean;
  currentUser: UserWithStats | undefined;
}) {
  const cal = useCalendarState({
    storageKey: "sales-meetings",
    availableSources: ["crm_meeting"],
    // The personal calendar owns `?calendarView=`; this one keeps local state.
    syncUrl: false,
  });

  const [members, setMembers] = useState<UserWithStats[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCloser, setFilterCloser] = useState("");
  const [filterSetter, setFilterSetter] = useState("");
  const [filterStatus, setFilterStatus] = useState<MeetingStatus | "">("");

  const [createOpen, setCreateOpen] = useState(false);
  const [presetStart, setPresetStart] = useState<string | null>(null);
  const [selected, setSelected] = useState<Meeting | null>(null);

  const closers = useMemo(() => members.filter((u) => isCloser(u.position)), [members]);
  const setters = useMemo(() => members.filter((u) => isSetter(u.position)), [members]);

  const canCreate = isAdmin
    || currentUser?.position === "Сеттер"
    || currentUser?.position === "Руководитель продаж";

  const { from, to } = cal.range;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ask only for the window the current view shows.
      const data = await meetingApi.list({
        date_from: new Date(from).toISOString(),
        date_to: new Date(to).toISOString(),
        closer_id: filterCloser ? Number(filterCloser) : undefined,
        setter_id: filterSetter ? Number(filterSetter) : undefined,
        status: filterStatus || undefined,
        parent_only: false,
        limit: 1000,
      });
      setMeetings(data);
    } catch (e: unknown) {
      setError((e as Error).message || "Не удалось загрузить встречи");
    } finally {
      setLoading(false);
    }
  }, [from, to, filterCloser, filterSetter, filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.listUsers(dept.id).then(setMembers).catch(() => {});
  }, [dept.id]);

  const events = useMemo(() => meetings.map(toEvent), [meetings]);

  // Status counts for the period — the reporting side of the filters.
  const counts = useMemo(() => {
    const acc = Object.fromEntries(MEETING_STATUS_KEYS.map((k) => [k, 0])) as Record<MeetingStatus, number>;
    for (const m of meetings) acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, [meetings]);

  function openSlot(startMs: number) {
    if (!canCreate) return;
    setPresetStart(toLocalDateTimeKey(startMs));
    setCreateOpen(true);
  }

  async function openEvent(event: CalendarEvent) {
    if (!event.meeting_id) return;
    const local = meetings.find((m) => m.id === event.meeting_id);
    if (local) { setSelected(local); return; }
    try {
      setSelected(await meetingApi.get(event.meeting_id));
    } catch {
      setError("Не удалось открыть встречу");
    }
  }

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div className="section-label">Календарь встреч</div>
        {canCreate && (
          <Button icon="add" onClick={() => { setPresetStart(null); setCreateOpen(true); }}>
            Встреча
          </Button>
        )}
      </div>

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
        availableSources={["crm_meeting"]}
        filters={
          <>
            <div style={{ minWidth: 150 }}>
              <Select value={filterCloser} onChange={(e) => setFilterCloser(e.target.value)}>
                <option value="">Все клоузеры</option>
                {closers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
            <div style={{ minWidth: 150 }}>
              <Select value={filterSetter} onChange={(e) => setFilterSetter(e.target.value)}>
                <option value="">Все сеттеры</option>
                {setters.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
            <div style={{ minWidth: 150 }}>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as MeetingStatus | "")}>
                <option value="">Все статусы</option>
                {MEETING_STATUS_KEYS.map((s) => (
                  <option key={s} value={s}>{MEETING_STATUS[s].label}</option>
                ))}
              </Select>
            </div>
          </>
        }
        legendNote={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
            <span style={{ color: "var(--text3)" }}>За период: {meetings.length}</span>
            {MEETING_STATUS_KEYS.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} style={{ color: MEETING_STATUS[s].color }}>
                {MEETING_STATUS[s].label}: <strong>{counts[s]}</strong>
              </span>
            ))}
          </div>
        }
      />

      <MeetingModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setPresetStart(null); }}
        onSaved={load}
        closers={closers}
        defaultStart={presetStart}
      />

      {selected && (
        <MeetingDetailModal
          open
          meeting={selected}
          closers={closers}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onSaved={load}
          onDeleted={() => { setSelected(null); load(); }}
          onStatusChanged={(updated) => setSelected(updated)}
        />
      )}
    </div>
  );
}
