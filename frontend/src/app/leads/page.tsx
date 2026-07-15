"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Modal } from "@/components/Modal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { leadApi, settingsApi, api, analyticsApi } from "@/lib/api";
import type {
  Lead, LeadListResponse, LeadStats, LeadSource, ServiceItem, LeadStage,
  UserWithStats,
} from "@/lib/types";
import { Button, Input, Select, Textarea, FormField, Card, DateRangePicker } from "@/components/ui";

function KpiCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <Card style={{ minWidth: 140, flex: "1 1 140px" }} padding="16px 20px">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text3)", fontSize: 12, marginBottom: 2 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
          {label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text1)" }}>{value}</div>
      </div>
    </Card>
  );
}

function StageBadge({ stage }: { stage: LeadStage | null }) {
  if (!stage) return <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: stage.color + "22", color: stage.color,
    }}>{stage.name}</span>
  );
}

function fmtMoney(v: number) {
  return v ? v.toLocaleString("ru-RU") + " с" : "—";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const Y = iso.slice(0, 4);
  const M = iso.slice(5, 7);
  const D = iso.slice(8, 10);
  return `${D}.${M}.${Y}`;
}

function CreateLeadModal({ open, onClose, sources, services, stages, users, currentUserId, isAdmin, onCreated }: {
  open: boolean; onClose: () => void;
  sources: LeadSource[]; services: ServiceItem[]; stages: LeadStage[]; users: UserWithStats[];
  currentUserId?: number; isAdmin: boolean;
  onCreated: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState({
    client_name: "", company_name: "", phone: "", source_id: "", service_id: "",
    stage_id: "", setter_id: "", closer_id: "", potential_amount: "", comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState<{ id: number; client_name: string } | null>(null);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function submit(force = false) {
    if (!form.client_name.trim()) { toast("Укажите имя клиента", "error"); return; }
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
        potential_amount: form.potential_amount ? Number(form.potential_amount) : 0,
        comment: form.comment,
        force,
      });
      toast("Лид создан", "success");
      onCreated();
      onClose();
    } catch (err: any) {
      const msg: string = err.message || "";
      if (msg.includes("existing")) {
        try {
          const match = msg.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.existing) { setDupe(parsed.existing); setSaving(false); return; }
          }
        } catch {}
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
          <div style={{ fontWeight: 600, color: "#b55d00", marginBottom: 6 }}>⚠️ Лид с таким номером уже существует</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10 }}>Клиент: <b>{dupe.client_name}</b></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" size="sm" onClick={() => { onClose(); router.push(`/leads/${dupe!.id}`); }}>
              Открыть существующий
            </Button>
            <Button size="sm" onClick={() => { setDupe(null); submit(true); }}>
              Всё равно создать
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDupe(null)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
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
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Услуга">
          <Select value={form.service_id} onChange={f("service_id")}>
            <option value="">— не выбрано —</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Этап">
          <Select value={form.stage_id} onChange={f("stage_id")}>
            <option value="">— по умолчанию —</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Потенциал (сом)">
          <Input type="number" value={form.potential_amount} onChange={f("potential_amount")} placeholder="0" />
        </FormField>
        {isAdmin && <>
          <FormField label="Сеттер">
            <Select value={form.setter_id} onChange={f("setter_id")}>
              <option value="">— текущий пользователь —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Клоузер">
            <Select value={form.closer_id} onChange={f("closer_id")}>
              <option value="">— не назначен —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </FormField>
        </>}
        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label="Комментарий">
            <Textarea value={form.comment} onChange={f("comment")} rows={2} />
          </FormField>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button loading={saving} onClick={() => submit(false)}>Создать лид</Button>
      </div>
    </Modal>
  );
}

