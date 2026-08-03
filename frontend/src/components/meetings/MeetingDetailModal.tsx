"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { Button, ConfirmModal, FormField, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { meetingApi } from "@/lib/api";
import { fmtDateTime, localInputToUtc, utcToLocalInput } from "@/lib/format";
import type { Meeting, MeetingStatus, UserWithStats } from "@/lib/types";
import { DEFAULT_MEETING_MINUTES, MEETING_DURATIONS, MEETING_STATUS } from "@/lib/types";
import { MeetingModal } from "./MeetingModal";

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text3)", marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2, whiteSpace: "pre-wrap" }}>{value}</div>
      </div>
    </div>
  );
}

/** Statuses a closer can set from the detail view. */
const STATUS_ACTIONS: MeetingStatus[] = ["closed", "minus", "push", "rescheduled", "not_held"];

/**
 * View / edit a CRM meeting.
 *
 * Shared by the sales department calendar and the personal calendar, so a CRM
 * meeting always opens the same card wherever it is clicked.
 */
export function MeetingDetailModal({
  open, meeting, closers, currentUser, isAdmin,
  onClose, onSaved, onDeleted, onStatusChanged,
}: {
  open: boolean;
  meeting: Meeting;
  closers: UserWithStats[];
  currentUser?: UserWithStats;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onStatusChanged?: (updated: Meeting) => void;
}) {
  const toast = useToast();
  const st = MEETING_STATUS[meeting.status];
  const [subModal, setSubModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    closer_id: "", meeting_date: "", address: "",
    client_name: "", client_phone: "", notes: "",
    duration_minutes: String(DEFAULT_MEETING_MINUTES),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const canChangeStatus = isAdmin || meeting.closer_id === currentUser?.id;
  const canEdit = isAdmin
    || currentUser?.position === "Сеттер"
    || currentUser?.position === "Руководитель продаж";
  const canDelete = isAdmin || meeting.setter_id === currentUser?.id;

  useEffect(() => {
    if (!editMode) return;
    setEditForm({
      closer_id: String(meeting.closer_id ?? ""),
      meeting_date: utcToLocalInput(meeting.meeting_date),
      address: meeting.address || "",
      client_name: meeting.client_name || "",
      client_phone: meeting.client_phone || "",
      notes: meeting.notes || "",
      duration_minutes: String(meeting.duration_minutes || DEFAULT_MEETING_MINUTES),
    });
  }, [editMode, meeting]);

  const setEF = (k: keyof typeof editForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setEditForm((prev) => ({ ...prev, [k]: e.target.value }));

  async function saveEdit() {
    setSaving(true);
    try {
      await meetingApi.update(meeting.id, {
        closer_id: Number(editForm.closer_id),
        meeting_date: localInputToUtc(editForm.meeting_date),
        address: editForm.address,
        client_name: editForm.client_name,
        client_phone: editForm.client_phone,
        notes: editForm.notes,
        duration_minutes: Number(editForm.duration_minutes) || DEFAULT_MEETING_MINUTES,
      });
      toast("Встреча обновлена");
      setEditMode(false);
      onSaved();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(s: MeetingStatus) {
    try {
      const updated = await meetingApi.setStatus(meeting.id, s);
      toast("Статус обновлён");
      onStatusChanged?.(updated);
      onSaved();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await meetingApi.delete(meeting.id);
      toast("Встреча удалена");
      setDeleteConfirm(false);
      onClose();
      onDeleted();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  const durationLabel =
    MEETING_DURATIONS.find((d) => d.value === (meeting.duration_minutes || DEFAULT_MEETING_MINUTES))?.label
    ?? `${meeting.duration_minutes} мин`;

  return (
    <Modal open={open} onClose={() => { setEditMode(false); onClose(); }} title="Встреча" width={500}
      footer={
        editMode ? (
          <>
            <Button variant="ghost" onClick={() => setEditMode(false)} disabled={saving}>Отмена</Button>
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
                {closers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
            <FormField label="Продолжительность">
              <Select value={editForm.duration_minutes} onChange={setEF("duration_minutes")}>
                {MEETING_DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Адрес">
            <Input value={editForm.address} onChange={setEF("address")} />
          </FormField>
          <FormField label="Комментарий">
            <Textarea value={editForm.notes} onChange={setEF("notes")} rows={3} />
          </FormField>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <span className="status-chip" style={{ background: st.bg, color: st.color, fontSize: 13, padding: "5px 12px", borderRadius: 8, fontWeight: 600 }}>
              {st.label}
            </span>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              Клоузер: <strong>{meeting.closer?.name ?? "—"}</strong>
            </span>
            <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: "auto" }}>
              от {meeting.setter?.name ?? "—"}
            </span>
          </div>

          <div>
            <DetailRow icon="person" label="Клиент" value={meeting.client_name} />
            <DetailRow icon="phone" label="Телефон" value={meeting.client_phone || "—"} />
            <DetailRow icon="calendar_today" label="Дата" value={fmtDateTime(meeting.meeting_date)} />
            <DetailRow icon="schedule" label="Продолжительность" value={durationLabel} />
            <DetailRow icon="location_on" label="Адрес" value={meeting.address || "—"} />
            {meeting.notes && <DetailRow icon="notes" label="Комментарий" value={meeting.notes} />}
          </div>

          {canChangeStatus && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", marginBottom: 8 }}>
                Изменить статус
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS_ACTIONS.filter((s) => s !== meeting.status).map((s) => {
                  const ms = MEETING_STATUS[s];
                  return (
                    <button key={s} onClick={() => changeStatus(s)}
                      style={{
                        padding: "6px 12px", borderRadius: 6, border: `1px solid ${ms.color}`,
                        background: ms.bg, color: ms.color, fontSize: 12, fontWeight: 500,
                        cursor: "pointer", fontFamily: "inherit",
                      }}>
                      {ms.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {meeting.sub_meetings?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", marginBottom: 8 }}>
                Подвстречи ({meeting.sub_meetings.length})
              </div>
              {meeting.sub_meetings.map((s) => (
                <div key={s.id} style={{ padding: "10px 12px", background: "var(--bg3)", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                  <div style={{ fontWeight: 500, color: "var(--text)" }}>{s.client_name}</div>
                  <div style={{ color: "var(--text3)", marginTop: 2 }}>
                    {fmtDateTime(s.meeting_date)} · {s.address || "—"}
                  </div>
                  <span className="status-chip" style={{ background: MEETING_STATUS[s.status].bg, color: MEETING_STATUS[s.status].color, marginTop: 4, display: "inline-block", padding: "2px 8px", borderRadius: 6 }}>
                    {MEETING_STATUS[s.status].label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <Button variant="ghost" icon="add" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
              onClick={() => setSubModal(true)}>
              Добавить подвстречу
            </Button>
          )}
        </>
      )}

      <MeetingModal
        open={subModal}
        onClose={() => setSubModal(false)}
        onSaved={() => { setSubModal(false); onSaved(); onClose(); }}
        closers={closers}
        defaultStart={utcToLocalInput(meeting.meeting_date)}
        parentId={meeting.id}
        leadId={meeting.lead_id}
      />

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
