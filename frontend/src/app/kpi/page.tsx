"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Modal } from "@/components/Modal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { analyticsApi } from "@/lib/api";
import type { KpiPlanFact, KpiMetric, MonthlyPlan } from "@/lib/types";
import { Button, Input, FormField, PageHeader } from "@/components/ui";

const MONTH_NAMES = [
  "", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function fmtVal(n: number, unit: string) {
  if (unit === "сом") return new Intl.NumberFormat("ru-KG").format(n) + " с";
  return String(n);
}

function ProgressBar({ pct, good }: { pct: number | null; good: boolean }) {
  const clamped = Math.min(pct ?? 0, 150);
  const color = pct === null ? "var(--bg3)"
    : (pct >= 100 ? "var(--green)" : pct >= 70 ? "var(--yellow)" : "var(--red)");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 8, background: "var(--bg2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          width: `${clamped}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
          transition: "width 0.4s",
        }} />
      </div>
      <div style={{ width: 46, fontSize: 12, fontWeight: 600, color, textAlign: "right" }}>
        {pct !== null ? `${pct}%` : "—"}
      </div>
    </div>
  );
}

function MetricRow({ m }: { m: KpiMetric }) {
  const pct = m.pct;
  const statusColor = pct === null ? "var(--text3)"
    : pct >= 100 ? "var(--green)"
    : pct >= 70 ? "var(--yellow)"
    : "var(--red)";

  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{m.label}</div>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>{m.unit}</div>
        {!m.higher_is_better && (
          <span style={{ fontSize: 11, color: "var(--text3)", background: "var(--bg2)", borderRadius: 4, padding: "1px 6px" }}>
            ниже = лучше
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>План</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text2)" }}>{fmtVal(m.plan, m.unit)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>Факт</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text1)" }}>{fmtVal(m.fact, m.unit)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>Выполнение</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: statusColor }}>
            {pct !== null ? `${pct}%` : "—"}
          </div>
        </div>
      </div>
      <ProgressBar pct={pct} good={m.higher_is_better} />
    </div>
  );
}

export default function KpiPage() {
  const { user: me } = useApp();
  const showToast = useToast();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<KpiPlanFact | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = me?.role === "admin" || me?.is_founder;

  const [form, setForm] = useState({
    plan_revenue: 0, plan_leads: 0, plan_meetings: 0, plan_sales: 0,
    plan_cpl: 0, plan_cac: 0, plan_expenses: 0,
  });

  const load = () => {
    setLoading(true);
    analyticsApi.kpi(year, month)
      .then(d => {
        setData(d);
        const metric = (key: string) => d.metrics.find(m => m.key === key)?.plan ?? 0;
        setForm({
          plan_revenue: metric("revenue"),
          plan_leads: metric("leads"),
          plan_meetings: metric("meetings"),
          plan_sales: metric("sales"),
          plan_cpl: metric("cpl"),
          plan_cac: metric("cac"),
          plan_expenses: metric("expenses"),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year, month]); // eslint-disable-line

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const savePlan = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const payload = { year, month, ...form };
      if (data.plan_id) {
        await analyticsApi.updatePlan(data.plan_id, payload as any);
      } else {
        await analyticsApi.createPlan(payload as any);
      }
      showToast("План сохранён", "success");
      setEditOpen(false);
      load();
    } catch (e: any) {
      showToast(e.message || "Ошибка", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="KPI">
      <PageHeader
        title="KPI — план vs факт"
        subtitle="Ключевые показатели эффективности"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button variant="ghost" icon="chevron_left" onClick={prevMonth} />
            <div style={{ fontWeight: 600, fontSize: 15, minWidth: 160, textAlign: "center" }}>
              {MONTH_NAMES[month]} {year}
            </div>
            <Button variant="ghost" icon="chevron_right" onClick={nextMonth} />
            {isAdmin && (
              <Button variant="primary" icon="edit" onClick={() => setEditOpen(true)}>
                {data?.plan_id ? "Изменить план" : "Задать план"}
              </Button>
            )}
          </div>
        }
      />

      {loading && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Загрузка...</div>
      )}

      {!loading && data && (
        <>
          {!data.plan_id && isAdmin && (
            <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "3px solid var(--yellow)", color: "var(--text2)", fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "middle", marginRight: 6 }}>info</span>
              План на {MONTH_NAMES[month]} {year} не задан. Нажмите «Задать план» чтобы установить цели.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {data.metrics.map(m => <MetricRow key={m.key} m={m} />)}
          </div>
        </>
      )}

      {/* Edit plan modal */}
      {editOpen && (
        <Modal open={editOpen} title={data?.plan_id ? "Изменить план" : "Задать план"} onClose={() => setEditOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditOpen(false)}>Отмена</Button>
              <Button variant="primary" onClick={savePlan} disabled={saving} loading={saving}>Сохранить</Button>
            </>
          }>
          <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--text2)" }}>{MONTH_NAMES[month]} {year}</div>
          {[
            { key: "plan_revenue", label: "Выручка (сом)" },
            { key: "plan_leads", label: "Лиды (шт)" },
            { key: "plan_meetings", label: "Встречи (шт)" },
            { key: "plan_sales", label: "Продажи (шт)" },
            { key: "plan_cpl", label: "CPL — целевой (сом)" },
            { key: "plan_cac", label: "CAC — целевой (сом)" },
            { key: "plan_expenses", label: "Расходы — лимит (сом)" },
          ].map(({ key, label }) => (
            <FormField key={key} label={label}>
              <Input
                type="number"
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
              />
            </FormField>
          ))}
        </Modal>
      )}
    </Shell>
  );
}
