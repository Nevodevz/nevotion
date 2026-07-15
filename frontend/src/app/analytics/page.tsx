"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Shell } from "@/components/Shell";
import { useApp } from "@/context/AppContext";
import { analyticsApi } from "@/lib/api";
import type { DashboardMetrics, ChartsData, Problem, FunnelPoint } from "@/lib/types";
import { Button, DateRangePicker, PageHeader } from "@/components/ui";

const PIE_COLORS = ["#4648d4", "#16a34a", "#e03b3b", "#f59e0b", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

function fmtSom(n: number) {
  return new Intl.NumberFormat("ru-KG").format(n) + " с";
}

function KpiCard({
  label, value, sub, icon, color,
}: {
  label: string; value: string | number; sub?: string; icon: string; color?: string;
}) {
  return (
    <div className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px", minWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text3)", fontSize: 12 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: color || "var(--accent)" }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text1)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text3)" }}>{sub}</div>}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { color: string; label: string }> = {
    critical: { color: "var(--red)",     label: "Критично" },
    error:    { color: "var(--yellow)",  label: "Ошибка" },
    warning:  { color: "var(--primary)", label: "Внимание" },
  };
  const { color, label } = map[severity] || { color: "var(--text3)", label: severity };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color,
      background: color + "22",
      borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function FunnelViz({ data }: { data: FunnelPoint[] }) {
  const active = data.filter(d => !d.is_lost);
  const max = Math.max(...active.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {active.map((stage, i) => {
        const prev = i > 0 ? active[i - 1].count : null;
        const conv = prev && prev > 0 ? Math.round(stage.count / prev * 100) : null;
        const pct = Math.max(stage.count / max * 100, 4);
        return (
          <div key={stage.stage_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 120, fontSize: 12, color: "var(--text2)", textAlign: "right", flexShrink: 0 }}>
              {stage.stage_name}
            </div>
            <div style={{ flex: 1, background: "var(--bg2)", borderRadius: 4, height: 26, position: "relative" }}>
              <div style={{
                width: `${pct}%`, height: "100%", borderRadius: 4,
                background: stage.is_won ? "var(--green)" : (stage.color || "var(--primary)"),
                display: "flex", alignItems: "center", paddingLeft: 8,
                transition: "width 0.4s",
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{stage.count}</span>
              </div>
            </div>
            {conv !== null && (
              <div style={{ width: 36, fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>{conv}%</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user: me } = useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [charts, setCharts] = useState<ChartsData | null>(null);
  const [probs, setProbs] = useState<Problem[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (me && me.role !== "admin" && !me.is_founder) {
      router.replace("/dashboard");
    }
  }, [me, router]);

  const load = () => {
    setLoading(true);
    analyticsApi.dashboard(dateFrom || undefined, dateTo || undefined)
      .then(d => {
        setMetrics(d.metrics);
        setCharts(d.charts);
        setProbs(d.problems);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  if (me && me.role !== "admin" && !me.is_founder) return null;

  return (
    <Shell title="Аналитика">
      <PageHeader
        title="CEO Dashboard"
        subtitle="Сводные показатели бизнеса"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <DateRangePicker
              value={{ from: dateFrom, to: dateTo }}
              onChange={v => { setDateFrom(v.from); setDateTo(v.to); }}
              onReset={() => { setDateFrom(""); setDateTo(""); }}
            />
            <Button variant="primary" onClick={load}>Применить</Button>
          </div>
        }
      />

      {loading && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Загрузка...</div>
      )}

      {!loading && metrics && (
        <>
          {/* Problems */}
          {probs.length > 0 && (
            <div className="card" style={{ padding: "14px 20px", marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "middle", marginRight: 6, color: "var(--red)" }}>warning</span>
                Проблемы ({probs.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {probs.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <SeverityBadge severity={p.severity} />
                    <span style={{ fontSize: 13, color: "var(--text2)", flex: 1 }}>{p.message}</span>
                    {p.link && (
                      <a href={p.link} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Открыть</a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI Cards row 1 */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <KpiCard label="Лидов сегодня" value={metrics.leads_today} sub={`Вчера: ${metrics.leads_yesterday}`} icon="person_add" />
            <KpiCard label="Лидов за месяц" value={metrics.leads_month} icon="group_add" />
            <KpiCard label="CPL (месяц)" value={fmtSom(metrics.cpl)} icon="ads_click" color="var(--yellow)" />
            <KpiCard label="CAC (месяц)" value={fmtSom(metrics.cac)} icon="price_change" color="var(--red)" />
            <KpiCard label="Встреч назначено" value={metrics.meetings_scheduled} sub="за месяц" icon="calendar_month" />
            <KpiCard label="Встреч проведено" value={metrics.meetings_conducted} sub="за месяц" icon="handshake" color="var(--green)" />
            <KpiCard label="Продаж вчера" value={metrics.sales_yesterday} icon="shopping_cart" />
            <KpiCard label="Продаж за месяц" value={metrics.sales_month} icon="sell" color="var(--green)" />
          </div>

          {/* KPI Cards row 2 */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <KpiCard
              label="Выручка месяца"
              value={fmtSom(metrics.revenue_month)}
              sub={metrics.plan_revenue_month > 0 ? `План: ${fmtSom(metrics.plan_revenue_month)} · ${metrics.revenue_vs_plan_pct ?? 0}%` : undefined}
              icon="payments"
              color="var(--green)"
            />
            <KpiCard label="Средний чек" value={fmtSom(metrics.avg_check)} icon="receipt" />
            <KpiCard label="На счетах" value={fmtSom(metrics.total_on_accounts)} icon="account_balance" />
            <KpiCard label="В ожидании оплаты" value={fmtSom(metrics.pending_amount)} sub={`${metrics.pending_count} сделок`} icon="pending_actions" color="var(--yellow)" />
            <KpiCard label="Расходы месяца" value={fmtSom(metrics.expenses_month)} icon="trending_down" color="var(--red)" />
            <KpiCard label="ФОТ месяца" value={fmtSom(metrics.fot_month)} icon="group" color="var(--red)" />
            <KpiCard
              label="Прибыль месяца"
              value={fmtSom(metrics.profit_month)}
              icon="trending_up"
              color={metrics.profit_month >= 0 ? "var(--green)" : "var(--red)"}
            />
            <KpiCard
              label="Прогноз 7 дней"
              value={fmtSom(metrics.cashflow_7d)}
              sub={metrics.cashflow_warning ? "⚠ Возможен разрыв" : "Норма"}
              icon="savings"
              color={metrics.cashflow_warning ? "var(--red)" : "var(--green)"}
            />
          </div>

          {/* Conversions strip */}
          <div className="card" style={{ padding: "12px 20px", marginBottom: 20, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)" }}>Конверсии</div>
            <div style={{ fontSize: 13 }}>Лид → Встреча: <b>{metrics.conv_lead_meeting_pct}%</b></div>
            <div style={{ fontSize: 13 }}>Встреча → Продажа: <b>{metrics.conv_meeting_sale_pct}%</b></div>
            <div style={{ fontSize: 13 }}>Лид → Продажа: <b>{metrics.conv_lead_sale_pct}%</b></div>
          </div>

          {/* Charts grid */}
          {charts && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {/* Line chart */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Динамика (лиды / встречи / продажи)</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={charts.daily} margin={{ top: 0, right: 10, bottom: 0, left: -20 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip labelFormatter={v => String(v)} formatter={(v, name) => [v, name === "leads" ? "Лиды" : name === "meetings" ? "Встречи" : "Продажи"]} />
                      <Line type="monotone" dataKey="leads" stroke="#4648d4" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="meetings" stroke="#f59e0b" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="sales" stroke="#16a34a" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--text3)" }}>
                    <span><span style={{ color: "#4648d4" }}>●</span> Лиды</span>
                    <span><span style={{ color: "#f59e0b" }}>●</span> Встречи</span>
                    <span><span style={{ color: "#16a34a" }}>●</span> Продажи</span>
                  </div>
                </div>

                {/* Bar chart — revenue */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Выручка по дням</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={charts.daily} margin={{ top: 0, right: 10, bottom: 0, left: -20 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
                      <Tooltip formatter={(v: any) => [fmtSom(Number(v)), "Выручка"]} />
                      <Bar dataKey="revenue" fill="#4648d4" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Sources pie */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Источники лидов</div>
                  {charts.sources_pie.length > 0 ? (
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <ResponsiveContainer width={170} height={170}>
                        <PieChart>
                          <Pie data={charts.sources_pie} dataKey="count" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                            {charts.sources_pie.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any, _n: any, p: any) => [`${v} (${p.payload.pct}%)`, p.payload.name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        {charts.sources_pie.map((s, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                            <span style={{ flex: 1, color: "var(--text2)" }}>{s.name}</span>
                            <span style={{ color: "var(--text3)" }}>{s.count} ({s.pct}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "var(--text3)", fontSize: 13 }}>Нет данных за период</div>
                  )}
                </div>

                {/* Expense categories pie */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Расходы по категориям</div>
                  {charts.expense_categories.length > 0 ? (
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <ResponsiveContainer width={170} height={170}>
                        <PieChart>
                          <Pie data={charts.expense_categories} dataKey="amount" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                            {charts.expense_categories.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any, _n: any, p: any) => [fmtSom(Number(v)), p.payload.name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        {charts.expense_categories.map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                            <span style={{ flex: 1, color: "var(--text2)" }}>{c.name}</span>
                            <span style={{ color: "var(--text3)" }}>{fmt((c.amount as number) || 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "var(--text3)", fontSize: 13 }}>Нет данных за период</div>
                  )}
                </div>
              </div>

              {/* Funnel + Revenue by service */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>Воронка продаж</div>
                  <FunnelViz data={charts.funnel} />
                </div>
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Выручка по услугам</div>
                  {charts.revenue_by_service.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={charts.revenue_by_service} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 80 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip formatter={(v: any) => [fmtSom(Number(v)), "Выручка"]} />
                        <Bar dataKey="revenue" fill="#4648d4" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: "var(--text3)", fontSize: 13 }}>Нет данных за период</div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
