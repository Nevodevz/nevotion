"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { UserModal } from "@/components/UserModal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { api, meetingApi } from "@/lib/api";
import {
  Department, UserWithStats, SalesRecord, ColumnDef,
  Meeting, MeetingStatus, MEETING_STATUS, SalesSummary,
} from "@/lib/types";
import { Button, Input, Select, Textarea, FormField, DateRangePicker, ConfirmModal } from "@/components/ui";

// Positions that count as a "closer" — keep in sync with backend _CLOSER_POSITIONS
const CLOSER_POSITIONS = ["Клоузер", "Финансовый директор"];
const isCloser = (position: string | undefined | null) => !!position && CLOSER_POSITIONS.includes(position);

// ============================= SETTERS TABLE =============================
function SettersSection({ dept, departments, isAdmin, currentUserId, onOpenMeetings }: {
  dept: Department; departments: Department[]; isAdmin: boolean; currentUserId?: number;
  onOpenMeetings?: (u?: UserWithStats) => void;
}) {
  const toast = useToast();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;
  const [fUser, setFUser] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [recModal, setRecModal] = useState(false);
  const [editingRec, setEditingRec] = useState<SalesRecord | null>(null);
  const [userModal, setUserModal] = useState(false);
  const [colModal, setColModal] = useState(false);
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null);

  const loadRecords = useCallback(async (off = 0) => {
    const r = await api.salesRecords({
      user_id: fUser ? Number(fUser) : undefined,
      date_from: fFrom || undefined,
      date_to: fTo || undefined,
    });
    // client-side simulate pagination from full results
    setRecords(r.slice(0, off + LIMIT));
    setHasMore(r.length > off + LIMIT);
  }, [fUser, fFrom, fTo]);

  useEffect(() => { api.listUsers(dept.id).then(setUsers).catch(() => {}); api.salesColumns().then(setColumns).catch(() => {}); }, [dept.id]);
  useEffect(() => { setOffset(0); loadRecords(0); }, [loadRecords]);

  const setters = users.filter((u) => u.position === "Сеттер" || u.position === "Руководитель продаж");

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div><div className="section-label">Сеттеры</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && <Button variant="ghost" icon="view_column" onClick={() => setColModal(true)}>Колонки</Button>}
          {isAdmin && <Button variant="ghost" icon="person_add" onClick={() => setUserModal(true)} />}
          {currentUserId && setters.find((u) => u.id === currentUserId) && (
            <Button variant="ghost" icon="calendar_month" onClick={() => onOpenMeetings?.(setters.find((u) => u.id === currentUserId))}>
              Мои встречи
            </Button>
          )}
          <Button icon="add" onClick={() => { setEditingRec(null); setRecModal(true); }}>Запись</Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 150 }}>
          <Select value={fUser} onChange={(e) => setFUser(e.target.value)}>
            <option value="">Все</option>
            {setters.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>
        <DateRangePicker
          value={{ from: fFrom, to: fTo }}
          onChange={v => { setFFrom(v.from); setFTo(v.to); }}
          onReset={() => { setFFrom(""); setFTo(""); }}
        />
        {(fUser || fFrom || fTo) && (
          <Button variant="ghost" onClick={() => { setFUser(""); setFFrom(""); setFTo(""); }}>Сбросить</Button>
        )}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Дата</th><th>Сотрудник</th>
                {columns.map((c) => <th key={c.id} style={{ textAlign: "right" }}>{c.label}</th>)}
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} onClick={() => { if (isAdmin || r.user_id === currentUserId) { setEditingRec(r); setRecModal(true); } }}
                  style={{ cursor: (isAdmin || r.user_id === currentUserId) ? "pointer" : "default" }}>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{fmtDate(r.record_date)}</td>
                  <td>{r.user ? (
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 7, cursor: (isAdmin || r.user_id === currentUserId) ? "pointer" : "default" }}
                      onClick={(e) => {
                        if (isAdmin || r.user_id === currentUserId) {
                          e.stopPropagation();
                          const u = setters.find((s) => s.id === r.user_id);
                          onOpenMeetings?.(u);
                        }
                      }}
                      title={(isAdmin || r.user_id === currentUserId) ? "Посмотреть встречи" : undefined}
                    >
                      <Avatar name={r.user.name} color={r.user.avatar_color} size={22} /> {r.user.name}
                      {(isAdmin || r.user_id === currentUserId) && (
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: "var(--primary)", opacity: 0.7 }}>open_in_new</span>
                      )}
                    </span>
                  ) : "—"}</td>
                  {columns.map((c) => <td key={c.id} style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "var(--text)" }}>{r.metrics[c.key] ?? "—"}</td>)}
                  {isAdmin && (
                    <td>
                      <button className="row-act" onClick={(e) => { e.stopPropagation(); setDeleteRecordId(r.id); }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={columns.length + 3} style={{ textAlign: "center", color: "var(--text3)", padding: "30px 20px", fontSize: 14 }}>Нет записей</td></tr>}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <button onClick={() => { const n = offset + LIMIT; setOffset(n); loadRecords(n); }}
            className="load-more-btn">Загрузить ещё</button>
        )}
      </div>

      <SalesRecordModal open={recModal} onClose={() => setRecModal(false)} onSaved={() => loadRecords(0)}
        record={editingRec} columns={columns} staff={setters} isAdmin={isAdmin} currentUserId={currentUserId} />
      <ColumnsModal open={colModal} onClose={() => setColModal(false)} onSaved={() => api.salesColumns().then(setColumns)}
        columns={columns} addFn={api.addSalesColumn} delFn={api.deleteSalesColumn} reorderFn={api.reorderSalesColumn} />
      <UserModal open={userModal} onClose={() => setUserModal(false)} onSaved={() => api.listUsers(dept.id).then(setUsers)}
        user={null} departments={departments} defaultDeptId={dept.id} />
      <ConfirmModal
        open={deleteRecordId !== null}
        title="Удалить запись?"
        message="Запись будет удалена без возможности восстановления."
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={async () => {
          if (deleteRecordId !== null) {
            await api.deleteSalesRecord(deleteRecordId).catch(() => {});
            setDeleteRecordId(null);
            loadRecords();
          }
        }}
        onCancel={() => setDeleteRecordId(null)}
      />
    </div>
  );
}

