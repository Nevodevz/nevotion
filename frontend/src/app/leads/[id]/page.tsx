"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Modal } from "@/components/Modal";
import { Button, ConfirmModal } from "@/components/ui";
import { TransitionModal, stageKind, STAGE_ACTION_LABELS } from "@/components/TransitionModal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { leadApi, settingsApi, api } from "@/lib/api";
import { PaymentScheduleSection } from "@/components/leads/PaymentSchedule";
import {
  fmtDate, fmtDateTime, fmtMoney, fmtMoneyShort,
  utcToLocalInput as utcToLocal, localInputToUtc as localToUTC,
} from "@/lib/format";
import Link from "next/link";
import type {
  Account, LeadDetail, LeadStage, LeadSource, PaymentSchedule, ServiceItem, UserWithStats,
  LeadActivity, LeadFile, Project, RejectReason,
} from "@/lib/types";
import { ACTIVITY_TYPES, DEAL_STATUS, FILE_TYPES } from "@/lib/types";

// ── utils ────────────────────────────────────────────────────────
function daysSince(iso: string | null) {
  if (!iso) return null;
  const Y = parseInt(iso.slice(0, 4)), M = parseInt(iso.slice(5, 7)) - 1, D = parseInt(iso.slice(8, 10));
  const diff = Date.now() - new Date(Y, M, D).getTime();
  return Math.floor(diff / 86400000);
}

// ── StageBadge ───────────────────────────────────────────────────
function StageBadge({ stage }: { stage: LeadStage | null }) {
  if (!stage) return <span style={{ color: "var(--text3)" }}>—</span>;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: stage.color + "22", color: stage.color }}>
      {stage.name}
    </span>
  );
}

// ── Section ──────────────────────────────────────────────────────
function Section({ title, icon, children, action }: { title: string; icon: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--text1)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--primary)" }}>{icon}</span>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: "var(--text3)", paddingTop: 2 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 13, color: "var(--text1)" }}>{value || <span style={{ color: "var(--text3)" }}>—</span>}</div>
    </div>
  );
}

