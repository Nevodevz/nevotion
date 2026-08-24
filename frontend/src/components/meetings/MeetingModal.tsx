"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { Button, FormField, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { meetingApi } from "@/lib/api";
import { localInputToUtc, utcToLocalInput } from "@/lib/format";
import type { Meeting, UserWithStats } from "@/lib/types";
import { DEFAULT_MEETING_MINUTES, MEETING_DURATIONS } from "@/lib/types";

/**
 * Create a CRM meeting.
 *
 * `defaultStart` comes from the calendar when a free slot is clicked, so the
 * date and time are already filled in.
 */
export function MeetingModal({
  open, onClose, onSaved, closers, defaultStart, parentId, leadId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (created?: Meeting) => void;
  closers: UserWithStats[];
  /** `YYYY-MM-DDTHH:mm` in Bishkek local time. */
  defaultStart?: string | null;
  parentId?: number | null;
  leadId?: number | null;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    closer_id: "", meeting_date: "", address: "",
    client_name: "", client_phone: "", notes: "",
    duration_minutes: String(DEFAULT_MEETING_MINUTES),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      closer_id: closers[0]?.id ? String(closers[0].id) : "",
      meeting_date: defaultStart ?? utcToLocalInput(new Date().toISOString()),
      address: "", client_name: "", client_phone: "", notes: "",
      duration_minutes: String(DEFAULT_MEETING_MINUTES),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultStart]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  async function save() {
    if (!form.client_name.trim() || !form.closer_id || !form.meeting_date) return;
    setSaving(true);
    try {
      const created = await meetingApi.create({
        closer_id: Number(form.closer_id),
        meeting_date: localInputToUtc(form.meeting_date),
        address: form.address,
        client_name: form.client_name.trim(),
        client_phone: form.client_phone,
        notes: form.notes,
        duration_minutes: Number(form.duration_minutes) || DEFAULT_MEETING_MINUTES,
        parent_id: parentId ?? null,
        lead_id: leadId ?? null,
      });
      toast("Встреча назначена");
      onClose();
      onSaved(created);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Назначить встречу" width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button loading={saving} disabled={saving || !form.client_name || !form.closer_id} onClick={save}>
            Назначить
          </Button>
        </>
      }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <FormField label="Клоузер" required>
          <Select value={form.closer_id} onChange={set("closer_id")}>
            <option value="">— выбрать —</option>
            {closers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Дата и время" required>
          <Input type="datetime-local" value={form.meeting_date} onChange={set("meeting_date")} />
        </FormField>
      </div>
      <FormField label="Имя клиента" required>
        <Input value={form.client_name} onChange={set("client_name")} placeholder="ФИО" autoFocus />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <FormField label="Телефон">
          <Input value={form.client_phone} onChange={set("client_phone")} placeholder="+996 700 000000" />
        </FormField>
        <FormField label="Продолжительность">
          <Select value={form.duration_minutes} onChange={set("duration_minutes")}>
            {MEETING_DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </FormField>
      </div>
      <FormField label="Адрес">
        <Input value={form.address} onChange={set("address")} placeholder="ул. Манаса 45, Zoom…" />
      </FormField>
      <FormField label="Комментарий">
        <Textarea value={form.notes} onChange={set("notes")} rows={2}
          placeholder="Что обсудить, детали для клоузера…" />
      </FormField>
    </Modal>
  );
}