// ============================= CALENDAR =============================
const DAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function MeetingsCalendar({ dept, departments, isAdmin, currentUser }: {
  dept: Department; departments: Department[]; isAdmin: boolean; currentUser: UserWithStats | undefined;
}) {
  const toast = useToast();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [filterCloser, setFilterCloser] = useState<number | null>(null);
  const [closers, setClosers] = useState<UserWithStats[]>([]);
  const [meetingModal, setMeetingModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [userModal, setUserModal] = useState(false);

  const canCreate = isAdmin || currentUser?.position === "Сеттер" || currentUser?.position === "Руководитель продаж";

  const load = useCallback(async () => {
    const PAGE = 200; // backend max page size
    let offset = 0;
    let all: Meeting[] = [];
    try {
      while (true) {
        const page = await meetingApi.list({ year, month, closer_id: filterCloser ?? undefined, offset, limit: PAGE });
        all = all.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }
      setMeetings(all);
    } catch {}
  }, [year, month, filterCloser]);

  useEffect(() => {
    api.listUsers(dept.id).then((us) => setClosers(us.filter((u) => isCloser(u.position)))).catch(() => {});
  }, [dept.id]);
  useEffect(() => { load(); }, [load]);

  // build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // Mon=0

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // group meetings by day in Bishkek local time, keeping only the displayed month/year
  const byDay: Record<number, Meeting[]> = {};
  for (const m of meetings) {
    const local = utcToLocal(m.meeting_date);
    const localY = parseInt(local.slice(0, 4), 10);
    const localMo = parseInt(local.slice(5, 7), 10);
    const localD = parseInt(local.slice(8, 10), 10);
    if (localY === year && localMo === month) {
      if (!byDay[localD]) byDay[localD] = [];
      byDay[localD].push(m);
    }
  }

  // selected day meetings
  const dayMeetings = selectedDay ? (byDay[selectedDay] ?? []) : [];

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  async function changeStatus(m: Meeting, s: MeetingStatus) {
    try {
      await meetingApi.setStatus(m.id, s);
      toast("Статус обновлён");
      load();
      // refresh detail
      const updated = await meetingApi.get(m.id);
      setSelectedMeeting(updated);
    } catch (e: any) { toast(e.message, "error"); }
  }

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="section-label">Клоузеры — Встречи</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 160 }}>
            <Select value={filterCloser ?? ""} onChange={(e) => setFilterCloser(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Все клоузеры</option>
              {closers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          {isAdmin && <Button variant="ghost" icon="person_add" onClick={() => setUserModal(true)} />}
          {canCreate && <Button icon="add" onClick={() => setMeetingModal(true)}>Встреча</Button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        {/* Calendar grid */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button className="icon-btn" onClick={prevMonth}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span></button>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{MONTHS_RU[month - 1]} {year}</span>
            <button className="icon-btn" onClick={nextMonth}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span></button>
          </div>
          <div className="cal-grid">
            {DAYS.map((d) => <div key={d} className="cal-header">{d}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
              const isSel = day === selectedDay;
              const dayMs = byDay[day] ?? [];
              return (
                <div key={day} className={`cal-cell ${isSel ? "sel" : ""} ${isToday ? "today" : ""}`} onClick={() => setSelectedDay(day)}>
                  <span className="cal-num">{day}</span>
                  <div className="cal-dots">
                    {dayMs.slice(0, 3).map((m) => (
                      <span key={m.id} className="cal-dot" style={{ background: MEETING_STATUS[m.status].color }} />
                    ))}
                    {dayMs.length > 3 && <span className="cal-more">+{dayMs.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {selectedDay ? `${selectedDay} ${MONTHS_RU[month - 1]}` : "Выберите день"}
          </div>
          <div style={{ overflowY: "auto", maxHeight: 380 }}>
            {dayMeetings.length === 0 ? (
              <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>Нет встреч</div>
            ) : dayMeetings.map((m) => {
              const st = MEETING_STATUS[m.status];
              return (
                <div key={m.id} className="meeting-row" onClick={() => { setSelectedMeeting(m); setDetailModal(true); }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{m.client_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                      {fmtTime(m.meeting_date)} · {m.closer?.name ?? "—"} · {m.address || "—"}
                    </div>
                    <span className="status-chip" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  {m.sub_meetings?.length > 0 && (
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--text3)" }} title={`${m.sub_meetings.length} подвстреч`}>account_tree</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create meeting modal */}
      <MeetingModal open={meetingModal} onClose={() => setMeetingModal(false)} onSaved={load}
        closers={closers} defaultDate={selectedDay ? new Date(year, month - 1, selectedDay) : new Date()} />

      {/* Detail/edit modal */}
      {selectedMeeting && (
        <MeetingDetailModal open={detailModal} onClose={() => setDetailModal(false)}
          onSaved={() => { load(); }}
          onDeleted={() => { setDetailModal(false); setSelectedMeeting(null); load(); }}
          meeting={selectedMeeting} closers={closers} currentUser={currentUser} isAdmin={isAdmin}
          onStatusChange={changeStatus} />
      )}

      <UserModal open={userModal} onClose={() => setUserModal(false)} onSaved={() => api.listUsers(dept.id).then((us) => setClosers(us.filter((u) => isCloser(u.position))))}
        user={null} departments={departments} defaultDeptId={dept.id} />

      <CalendarStyles />
    </div>
  );
}

// ============================= SUMMARY =============================
function SummarySection() {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const load = useCallback(() => {
    meetingApi.summary({ date_from: fFrom || undefined, date_to: fTo || undefined }).then(setSummary).catch(() => {});
  }, [fFrom, fTo]);
  useEffect(() => { load(); }, [load]);

  const STATUS_KEYS: MeetingStatus[] = ["scheduled","closed","minus","push","rescheduled"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="section-label">Общая сводка отдела</div>
        <DateRangePicker
          value={{ from: fFrom, to: fTo }}
          onChange={v => { setFFrom(v.from); setFTo(v.to); }}
          onReset={() => { setFFrom(""); setFTo(""); }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Setter summary */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Сеттеры</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Сотрудник</th>{(summary?.col_defs ?? []).map((c) => <th key={c.key} style={{ textAlign: "right" }}>{c.label}</th>)}</tr></thead>
              <tbody>
                {(summary?.setters ?? []).map((s, i) => (
                  <tr key={i}>
                    <td>{s.user ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar name={s.user.name} color={s.user.avatar_color} size={22} /> {s.user.name}</span> : "—"}</td>
                    {(summary?.col_defs ?? []).map((c) => <td key={c.key} style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{s.totals[c.key] ?? 0}</td>)}
                  </tr>
                ))}
                {!summary?.setters?.length && <tr><td colSpan={99} style={{ textAlign: "center", color: "var(--text3)", padding: 20 }}>Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Closer summary */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Клоузеры</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Клоузер</th><th style={{ textAlign: "right" }}>Всего</th>{STATUS_KEYS.map((s) => <th key={s} style={{ textAlign: "right", color: MEETING_STATUS[s].color }}>{MEETING_STATUS[s].label}</th>)}</tr></thead>
              <tbody>
                {(summary?.closers ?? []).map((c, i) => (
                  <tr key={i}>
                    <td>{c.user ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar name={c.user.name} color={c.user.avatar_color} size={22} /> {c.user.name}</span> : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>{c.total}</td>
                    {STATUS_KEYS.map((s) => <td key={s} style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: MEETING_STATUS[s].color }}>{c.counts[s] ?? 0}</td>)}
                  </tr>
                ))}
                {!summary?.closers?.length && <tr><td colSpan={99} style={{ textAlign: "center", color: "var(--text3)", padding: 20 }}>Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================= MAIN EXPORT =============================
export function SalesDepartmentView({ dept, departments }: { dept: Department; departments: Department[] }) {
  const { isAdmin, user } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<UserWithStats | undefined>();
  const [allUsers, setAllUsers] = useState<UserWithStats[]>([]);
  const [meetingsModal, setMeetingsModal] = useState(false);
  const [meetingsInitUser, setMeetingsInitUser] = useState<UserWithStats | null>(null);

  useEffect(() => { if (user) api.getUser(user.id).then(setCurrentUser).catch(() => {}); }, [user]);
  useEffect(() => { api.listUsers(dept.id).then(setAllUsers).catch(() => {}); }, [dept.id]);
  useEffect(() => { if (searchParams.get("meetings") === "1") openMeetings(); }, [searchParams]);

  function openMeetings(u?: UserWithStats) {
    setMeetingsInitUser(u ?? null);
    setMeetingsModal(true);
  }

  function closeMeetings() {
    setMeetingsModal(false);
    setMeetingsInitUser(null);
    if (searchParams.get("meetings") === "1") router.replace("/dept/sales");
  }

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="page-h1">Отдел продаж</div>
        <Button variant="ghost" icon="table_view" onClick={() => openMeetings()}>Встречи</Button>
      </div>
      <SettersSection dept={dept} departments={departments} isAdmin={isAdmin} currentUserId={user?.id}
        onOpenMeetings={openMeetings} />
      <MeetingsCalendar dept={dept} departments={departments} isAdmin={isAdmin} currentUser={currentUser} />
      <SummarySection />
      {meetingsModal && (
        <MeetingsTableModal
          onClose={closeMeetings}
          allUsers={allUsers}
          initUser={meetingsInitUser}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}
      <TableStyles />
    </div>
  );
}

// ============================= MEETINGS TABLE MODAL =============================
const STATUS_KEYS_ALL: MeetingStatus[] = ["scheduled", "closed", "minus", "push", "rescheduled"];

function periodRange(period: "day" | "week" | "month"): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (period === "day") { const t = iso(now); return { from: t, to: t }; }
  if (period === "week") {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now); mon.setDate(now.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: iso(mon), to: iso(sun) };
  }
  return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: iso(now) };
}

function MeetingsTableModal({ onClose, allUsers, initUser, currentUser, isAdmin }: {
  onClose: () => void;
  allUsers: UserWithStats[];
  initUser: UserWithStats | null;
  currentUser: UserWithStats | undefined;
  isAdmin: boolean;
}) {
  const setters = allUsers.filter((u) => u.position === "Сеттер" || u.position === "Руководитель продаж");
  const closers = allUsers.filter((u) => isCloser(u.position));

  const [period, setPeriod] = useState<"day" | "week" | "month" | "custom">("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterStatus, setFilterStatus] = useState<MeetingStatus | "">("");
  const [filterRole, setFilterRole] = useState<"setter" | "closer" | "all">(() => {
    if (!initUser) return "all";
    const pos = initUser.position;
    if (isCloser(pos)) return "closer";
    return "setter";
  });
  const [filterUserId, setFilterUserId] = useState<string>(() => initUser ? String(initUser.id) : "");

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const LIMIT = 100;

  const { from, to } = period === "custom"
    ? { from: customFrom, to: customTo }
    : periodRange(period);

  function handleRoleChange(r: "setter" | "closer" | "all") {
    setFilterRole(r);
    setFilterUserId("");
  }

  const userListForRole = filterRole === "setter" ? setters : filterRole === "closer" ? closers : [];

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params: Parameters<typeof meetingApi.list>[0] = {
        date_from: from || undefined,
        date_to: to || undefined,
        limit: LIMIT,
        offset: off,
      };
      if (filterUserId) {
        const uid = Number(filterUserId);
        if (filterRole === "setter") params.setter_id = uid;
        else if (filterRole === "closer") params.closer_id = uid;
      }
      const data = await meetingApi.list(params);
      const filtered = filterStatus ? data.filter((m) => m.status === filterStatus) : data;
      if (off === 0) setMeetings(filtered);
      else setMeetings((prev) => [...prev, ...filtered]);
      setHasMore(data.length === LIMIT);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [from, to, filterUserId, filterRole, filterStatus]);

  useEffect(() => { setOffset(0); load(0); }, [load]);

  const counts: Record<MeetingStatus, number> = { scheduled: 0, closed: 0, minus: 0, push: 0, rescheduled: 0 };
  for (const m of meetings) counts[m.status] = (counts[m.status] ?? 0) + 1;

  const titleName = initUser ? `Встречи — ${initUser.name}` : "Все встречи";

  return (
    <Modal open onClose={onClose} title={titleName} width={860}
      footer={<Button variant="ghost" onClick={onClose}>Закрыть</Button>}>

      {/* ── Filters row ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        {/* Period */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg3)", borderRadius: 8, padding: 3 }}>
          {(["day", "week", "month", "custom"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{
                padding: "4px 12px", borderRadius: 6, border: "none",
                background: period === p ? "var(--bg2)" : "transparent",
                boxShadow: period === p ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                color: period === p ? "var(--text)" : "var(--text3)",
                fontSize: 12, fontWeight: period === p ? 600 : 400, cursor: "pointer", fontFamily: "inherit",
              }}>
              {{ day: "День", week: "Неделя", month: "Месяц", custom: "Период" }[p]}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <DateRangePicker
            value={{ from: customFrom, to: customTo }}
            onChange={v => { setCustomFrom(v.from); setCustomTo(v.to); }}
            onReset={() => { setCustomFrom(""); setCustomTo(""); }}
          />
        )}

        <div style={{ minWidth: 150 }}>
          <Select value={filterRole} onChange={(e) => handleRoleChange(e.target.value as any)}>
            <option value="all">Все участники</option>
            <option value="setter">По сеттеру</option>
            <option value="closer">По клоузеру</option>
          </Select>
        </div>

        {filterRole !== "all" && (
          <div style={{ minWidth: 150 }}>
            <Select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
              <option value="">— Все —</option>
              {userListForRole.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
        )}

        <div style={{ minWidth: 150 }}>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
            <option value="">Все статусы</option>
            {STATUS_KEYS_ALL.map((s) => <option key={s} value={s}>{MEETING_STATUS[s].label}</option>)}
          </Select>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ padding: "10px 16px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)", minWidth: 80 }}>
          <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Всего</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>{meetings.length}</div>
        </div>
        {STATUS_KEYS_ALL.map((s) => {
          const st = MEETING_STATUS[s];
          return (
            <div key={s} onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
              style={{
                padding: "10px 16px", background: st.bg, borderRadius: 8,
                border: `1.5px solid ${filterStatus === s ? st.color : st.color + "33"}`,
                minWidth: 80, cursor: "pointer", transition: "border-color 0.15s",
              }}>
              <div style={{ fontSize: 10, color: st.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{st.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: st.color, fontFamily: "JetBrains Mono, monospace" }}>{counts[s]}</div>
            </div>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
          <table className="data-table" style={{ position: "relative" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--bg3)" }}>
              <tr>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Телефон</th>
                <th>Сеттер</th>
                <th>Клоузер</th>
                <th>Статус</th>
                <th>Адрес</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                const st = MEETING_STATUS[m.status];
                return (
                  <tr key={m.id} onClick={() => setSelectedMeeting(m)} style={{ cursor: "pointer" }}>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, whiteSpace: "nowrap" }}>
                      {fmtDatetime(m.meeting_date)}
                    </td>
                    <td style={{ fontWeight: 500, color: "var(--text)" }}>{m.client_name}</td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text2)" }}>{m.client_phone || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>{m.setter?.name ?? "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>{m.closer?.name ?? "—"}</td>
                    <td>
                      <span className="status-chip" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                    <td style={{ color: "var(--text3)", fontSize: 12 }}>{m.address || "—"}</td>
                  </tr>
                );
              })}
              {!loading && meetings.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text3)", padding: "30px 20px" }}>Нет встреч</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {loading && <div style={{ padding: "14px 20px", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>Загрузка…</div>}
        {hasMore && !loading && (
          <button className="load-more-btn" onClick={() => { const n = offset + LIMIT; setOffset(n); load(n); }}>
            Загрузить ещё
          </button>
        )}
      </div>

      {selectedMeeting && (
        <MeetingDetailModal
          open
          onClose={() => setSelectedMeeting(null)}
          onSaved={async () => {
            const updated = await meetingApi.get(selectedMeeting.id).catch(() => null);
            if (updated) setSelectedMeeting(updated);
            load(0);
          }}
          onDeleted={() => { setSelectedMeeting(null); load(0); }}
          meeting={selectedMeeting}
          closers={closers}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onStatusChange={async (m: Meeting, s: MeetingStatus) => {
            try {
              await meetingApi.setStatus(m.id, s);
              const updated = await meetingApi.get(m.id);
              setSelectedMeeting(updated);
              load(0);
            } catch { /* ignore */ }
          }}
        />
      )}
    </Modal>
  );
}

// ============================= MODALS =============================
function MeetingModal({ open, onClose, onSaved, closers, defaultDate }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  closers: UserWithStats[]; defaultDate: Date;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ closer_id: "", meeting_date: "", address: "", client_name: "", client_phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const Y = defaultDate.getFullYear(), Mo = String(defaultDate.getMonth()+1).padStart(2,"0");
    const D = String(defaultDate.getDate()).padStart(2,"0"), h = String(defaultDate.getHours()).padStart(2,"0"), mi = String(defaultDate.getMinutes()).padStart(2,"0");
    const d = `${Y}-${Mo}-${D}T${h}:${mi}`;
    setForm({ closer_id: closers[0]?.id?.toString() ?? "", meeting_date: d, address: "", client_name: "", client_phone: "", notes: "" });
  }, [open]);

  async function save() {
    if (!form.client_name.trim() || !form.closer_id) return;
    setSaving(true);
    try {
      await meetingApi.create({ ...form, closer_id: Number(form.closer_id), meeting_date: localToUTC(form.meeting_date) });
      toast("Встреча назначена");
      onClose(); onSaved();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setSaving(false); }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={onClose} title="Назначить встречу" width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button loading={saving} disabled={!form.client_name || !form.closer_id} onClick={save}>Назначить</Button>
        </>
      }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <FormField label="Клоузер">
          <Select value={form.closer_id} onChange={set("closer_id")}>
            {closers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Дата и время">
          <Input type="datetime-local" value={form.meeting_date} onChange={set("meeting_date")} />
        </FormField>
      </div>
      <FormField label="Имя клиента">
        <Input value={form.client_name} onChange={set("client_name")} placeholder="ФИО" autoFocus />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <FormField label="Телефон">
          <Input value={form.client_phone} onChange={set("client_phone")} placeholder="+996 700 000000" />
        </FormField>
        <FormField label="Адрес">
          <Input value={form.address} onChange={set("address")} placeholder="ул. Манаса 45" />
        </FormField>
      </div>
      <FormField label="Заметки">
        <Textarea value={form.notes} onChange={set("notes")} rows={2} />
      </FormField>
    </Modal>
  );
}

function MeetingDetailModal({ open, onClose, onSaved, meeting, closers, currentUser, isAdmin, onStatusChange, onDeleted }: any) {
  const toast = useToast();
  const st = MEETING_STATUS[meeting.status as MeetingStatus];
  const [subModal, setSubModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const canChangeStatus = isAdmin || meeting.closer_id === currentUser?.id;
  const canEdit = isAdmin || currentUser?.position === "Сеттер" || currentUser?.position === "Руководитель продаж";
  const canDelete = isAdmin || meeting.setter_id === currentUser?.id;
  const STATUS_ACTIONS: MeetingStatus[] = ["closed","minus","push","rescheduled"];

  async function handleDelete() {
    setDeleting(true);
    try {
      await meetingApi.delete(meeting.id);
      toast("Встреча удалена");
      setDeleteConfirm(false);
      onClose();
      onDeleted?.();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setDeleting(false); }
  }

  useEffect(() => {
    if (editMode) {
      setEditForm({
        closer_id: String(meeting.closer_id ?? ""),
        meeting_date: isoToInput(meeting.meeting_date),
        address: meeting.address || "",
        client_name: meeting.client_name || "",
        client_phone: meeting.client_phone || "",
        notes: meeting.notes || "",
      });
    }
  }, [editMode, meeting]);

  async function saveEdit() {
    setSaving(true);
    try {
      await meetingApi.update(meeting.id, { ...editForm, closer_id: Number(editForm.closer_id), meeting_date: localToUTC(editForm.meeting_date) });
      toast("Встреча обновлена");
      setEditMode(false);
      onSaved();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setSaving(false); }
  }

  const setEF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((prev: any) => ({ ...prev, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={() => { setEditMode(false); onClose(); }} title="Встреча" width={500}
      footer={
        editMode ? (
          <>
            <Button variant="ghost" onClick={() => setEditMode(false)}>Отмена</Button>
            <Button loading={saving} onClick={saveEdit}>Сохранить</Button>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, width: "100%", alignItems: "center" }}>
            {canDelete && (
              <Button variant="danger" icon="delete" disabled={deleting} onClick={() => setDeleteConfirm(true)}>
                Удалить
              </Button>
            )}
            {canEdit && (
              <Button variant="ghost" icon="edit" onClick={() => setEditMode(true)}>Редактировать</Button>
            )}
            <Button variant="ghost" style={{ marginLeft: "auto" }} onClick={onClose}>Закрыть</Button>
          </div>
        )
      }>

      {editMode ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <FormField label="Клоузер">
              <Select value={editForm.closer_id} onChange={setEF("closer_id")}>
                {closers.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Дата и время">
              <Input type="datetime-local" value={editForm.meeting_date} onChange={setEF("meeting_date")} />
            </FormField>
          </div>
          <FormField label="Имя клиента">
            <Input value={editForm.client_name} onChange={setEF("client_name")} />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <FormField label="Телефон">
              <Input value={editForm.client_phone} onChange={setEF("client_phone")} />
            </FormField>
            <FormField label="Адрес">
              <Input value={editForm.address} onChange={setEF("address")} />
            </FormField>
          </div>
          <FormField label="Заметки">
            <Textarea value={editForm.notes} onChange={setEF("notes")} rows={3} />
          </FormField>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <span className="status-chip" style={{ background: st.bg, color: st.color, fontSize: 13, padding: "5px 12px" }}>{st.label}</span>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>Клоузер: <strong>{meeting.closer?.name ?? "—"}</strong></span>
            <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: "auto" }}>от {meeting.setter?.name ?? "—"}</span>
          </div>

          <div className="detail-grid">
            <DetailRow icon="person" label="Клиент" value={meeting.client_name} />
            <DetailRow icon="phone" label="Телефон" value={meeting.client_phone || "—"} />
            <DetailRow icon="calendar_today" label="Дата" value={fmtDatetime(meeting.meeting_date)} />
            <DetailRow icon="location_on" label="Адрес" value={meeting.address || "—"} />
            {meeting.notes && <DetailRow icon="notes" label="Заметки" value={meeting.notes} />}
          </div>

          {canChangeStatus && meeting.status !== "closed" && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", marginBottom: 8 }}>Изменить статус</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS_ACTIONS.filter((s) => s !== meeting.status).map((s) => {
                  const ms = MEETING_STATUS[s];
                  return (
                    <button key={s} onClick={() => onStatusChange(meeting, s)}
                      style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${ms.color}`, background: ms.bg, color: ms.color, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                      {ms.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {meeting.sub_meetings?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", marginBottom: 8 }}>Подвстречи ({meeting.sub_meetings.length})</div>
              {meeting.sub_meetings.map((s: Meeting) => (
                <div key={s.id} style={{ padding: "10px 12px", background: "var(--bg3)", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                  <div style={{ fontWeight: 500, color: "var(--text)" }}>{s.client_name}</div>
                  <div style={{ color: "var(--text3)", marginTop: 2 }}>{fmtDatetime(s.meeting_date)} · {s.address || "—"}</div>
                  <span className="status-chip" style={{ background: MEETING_STATUS[s.status].bg, color: MEETING_STATUS[s.status].color, marginTop: 4 }}>{MEETING_STATUS[s.status].label}</span>
                </div>
              ))}
            </div>
          )}

          <Button variant="ghost" icon="add" style={{ marginTop: 14, width: "100%", justifyContent: "center" }} onClick={() => setSubModal(true)}>
            Добавить подвстречу
          </Button>
        </>
      )}

      <MeetingModal open={subModal} onClose={() => setSubModal(false)} onSaved={() => { setSubModal(false); onSaved(); onClose(); }}
        closers={closers} defaultDate={isoToWallDate(meeting.meeting_date)} />

      <ConfirmModal
        open={deleteConfirm}
        title="Удалить встречу?"
        message={`Встреча с «${meeting.client_name}» будет удалена без возможности восстановления.`}
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </Modal>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text3)", marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

// ============================= REUSED COMPONENTS =============================
function SalesRecordModal({ open, onClose, onSaved, record, columns, staff, isAdmin, currentUserId }: any) {
  const toast = useToast();
  const [date, setDate] = useState("");
  const [userId, setUserId] = useState("");
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (record) { setDate(record.record_date); setUserId(String(record.user_id ?? "")); setMetrics(record.metrics || {}); }
    else { setDate(new Date().toISOString().slice(0, 10)); setUserId(isAdmin ? "" : String(currentUserId ?? "")); setMetrics({}); }
  }, [open, record, isAdmin, currentUserId]);

  async function save() {
    setSaving(true);
    try {
      const payload = { record_date: date, metrics, user_id: userId ? Number(userId) : null };
      if (record) await api.updateSalesRecord(record.id, payload);
      else await api.createSalesRecord(payload);
      toast(record ? "Запись обновлена" : "Запись добавлена");
      onClose(); onSaved();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={record ? "Запись" : "Новая запись"} width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button loading={saving} onClick={save}>Сохранить</Button>
        </>
      }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <FormField label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Сотрудник">
          <Select value={userId} disabled={!isAdmin} onChange={(e) => setUserId(e.target.value)}>
            <option value="">—</option>
            {staff.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        {columns.map((c: ColumnDef) => (
          <FormField key={c.id} label={c.label}>
            <Input type={c.kind === "number" ? "number" : "text"}
              value={metrics[c.key] ?? ""}
              onChange={(e) => setMetrics({ ...metrics, [c.key]: c.kind === "number" ? Number(e.target.value) : e.target.value })} />
          </FormField>
        ))}
      </div>
    </Modal>
  );
}

export function ColumnsModal({ open, onClose, onSaved, columns, addFn, delFn, reorderFn }: any) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("number");
  const [deleteColId, setDeleteColId] = useState<number | null>(null);

  async function add() {
    if (!label.trim()) return;
    try { await addFn({ label, kind }); setLabel(""); onSaved(); toast("Колонка добавлена"); }
    catch (e: any) { toast(e.message, "error"); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Колонки таблицы" width={420}
      footer={<Button variant="ghost" onClick={onClose}>Закрыть</Button>}>
      <div style={{ marginBottom: 16 }}>
        {columns.map((c: ColumnDef) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, color: "var(--text)" }}>{c.label} <span style={{ color: "var(--text3)", fontSize: 11 }}>({c.kind === "number" ? "число" : "текст"})</span></span>
            <div style={{ display: "flex", gap: 2 }}>
              {reorderFn && <>
                <button className="row-act" onClick={async () => { try { await reorderFn(c.id, "left"); onSaved(); } catch {} }}><span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back</span></button>
                <button className="row-act" onClick={async () => { try { await reorderFn(c.id, "right"); onSaved(); } catch {} }}><span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_forward</span></button>
              </>}
              <button className="row-act" onClick={() => setDeleteColId(c.id)}><span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span></button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text2)", marginBottom: 6, userSelect: "none" }}>Новая колонка</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Название" />
        </div>
        <div style={{ minWidth: 110, flexShrink: 0 }}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="number">Число</option>
            <option value="text">Текст</option>
          </Select>
        </div>
        <Button onClick={add}>Добавить</Button>
      </div>

      <ConfirmModal
        open={deleteColId !== null}
        title="Удалить колонку?"
        message="Данные этой колонки будут удалены."
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={async () => {
          if (deleteColId !== null) {
            try { await delFn(deleteColId); onSaved(); } catch (e: any) { toast(e.message, "error"); }
            setDeleteColId(null);
          }
        }}
        onCancel={() => setDeleteColId(null)}
      />
    </Modal>
  );
}

// ============================= UTILS =============================
// ── Timezone helpers: all times displayed/input in Asia/Bishkek (UTC+6) ──────
// Convert "YYYY-MM-DDTHH:MM" (Bishkek local) → ISO UTC string for backend
function localToUTC(s: string): string {
  const [d, t = "00:00"] = s.split("T");
  const [Y, Mo, D] = d.split("-").map(Number);
  const [h, m] = t.split(":").map(Number);
  return new Date(Date.UTC(Y, Mo - 1, D, h - 6, m)).toISOString();
}
// Convert ISO UTC string → "YYYY-MM-DDTHH:MM" in Bishkek (+6h)
function utcToLocal(s: string): string {
  const Y = +s.slice(0, 4), Mo = +s.slice(5, 7) - 1, D = +s.slice(8, 10);
  const h = +s.slice(11, 13), m = +s.slice(14, 16);
  const ms = Date.UTC(Y, Mo, D, h, m) + 6 * 3600 * 1000;
  const ld = new Date(ms);
  return `${ld.getUTCFullYear()}-${String(ld.getUTCMonth()+1).padStart(2,"0")}-${String(ld.getUTCDate()).padStart(2,"0")}T${String(ld.getUTCHours()).padStart(2,"0")}:${String(ld.getUTCMinutes()).padStart(2,"0")}`;
}

function fmtDate(d: string) {
  const local = d.includes("T") ? utcToLocal(d) : d;
  const [Y, M, Dd] = local.slice(0, 10).split("-");
  if (!Y || !M || !Dd) return d;
  return `${Dd}.${M}.${Y}`;
}
function fmtTime(d: string) {
  const local = utcToLocal(d);
  return local.slice(11, 16); // "HH:MM"
}
function fmtDatetime(d: string) {
  const local = utcToLocal(d);
  const [date, time] = local.split("T");
  const [Y, M, Dd] = date.split("-");
  return `${Dd}.${M}.${Y} ${time}`;
}
// ISO UTC string → value for <input type="datetime-local"> (converts to Bishkek)
function isoToInput(d: string): string {
  return utcToLocal(d);
}
// ISO UTC string → Date object in Bishkek wall-clock (for calendar rendering)
function isoToWallDate(d: string): Date {
  const local = utcToLocal(d);
  const Y = Number(local.slice(0, 4)), M = Number(local.slice(5, 7)), D = Number(local.slice(8, 10));
  const h = Number(local.slice(11, 13)) || 0, m = Number(local.slice(14, 16)) || 0;
  return new Date(Y, (M || 1) - 1, D || 1, h, m);
}

function TableStyles() {
  return (
    <style jsx global>{`
      .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text3); margin-bottom: 14px; }
      .data-table { width: 100%; border-collapse: collapse; }
      .data-table thead { background: var(--bg3); }
      .data-table th { padding: 11px 16px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3); border-bottom: 1px solid var(--border); white-space: nowrap; }
      .data-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid var(--border); color: var(--text2); }
      .data-table tr:last-child td { border-bottom: none; }
      .data-table tbody tr:hover td { background: var(--bg-hover); }
      .row-act { width: 28px; height: 28px; border: none; background: transparent; color: var(--text3); border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .row-act:hover { background: var(--bg3); color: var(--text); }
      .load-more-btn { width: 100%; padding: 11px; background: transparent; border: none; border-top: 1px solid var(--border); font-size: 12px; color: var(--primary); cursor: pointer; font-family: inherit; }
      .load-more-btn:hover { background: var(--bg-hover); }
      .status-chip { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
      .meeting-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.12s; }
      .meeting-row:hover { background: var(--bg-hover); }
      .meeting-row:last-child { border-bottom: none; }
      .detail-grid { display: flex; flex-direction: column; }
      .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
      .cal-header { text-align: center; font-size: 11px; font-weight: 600; color: var(--text3); padding: 4px 0 8px; }
      .cal-cell { padding: 6px 4px; border-radius: 8px; cursor: pointer; min-height: 52px; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: background 0.12s; }
      .cal-cell:hover { background: var(--bg-hover); }
      .cal-cell.sel { background: var(--primary-dim); }
      .cal-cell.today .cal-num { background: var(--primary); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
      .cal-num { font-size: 13px; color: var(--text); font-weight: 400; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
      .cal-dots { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
      .cal-dot { width: 5px; height: 5px; border-radius: 50%; }
      .cal-more { font-size: 9px; color: var(--text3); }
    `}</style>
  );
}
function CalendarStyles() { return <TableStyles />; }