export default function LeadsPage() {
  const { user, isAdmin } = useApp();
  const router = useRouter();

  const [stats, setStats] = useState<LeadStats | null>(null);
  const [data, setData] = useState<LeadListResponse>({ items: [], total: 0 });
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);

  const [search, setSearch] = useState("");
  const [fSource, setFSource] = useState("");
  const [fService, setFService] = useState("");
  const [fSetter, setFSetter] = useState("");
  const [fStage, setFStage] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        leadApi.list({
          source_id: fSource ? Number(fSource) : undefined,
          service_id: fService ? Number(fService) : undefined,
          setter_id: fSetter ? Number(fSetter) : undefined,
          stage_id: fStage ? Number(fStage) : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          search: search || undefined,
          limit: LIMIT, offset: off,
        }),
        leadApi.stats({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
      ]);
      setData(d);
      setStats(s);
      setOffset(off);
    } catch {}
    setLoading(false);
  }, [fSource, fService, fSetter, fStage, dateFrom, dateTo, search]);

  useEffect(() => {
    settingsApi.listSources().then(setSources).catch(() => {});
    settingsApi.listServices().then(setServices).catch(() => {});
    settingsApi.listStages().then(setStages).catch(() => {});
    api.listUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { load(0); }, [load]);

  const totalPages = Math.ceil(data.total / LIMIT);
  const page = Math.floor(offset / LIMIT) + 1;

  return (
    <Shell title="Лиды">
      {/* KPI */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <KpiCard label="Лидов сегодня" value={stats?.leads_today ?? "—"} icon="today" />
        <KpiCard label="Лидов за период" value={stats?.leads_period ?? "—"} icon="contacts" />
        <KpiCard label="Встреч за период" value={stats?.meetings_period ?? "—"} icon="calendar_month" />
        <KpiCard label="Закрыто в оплату" value={stats?.closed_won ?? "—"} icon="payments" />
        <KpiCard label="Конверсия" value={stats ? `${stats.conversion_pct}%` : "—"} icon="trending_up" />
        <KpiCard label="Потенциал сделок" value={stats ? fmtMoney(stats.potential_sum) : "—"} icon="account_balance_wallet" />
      </div>

      {/* Filters */}
      <Card padding="12px 16px" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <Input icon="search" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <DateRangePicker
            value={{ from: dateFrom, to: dateTo }}
            onChange={v => { setDateFrom(v.from); setDateTo(v.to); }}
            onReset={() => { setDateFrom(""); setDateTo(""); }}
          />
          <div style={{ minWidth: 140 }}>
            <Select value={fSource} onChange={e => setFSource(e.target.value)}>
              <option value="">Все источники</option>
              {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div style={{ minWidth: 130 }}>
            <Select value={fService} onChange={e => setFService(e.target.value)}>
              <option value="">Все услуги</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div style={{ minWidth: 130 }}>
            <Select value={fStage} onChange={e => setFStage(e.target.value)}>
              <option value="">Все этапы</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div style={{ minWidth: 140 }}>
            <Select value={fSetter} onChange={e => setFSetter(e.target.value)}>
              <option value="">Все сеттеры</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <Button variant="ghost" icon="download"
            onClick={() => analyticsApi.exportXlsx("leads", { ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}) })}>
            Excel
          </Button>
          <Button icon="add" onClick={() => setCreateModal(true)}>
            Новый лид
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card padding={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
                {["Дата", "Клиент / Компания", "Телефон", "Источник", "Услуга", "Этап", "Сеттер", "Клоузер", "Потенциал", "Следующий шаг"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Загрузка...</td></tr>}
              {!loading && data.items.length === 0 && <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Лиды не найдены</td></tr>}
              {!loading && data.items.map(lead => (
                <tr key={lead.id} onClick={() => router.push(`/leads/${lead.id}`)}
                  style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <td style={{ padding: "10px 12px", color: "var(--text3)", whiteSpace: "nowrap" }}>{fmtDate(lead.created_at)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{lead.client_name}</div>
                    {lead.company_name && <div style={{ fontSize: 11, color: "var(--text3)" }}>{lead.company_name}</div>}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)", whiteSpace: "nowrap" }}>{lead.phone || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{lead.source?.name || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{lead.service?.name || "—"}</td>
                  <td style={{ padding: "10px 12px" }}><StageBadge stage={lead.stage} /></td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{lead.setter?.name || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{lead.closer?.name || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)", whiteSpace: "nowrap" }}>{fmtMoney(lead.potential_amount)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {lead.next_action_type
                      ? <div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{lead.next_action_type}</div>
                          {lead.next_action_at && <div style={{ fontSize: 11, color: "var(--text3)" }}>{fmtDate(lead.next_action_at)}</div>}
                        </div>
                      : <span style={{ fontSize: 11, color: "var(--red)", fontStyle: "italic" }}>Не задан</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.total > LIMIT && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>{offset + 1}–{Math.min(offset + LIMIT, data.total)} из {data.total}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => load(offset - LIMIT)}>← Назад</Button>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>Стр. {page} из {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => load(offset + LIMIT)}>Вперёд →</Button>
            </div>
          </div>
        )}
      </Card>

      {createModal && (
        <CreateLeadModal
          open={createModal} onClose={() => setCreateModal(false)}
          sources={sources} services={services} stages={stages} users={users}
          currentUserId={user?.id} isAdmin={isAdmin}
          onCreated={() => load(0)}
        />
      )}
    </Shell>
  );
}
