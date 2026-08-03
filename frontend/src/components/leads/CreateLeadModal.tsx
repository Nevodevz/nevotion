"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Button, FormField, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { leadApi } from "@/lib/api";
import type { LeadSource, LeadStage, ServiceItem, UserWithStats } from "@/lib/types";

const EMPTY = {
  client_name: "", company_name: "", phone: "",
  source_id: "", service_id: "", stage_id: "", setter_id: "", closer_id: "",
  deal_amount: "", comment: "",
  // Attribution
  source_detail: "", content_ref: "",
  utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "",
  external_lead_id: "",
};

/** Instagram gets an explicit reel/content field, since that is where it matters most. */
function isInstagramLike(name: string | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return n.includes("instagram") || n.includes("инстаграм");
}

export function CreateLeadModal({
  open, onClose, onCreated, sources, services, stages, users, currentUserId, isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  sources: LeadSource[];
  services: ServiceItem[];
  stages: LeadStage[];
  users: UserWithStats[];
  currentUserId?: number;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);
  const [dupe, setDupe] = useState<{ id: number; client_name: string } | null>(null);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const selectedSource = sources.find((s) => String(s.id) === form.source_id);

  async function submit(force = false) {
    if (!form.client_name.trim()) {
      toast("Укажите имя клиента", "error");
      return;
    }
    setSaving(true);
    try {
      await leadApi.create({
        client_name: form.client_name.trim(),
        company_name: form.company_name.trim(),
        phone: form.phone.trim(),
        source_id: form.source_id ? Number(form.source_id) : null,
        service_id: form.service_id ? Number(form.service_id) : null,
        stage_id: form.stage_id ? Number(form.stage_id) : null,
        setter_id: form.setter_id ? Number(form.setter_id) : (currentUserId ?? null),
        closer_id: form.closer_id ? Number(form.closer_id) : null,
        deal_amount: form.deal_amount ? Number(form.deal_amount) : 0,
        comment: form.comment,
        source_detail: form.source_detail,
        content_ref: form.content_ref,
        utm_source: form.utm_source,
        utm_medium: form.utm_medium,
        utm_campaign: form.utm_campaign,
        utm_content: form.utm_content,
        external_lead_id: form.external_lead_id,
        force,
      });
      toast("Лид создан", "success");
      setForm({ ...EMPTY });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = (err as Error).message || "";
      if (msg.includes("existing")) {
        try {
          const match = msg.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.existing) { setDupe(parsed.existing); setSaving(false); return; }
          }
        } catch { /* fall through to the generic toast */ }
      }
      toast(msg || "Ошибка создания", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Modal open title="Новый лид" onClose={onClose}>
      {dupe && (
        <div style={{ background: "rgba(181,93,0,.1)", border: "1px solid #b55d00", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: "#b55d00", marginBottom: 6 }}>
            ⚠️ Лид с таким номером уже существует
          </div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10 }}>
            Клиент: <b>{dupe.client_name}</b>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" size="sm" onClick={() => { onClose(); router.push(`/leads/${dupe.id}`); }}>
              Открыть существующий
            </Button>
            <Button size="sm" onClick={() => { setDupe(null); submit(true); }}>Всё равно создать</Button>
            <Button variant="ghost" size="sm" onClick={() => setDupe(null)}>Отмена</Button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px", maxHeight: "62vh", overflowY: "auto", padding: "0 2px" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label="Имя клиента" required>
            <Input value={form.client_name} onChange={f("client_name")} placeholder="Алибек Джумалиев" />
          </FormField>
        </div>
        <FormField label="Компания">
          <Input value={form.company_name} onChange={f("company_name")} placeholder="ООО Пример" />
        </FormField>
        <FormField label="Телефон">
          <Input value={form.phone} onChange={f("phone")} placeholder="+996 700 000000" />
        </FormField>

        <FormField label="Источник">
          <Select value={form.source_id} onChange={f("source_id")}>
            <option value="">— не выбрано —</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Уточнение источника">
          <Input value={form.source_detail} onChange={f("source_detail")} placeholder="Блогер, чат, рассылка…" />
        </FormField>

        {isInstagramLike(selectedSource?.name) && (
          <div style={{ gridColumn: "1 / -1" }}>
            <FormField label="Рилс / контент (ссылка или ID)">
              <Input value={form.content_ref} onChange={f("content_ref")}
                placeholder="https://instagram.com/reel/… — определяется вручную" />
            </FormField>
          </div>
        )}

        <FormField label="Услуга">
          <Select value={form.service_id} onChange={f("service_id")}>
            <option value="">— не выбрано —</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Этап">
          <Select value={form.stage_id} onChange={f("stage_id")}>
            <option value="">— по умолчанию —</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>

        <FormField label="Сумма сделки (сом)">
          <Input type="number" min={0} value={form.deal_amount} onChange={f("deal_amount")} placeholder="0" />
        </FormField>

        {isAdmin && (
          <>
            <FormField label="Сеттер">
              <Select value={form.setter_id} onChange={f("setter_id")}>
                <option value="">— текущий пользователь —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Клоузер">
              <Select value={form.closer_id} onChange={f("closer_id")}>
                <option value="">— не назначен —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </FormField>
          </>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <button
            type="button"
            onClick={() => setShowAttribution((v) => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "8px 0",
              color: "var(--primary)", fontSize: 13, fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {showAttribution ? "expand_less" : "expand_more"}
            </span>
            Атрибуция и UTM-метки
          </button>
        </div>

        {showAttribution && (
          <>
            {!isInstagramLike(selectedSource?.name) && (
              <div style={{ gridColumn: "1 / -1" }}>
                <FormField label="Рилс / контент (ссылка или ID)">
                  <Input value={form.content_ref} onChange={f("content_ref")} placeholder="Ссылка на публикацию" />
                </FormField>
              </div>
            )}
            <FormField label="UTM source">
              <Input value={form.utm_source} onChange={f("utm_source")} placeholder="instagram" />
            </FormField>
            <FormField label="UTM medium">
              <Input value={form.utm_medium} onChange={f("utm_medium")} placeholder="cpc" />
            </FormField>
            <FormField label="UTM campaign">
              <Input value={form.utm_campaign} onChange={f("utm_campaign")} placeholder="august_leadgen" />
            </FormField>
            <FormField label="UTM content">
              <Input value={form.utm_content} onChange={f("utm_content")} placeholder="creative_7" />
            </FormField>
            <div style={{ gridColumn: "1 / -1" }}>
              <FormField label="Внешний ID лида (из рекламной системы)">
                <Input value={form.external_lead_id} onChange={f("external_lead_id")} placeholder="Заполняется вручную или интеграцией" />
              </FormField>
            </div>
          </>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label="Комментарий">
            <Textarea value={form.comment} onChange={f("comment")} rows={2} />
          </FormField>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
        <Button loading={saving} disabled={saving || !form.client_name.trim()} onClick={() => submit(false)}>
          Создать лид
        </Button>
      </div>
    </Modal>
  );
}