// ── Stage Line ───────────────────────────────────────────────────
function StageLine({ stages, currentStageId, history }: {
  stages: LeadStage[];
  currentStageId: number | null;
  history: LeadDetail["stage_history"];
}) {
  const entryDates: Record<number, string> = {};
  for (const h of history) {
    if (h.to_stage_id && !entryDates[h.to_stage_id]) entryDates[h.to_stage_id] = h.created_at;
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 0, alignItems: "center", minWidth: "max-content" }}>
        {stages.map((s, i) => {
          const isCurrent = s.id === currentStageId;
          const isPast = !!entryDates[s.id] && !isCurrent;
          const entryDate = entryDates[s.id];
          const daysOnCurrent = isCurrent ? daysSince(entryDate) : null;

          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: isCurrent ? s.color : isPast ? s.color + "44" : "var(--bg3)",
                  color: isCurrent ? "#fff" : isPast ? s.color : "var(--text3)",
                  fontSize: 11, fontWeight: 700, border: isCurrent ? `2px solid ${s.color}` : "2px solid transparent",
                  flexShrink: 0,
                }}>
                  {isPast ? <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span> : i + 1}
                </div>
                <div style={{ fontSize: 11, color: isCurrent ? s.color : "var(--text3)", fontWeight: isCurrent ? 700 : 400, maxWidth: 72, textAlign: "center", lineHeight: 1.3 }}>
                  {s.name}
                </div>
                {isCurrent && daysOnCurrent !== null && (
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{daysOnCurrent}д</div>
                )}
                {isPast && entryDate && (
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{fmtDate(entryDate)}</div>
                )}
              </div>
              {i < stages.length - 1 && (
                <div style={{ width: 20, height: 2, background: isPast || isCurrent ? s.color + "66" : "var(--border)", margin: "0 2px", marginBottom: 22 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────
function Timeline({ events }: { events: LeadDetail["timeline"] }) {
  return (
    <div style={{ position: "relative" }}>
      {events.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--primary)" }}>{e.icon}</span>
            </div>
            {i < events.length - 1 && <div style={{ width: 2, flex: 1, background: "var(--border)", minHeight: 14 }} />}
          </div>
          <div style={{ paddingTop: 4, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{e.label}</div>
            {e.description && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{e.description}</div>}
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{fmtDateTime(e.at)}</div>
          </div>
        </div>
      ))}
      {events.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13 }}>Нет событий</div>}
    </div>
  );
}

// ── Add Activity Modal ───────────────────────────────────────────
function AddActivityModal({ leadId, users, onClose, onAdded }: {
  leadId: number; users: UserWithStats[]; onClose: () => void; onAdded: () => void;
}) {
  const toast = useToast();
  const { user } = useApp();
  const [form, setForm] = useState({ activity_type: ACTIVITY_TYPES[0] as string, channel: "", description: "", responsible_id: "" });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await leadApi.addActivity(leadId, {
        activity_type: form.activity_type,
        channel: form.channel,
        description: form.description,
        responsible_id: form.responsible_id ? Number(form.responsible_id) : user?.id,
      });
      toast("Касание добавлено", "success");
      onAdded();
      onClose();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    setSaving(false);
  }

  return (
    <Modal open title="Добавить касание" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="form-label">Тип касания</label>
          <select className="form-input" value={form.activity_type} onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}>
            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Канал</label>
          <input className="form-input" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} placeholder="WhatsApp, телефон, почта..." />
        </div>
        <div>
          <label className="form-label">Содержание</label>
          <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: "vertical" }} />
        </div>
        <div>
          <label className="form-label">Ответственный</label>
          <select className="form-input" value={form.responsible_id} onChange={e => setForm(f => ({ ...f, responsible_id: e.target.value }))}>
            <option value="">— текущий пользователь —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? "Сохранение..." : "Добавить"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Add File Modal ───────────────────────────────────────────────
function AddFileModal({ leadId, onClose, onAdded }: { leadId: number; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", url: "", file_type: FILE_TYPES[0] as string });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.name.trim() || !form.url.trim()) { toast("Заполните название и ссылку", "error"); return; }
    setSaving(true);
    try {
      await leadApi.addFile(leadId, { name: form.name, url: form.url, file_type: form.file_type });
      toast("Файл добавлен", "success");
      onAdded(); onClose();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    setSaving(false);
  }

  return (
    <Modal open title="Добавить файл / ссылку" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="form-label">Тип документа</label>
          <select className="form-input" value={form.file_type} onChange={e => setForm(f => ({ ...f, file_type: e.target.value }))}>
            {FILE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Название</label>
          <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="КП для клиента" />
        </div>
        <div>
          <label className="form-label">Ссылка (URL)</label>
          <input className="form-input" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://docs.google.com/..." />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? "Сохранение..." : "Добавить"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit Lead Modal ──────────────────────────────────────────────
function EditLeadModal({ lead, sources, services, users, onClose, onSaved }: {
  lead: LeadDetail; sources: LeadSource[]; services: ServiceItem[];
  users: UserWithStats[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    client_name: lead.client_name,
    company_name: lead.company_name,
    phone: lead.phone,
    whatsapp: lead.whatsapp,
    instagram: lead.instagram,
    email: lead.email,
    address: lead.address,
    website: lead.website,
    industry: lead.industry,
    employees_count: lead.employees_count != null ? String(lead.employees_count) : "",
    source_id: lead.source_id != null ? String(lead.source_id) : "",
    service_id: lead.service_id != null ? String(lead.service_id) : "",
    setter_id: lead.setter_id != null ? String(lead.setter_id) : "",
    closer_id: lead.closer_id != null ? String(lead.closer_id) : "",
    // Canonical deal amount — written through to Deal.amount by the API.
    deal_amount: String(lead.deal_amount ?? 0),
    next_action_type: lead.next_action_type,
    next_action_at: lead.next_action_at ? utcToLocal(lead.next_action_at) : "",
    comment: lead.comment,
    source_detail: lead.source_detail ?? "",
    content_ref: lead.content_ref ?? "",
    utm_source: lead.utm_source ?? "",
    utm_medium: lead.utm_medium ?? "",
    utm_campaign: lead.utm_campaign ?? "",
    utm_content: lead.utm_content ?? "",
    external_lead_id: lead.external_lead_id ?? "",
  });
  const [saving, setSaving] = useState(false);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function submit() {
    setSaving(true);
    try {
      await leadApi.update(lead.id, {
        client_name: form.client_name || undefined,
        company_name: form.company_name,
        phone: form.phone,
        whatsapp: form.whatsapp,
        instagram: form.instagram,
        email: form.email,
        address: form.address,
        website: form.website,
        industry: form.industry,
        employees_count: form.employees_count ? Number(form.employees_count) : null,
        source_id: form.source_id ? Number(form.source_id) : null,
        service_id: form.service_id ? Number(form.service_id) : null,
        setter_id: form.setter_id ? Number(form.setter_id) : null,
        closer_id: form.closer_id ? Number(form.closer_id) : null,
        deal_amount: form.deal_amount ? Number(form.deal_amount) : 0,
        next_action_type: form.next_action_type,
        next_action_at: form.next_action_at ? localToUTC(form.next_action_at) : null,
        comment: form.comment,
        source_detail: form.source_detail,
        content_ref: form.content_ref,
        utm_source: form.utm_source,
        utm_medium: form.utm_medium,
        utm_campaign: form.utm_campaign,
        utm_content: form.utm_content,
        external_lead_id: form.external_lead_id,
      });
      toast("Лид обновлён", "success");
      onSaved(); onClose();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    setSaving(false);
  }

  return (
    <Modal open title="Редактировать лид" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", maxHeight: "70vh", overflowY: "auto", padding: "4px 2px" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="form-label">Имя клиента *</label>
          <input className="form-input" value={form.client_name} onChange={f("client_name")} />
        </div>
        <div><label className="form-label">Компания</label><input className="form-input" value={form.company_name} onChange={f("company_name")} /></div>
        <div><label className="form-label">Телефон</label><input className="form-input" value={form.phone} onChange={f("phone")} /></div>
        <div><label className="form-label">WhatsApp</label><input className="form-input" value={form.whatsapp} onChange={f("whatsapp")} /></div>
        <div><label className="form-label">Instagram</label><input className="form-input" value={form.instagram} onChange={f("instagram")} /></div>
        <div><label className="form-label">Email</label><input className="form-input" value={form.email} onChange={f("email")} /></div>
        <div><label className="form-label">Адрес</label><input className="form-input" value={form.address} onChange={f("address")} /></div>
        <div><label className="form-label">Сайт</label><input className="form-input" value={form.website} onChange={f("website")} /></div>
        <div><label className="form-label">Отрасль</label><input className="form-input" value={form.industry} onChange={f("industry")} /></div>
        <div><label className="form-label">Кол-во сотрудников</label><input className="form-input" type="number" value={form.employees_count} onChange={f("employees_count")} /></div>
        <div>
          <label className="form-label">Источник</label>
          <select className="form-input" value={form.source_id} onChange={f("source_id")}>
            <option value="">—</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Услуга</label>
          <select className="form-input" value={form.service_id} onChange={f("service_id")}>
            <option value="">—</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Сеттер</label>
          <select className="form-input" value={form.setter_id} onChange={f("setter_id")}>
            <option value="">—</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Клоузер</label>
          <select className="form-input" value={form.closer_id} onChange={f("closer_id")}>
            <option value="">—</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div><label className="form-label">Сумма сделки (сом)</label><input className="form-input" type="number" min={0} value={form.deal_amount} onChange={f("deal_amount")} /></div>
        <div><label className="form-label">Следующий шаг</label><input className="form-input" value={form.next_action_type} onChange={f("next_action_type")} placeholder="Позвонить, отправить КП..." /></div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="form-label">Дата следующего действия</label>
          <input className="form-input" type="datetime-local" value={form.next_action_at} onChange={f("next_action_at")} />
        </div>

        <div style={{ gridColumn: "1 / -1", marginTop: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)" }}>
          Атрибуция
        </div>
        <div><label className="form-label">Уточнение источника</label><input className="form-input" value={form.source_detail} onChange={f("source_detail")} placeholder="Блогер, чат, рассылка…" /></div>
        <div><label className="form-label">Рилс / контент</label><input className="form-input" value={form.content_ref} onChange={f("content_ref")} placeholder="Ссылка или ID публикации" /></div>
        <div><label className="form-label">UTM source</label><input className="form-input" value={form.utm_source} onChange={f("utm_source")} /></div>
        <div><label className="form-label">UTM medium</label><input className="form-input" value={form.utm_medium} onChange={f("utm_medium")} /></div>
        <div><label className="form-label">UTM campaign</label><input className="form-input" value={form.utm_campaign} onChange={f("utm_campaign")} /></div>
        <div><label className="form-label">UTM content</label><input className="form-input" value={form.utm_content} onChange={f("utm_content")} /></div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="form-label">Внешний ID лида</label>
          <input className="form-input" value={form.external_lead_id} onChange={f("external_lead_id")} placeholder="ID из рекламной системы" />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label className="form-label">Комментарий</label>
          <textarea className="form-input" rows={3} value={form.comment} onChange={f("comment")} style={{ resize: "vertical" }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</button>
      </div>
    </Modal>
  );
}

// ── Actions Dropdown ─────────────────────────────────────────────
function ActionsDropdown({
  stages,
  currentStageId,
  onSelect,
}: {
  stages: LeadStage[];
  currentStageId: number | null;
  onSelect: (stage: LeadStage) => void;
}) {
  const [open, setOpen] = useState(false);
  const available = stages.filter((s) => s.id !== currentStageId);

  return (
    <div style={{ position: "relative" }}>
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>swap_horiz</span>
        Действия
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
      </Button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 4px)",
              zIndex: 51,
              background: "var(--bg2)",
              border: "0.5px solid var(--border)",
              borderRadius: 10,
              minWidth: 220,
              boxShadow: "var(--shadow-md)",
              padding: "4px 0",
              overflow: "hidden",
            }}
          >
            {available.map((s) => {
              const k = stageKind(s);
              const label = k !== "generic" ? STAGE_ACTION_LABELS[k] : `→ ${s.name}`;
              return (
                <button
                  key={s.id}
                  onClick={() => { setOpen(false); onSelect(s); }}
                  style={{
                    width: "100%",
                    padding: "9px 14px",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { isAdmin, user } = useApp();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rejectReasons, setRejectReasons] = useState<RejectReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkedProject, setLinkedProject] = useState<Project | null>(null);
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [editModal, setEditModal] = useState(false);
  const [transitionStage, setTransitionStage] = useState<LeadStage | null>(null);
  const [actModal, setActModal] = useState(false);
  const [fileModal, setFileModal] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<number | null>(null);

  const loadSchedule = useCallback(async () => {
    if (!id) return;
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      setSchedule(await leadApi.payments(Number(id)));
    } catch (e: unknown) {
      setScheduleError((e as Error).message || "Не удалось загрузить график оплат");
    } finally {
      setScheduleLoading(false);
    }
  }, [id]);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const d = await leadApi.get(Number(id));
      setLead(d);
      api.listProjects().then(prjs => {
        setLinkedProject(prjs.find(p => p.lead_id === d.id) ?? null);
      }).catch(() => {});
    } catch { toast("Лид не найден", "error"); router.push("/leads"); }
    setLoading(false);
    loadSchedule();
  }, [id, loadSchedule]);

  useEffect(() => {
    // Stage history can reference archived stages, so include them here.
    settingsApi.listStages().then(setStages).catch(() => {});
    settingsApi.listSources().then(setSources).catch(() => {});
    settingsApi.listServices().then(setServices).catch(() => {});
    settingsApi.listRejectReasons().then(setRejectReasons).catch(() => {});
    settingsApi.listAccounts().then(setAccounts).catch(() => {});
    api.listUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleArchive() {
    if (!lead) return;
    try {
      await leadApi.archive(lead.id);
      toast("Лид архивирован", "success");
      router.push("/leads");
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  }

  async function handleDeleteFile(fileId: number) {
    if (!lead) return;
    try {
      await leadApi.deleteFile(lead.id, fileId);
      toast("Файл удалён", "success");
      reload();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  }

  async function handleTransitionConfirm(comment: string, extra: Record<string, unknown>) {
    if (!lead || !transitionStage) return;
    try {
      await leadApi.changeStage(lead.id, transitionStage.id, comment, extra);
      toast(
        transitionStage.is_won ? "Оплата проведена! Каскад запущен." : `Этап → «${transitionStage.name}»`,
        "success"
      );
      reload();
      setTransitionStage(null);
    } catch (e: unknown) {
      toast((e as Error).message || "Ошибка смены этапа", "error");
    }
  }

  if (loading) return <Shell title="Лид"><div style={{ padding: 40, color: "var(--text3)", textAlign: "center" }}>Загрузка...</div></Shell>;
  if (!lead) return null;

  const currentKind = lead.stage ? stageKind(lead.stage) : "generic";
  // Archived stages must not show up as available transitions.
  const activeStages = stages.filter((s) => !s.is_archived);
  const wonStage = activeStages.find((s) => s.is_won || stageKind(s) === "won");
  const showPayButton =
    (currentKind === "waiting_payment" || currentKind === "contract") && wonStage;
  const noNextAction = !lead.next_action_type;
  const dealStatus = DEAL_STATUS[lead.deal_status] ?? DEAL_STATUS.pending;
  // Payment schedule rights mirror the backend rule.
  const canManagePayments =
    isAdmin ||
    !!user?.is_founder ||
    user?.position === "Финансовый директор" ||
    user?.id === lead.setter_id ||
    user?.id === lead.closer_id;

  return (
    <Shell title={lead.client_name}>
      {/* Header */}
      <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text1)" }}>{lead.client_name}</div>
              {lead.company_name && <div style={{ fontSize: 14, color: "var(--text3)" }}>{lead.company_name}</div>}
              <StageBadge stage={lead.stage} />
              {lead.status === "archived" && (
                <span style={{ padding: "2px 8px", borderRadius: 8, background: "var(--bg3)", color: "var(--text3)", fontSize: 11 }}>Архив</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", fontSize: 13, color: "var(--text3)" }}>
              {lead.phone && <span><span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle" }}>phone</span> {lead.phone}</span>}
              {lead.whatsapp && <span>WhatsApp: {lead.whatsapp}</span>}
              {lead.instagram && <span>Instagram: {lead.instagram}</span>}
              {lead.deal_amount > 0 && (
                <>
                  <span style={{ color: "var(--primary)", fontWeight: 600 }}>
                    Сумма сделки: {fmtMoneyShort(lead.deal_amount)}
                  </span>
                  <span style={{ color: "var(--green)", fontWeight: 600 }}>
                    Оплачено: {fmtMoneyShort(lead.paid_amount)}
                  </span>
                  <span style={{ color: lead.remaining_amount > 0 ? "var(--yellow)" : "var(--green)", fontWeight: 600 }}>
                    Остаток: {fmtMoneyShort(lead.remaining_amount)}
                  </span>
                  <span style={{ background: dealStatus.bg, color: dealStatus.color, padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                    {dealStatus.label}
                  </span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--text3)" }}>
              {lead.setter && <span>Сеттер: <b style={{ color: "var(--text2)" }}>{lead.setter.name}</b></span>}
              {lead.closer && <span>Клоузер: <b style={{ color: "var(--text2)" }}>{lead.closer.name}</b></span>}
              {lead.source && <span>Источник: {lead.source.name}</span>}
              {lead.service && <span>Услуга: {lead.service.name}</span>}
              <span>Создан: {fmtDate(lead.created_at)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
            {showPayButton && wonStage && (
              <Button
                variant="primary"
                size="sm"
                icon="payments"
                onClick={() => setTransitionStage(wonStage)}
              >
                Провести оплату
              </Button>
            )}
            <ActionsDropdown
              stages={activeStages}
              currentStageId={lead.stage_id}
              onSelect={setTransitionStage}
            />
            <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditModal(true)}>
              Изменить
            </Button>
            <Button variant="ghost" size="sm" icon="add_comment" onClick={() => setActModal(true)}>
              Касание
            </Button>
            <Button variant="danger" size="sm" icon="archive" onClick={() => setArchiveConfirm(true)}>
              Архив
            </Button>
          </div>
        </div>
      </div>

      {/* Stage line — archived stages are not part of the active path */}
      <Section title="Этапы сделки" icon="linear_scale">
        <StageLine stages={activeStages} currentStageId={lead.stage_id} history={lead.stage_history} />
      </Section>

      {/* Next action */}
      <Section title="Следующее действие" icon="event_upcoming">
        {noNextAction ? (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(186,26,26,0.1)", border: "1px solid var(--red)", color: "var(--red)", fontSize: 13, fontWeight: 500 }}>
            ⚠️ Следующее действие не задано — назначьте его в редактировании лида
          </div>
        ) : (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <div><span style={{ color: "var(--text3)", marginRight: 6 }}>Тип:</span>{lead.next_action_type}</div>
            {lead.next_action_at && <div><span style={{ color: "var(--text3)", marginRight: 6 }}>Дата:</span>{fmtDateTime(lead.next_action_at)}</div>}
          </div>
        )}
      </Section>

      <div className="lead-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Main info */}
        <Section title="Основная информация" icon="info">
          <Row label="Компания" value={lead.company_name} />
          <Row label="Телефон" value={lead.phone} />
          <Row label="WhatsApp" value={lead.whatsapp} />
          <Row label="Instagram" value={lead.instagram} />
          <Row label="Email" value={lead.email} />
          <Row label="Адрес" value={lead.address} />
          <Row label="Сайт" value={lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{lead.website}</a> : null} />
          <Row label="Отрасль" value={lead.industry} />
          <Row label="Кол-во сотрудников" value={lead.employees_count} />
          <Row label="Источник" value={lead.source?.name} />
          <Row label="Услуга" value={lead.service?.name} />
          <Row label="Сеттер" value={lead.setter?.name} />
          <Row label="Клоузер" value={lead.closer?.name} />
          <Row label="Дата создания" value={fmtDate(lead.created_at)} />
          <Row label="Обновлён" value={fmtDate(lead.updated_at)} />
          {lead.comment && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg2)", borderRadius: 8, fontSize: 13, color: "var(--text2)" }}>
              {lead.comment}
            </div>
          )}
        </Section>

        {/* Financial summary — Deal.amount is the single source of truth */}
        <div>
          <Section title="Финансовая сводка" icon="account_balance_wallet">
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 130px" }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Сумма сделки
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtMoney(lead.deal_amount)}</div>
                </div>
                <div style={{ flex: "1 1 130px" }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Оплачено
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green)" }}>{fmtMoney(lead.paid_amount)}</div>
                </div>
                <div style={{ flex: "1 1 130px" }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Остаток
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: lead.remaining_amount > 0 ? "var(--yellow)" : "var(--green)" }}>
                    {fmtMoney(lead.remaining_amount)}
                  </div>
                </div>
              </div>
            </div>
            <Row
              label="Статус сделки"
              value={
                <span style={{ background: dealStatus.bg, color: dealStatus.color, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>
                  {dealStatus.label}
                </span>
              }
            />
            {lead.active_deal && (
              <>
                <Row label="Способ последней оплаты" value={lead.active_deal.payment_method || "—"} />
                <Row label="Дата последней оплаты" value={lead.active_deal.payment_date ? fmtDate(lead.active_deal.payment_date) : "—"} />
                {lead.deal_status === "paid" && (
                  <>
                    <Row
                      label="Комиссия сеттера"
                      value={lead.active_deal.setter_commission > 0
                        ? <span style={{ color: "var(--primary)", fontWeight: 600 }}>{fmtMoney(lead.active_deal.setter_commission)}</span>
                        : "—"}
                    />
                    <Row
                      label="Комиссия клоузера"
                      value={lead.active_deal.closer_commission > 0
                        ? <span style={{ color: "var(--primary)", fontWeight: 600 }}>{fmtMoney(lead.active_deal.closer_commission)}</span>
                        : "—"}
                    />
                    <Row
                      label="Маржа"
                      value={(() => {
                        const d = lead.active_deal!;
                        const margin = d.paid_amount - d.setter_commission - d.closer_commission;
                        return <span style={{ color: margin >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{fmtMoney(margin)}</span>;
                      })()}
                    />
                  </>
                )}
              </>
            )}
          </Section>

          {linkedProject && (
            <Section title="Проект в разработке" icon="code">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--primary-dim)", borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--primary)", fontSize: 14 }}>{linkedProject.company}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                    {linkedProject.sub_status || "Без подстатуса"}
                    {linkedProject.bot_comment ? ` · ${linkedProject.bot_comment}` : ""}
                  </div>
                </div>
                <Link href="/dept/dev">
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                    Разработка
                  </button>
                </Link>
              </div>
            </Section>
          )}
        </div>

        {/* Meetings */}
        <Section title={`Встречи (${lead.meetings.length})`} icon="calendar_month">
          {lead.meetings.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13 }}>Встреч нет</div>}
          {lead.meetings.map(m => (
            <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{m.client_name}</div>
              <div style={{ color: "var(--text3)", fontSize: 12 }}>{fmtDateTime(m.meeting_date)} · {m.closer?.name || "—"}</div>
            </div>
          ))}
        </Section>

        {/* Tasks */}
        <Section title={`Задачи (${lead.tasks.length})`} icon="task_alt">
          {lead.tasks.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13 }}>Задач нет</div>}
          {lead.tasks.map(t => (
            <div key={t.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <div style={{ fontWeight: 600, textDecoration: t.completed_at ? "line-through" : "none", color: t.completed_at ? "var(--text3)" : "var(--text1)" }}>{t.title}</div>
              <div style={{ color: "var(--text3)", fontSize: 12 }}>{t.owner?.name || "—"}{t.due_date ? ` · до ${fmtDate(t.due_date)}` : ""}</div>
            </div>
          ))}
        </Section>
      </div>

      {/* Payment schedule */}
      <Section title="График оплат" icon="payments">
        <PaymentScheduleSection
          leadId={lead.id}
          schedule={schedule}
          accounts={accounts}
          canManage={canManagePayments}
          loading={scheduleLoading}
          error={scheduleError}
          onChanged={(next) => { setSchedule(next); reload(); }}
          onRetry={loadSchedule}
        />
      </Section>

      {/* Activities */}
      <Section title="История касаний" icon="history"
        action={
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setActModal(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Добавить
          </button>
        }>
        {lead.activities.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13 }}>Касаний ещё нет</div>}
        {lead.activities.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg2)" }}>
                {["Дата", "Тип", "Канал", "Содержание", "Ответственный"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lead.activities.map((a: LeadActivity) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", color: "var(--text3)", whiteSpace: "nowrap" }}>{fmtDateTime(a.created_at)}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 500 }}>{a.activity_type}</td>
                  <td style={{ padding: "8px 10px", color: "var(--text2)" }}>{a.channel || "—"}</td>
                  <td style={{ padding: "8px 10px", color: "var(--text2)" }}>{a.description || "—"}</td>
                  <td style={{ padding: "8px 10px", color: "var(--text2)" }}>{a.responsible?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Timeline */}
      <Section title="Таймлайн событий" icon="timeline">
        <Timeline events={lead.timeline} />
      </Section>

      {/* Files */}
      <Section title="Файлы и документы" icon="attach_file"
        action={
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setFileModal(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Добавить
          </button>
        }>
        {lead.files.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13 }}>Файлов нет</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lead.files.map((f: LeadFile) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--bg2)", borderRadius: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--primary)" }}>description</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>{f.name}</a>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{f.file_type}{f.uploader ? ` · ${f.uploader.name}` : ""} · {fmtDate(f.created_at)}</div>
              </div>
              <button onClick={() => setDeleteFileId(f.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text3)", display: "flex" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* Modals */}
      {editModal && (
        <EditLeadModal lead={lead} sources={sources} services={services} users={users} onClose={() => setEditModal(false)} onSaved={reload} />
      )}
      {actModal && (
        <AddActivityModal leadId={lead.id} users={users} onClose={() => setActModal(false)} onAdded={reload} />
      )}
      {fileModal && (
        <AddFileModal leadId={lead.id} onClose={() => setFileModal(false)} onAdded={reload} />
      )}
      {transitionStage && (
        <TransitionModal
          stage={transitionStage}
          card={{
            client_name: lead.client_name,
            company_name: lead.company_name,
            deal_amount: lead.deal_amount,
            paid_amount: lead.paid_amount,
            remaining_amount: lead.remaining_amount,
            active_deal: lead.active_deal,
            closer_id: lead.closer_id,
            closer: lead.closer,
            setter_id: lead.setter_id,
            setter: lead.setter,
          }}
          users={users}
          rejectReasons={rejectReasons}
          onConfirm={handleTransitionConfirm}
          onCancel={() => setTransitionStage(null)}
        />
      )}
      <ConfirmModal
        open={archiveConfirm}
        title="Архивировать лид"
        message="Лид будет перемещён в архив. Все данные сохранятся, вы сможете найти его через фильтры."
        confirmLabel="Архивировать"
        variant="danger"
        onConfirm={async () => {
          setArchiveConfirm(false);
          await handleArchive();
        }}
        onCancel={() => setArchiveConfirm(false)}
      />
      <ConfirmModal
        open={deleteFileId !== null}
        title="Удалить файл"
        message="Файл будет удалён без возможности восстановления."
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={async () => {
          const fid = deleteFileId!;
          setDeleteFileId(null);
          await handleDeleteFile(fid);
        }}
        onCancel={() => setDeleteFileId(null)}
      />

      <style jsx global>{`
        .form-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text2); font-weight: 500; }
        .form-input { background: var(--bg3); border: 1px solid var(--border); border-radius: 7px; padding: 8px 10px; font-size: 13px; color: var(--text); font-family: inherit; outline: none; transition: border-color 0.15s; width: 100%; box-sizing: border-box; }
        .form-input:focus { border-color: var(--primary); }
        .btn { padding: 8px 14px; border-radius: 7px; font-size: 13px; font-family: inherit; cursor: pointer; border: none; font-weight: 500; transition: all 0.13s; display: inline-flex; align-items: center; gap: 5px; }
        .btn-ghost { background: var(--bg3); color: var(--text2); border: 1px solid var(--border); }
        .btn-ghost:hover { background: var(--bg2); }
        @media (max-width: 768px) { .lead-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </Shell>
  );
}
