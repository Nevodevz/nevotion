"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Modal } from "@/components/Modal";
import { payrollApi, api, analyticsApi, devPayrollConfigApi } from "@/lib/api";
import type { PayrollCalculation, PayrollRecord, PayrollRule, UserWithStats, DevPayrollConfig } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { Button, Input, Select, FormField, Card, PageHeader, ConfirmModal } from "@/components/ui";

const FMT = (n: number) => n.toLocaleString("ru-RU") + " с";

function periodDates(offsetMonths = 0) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offsetMonths;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: start.toLocaleString("ru-RU", { month: "long", year: "numeric" }),
  };
}

// ── Rule Modal ──────────────────────────────────────────────────
function RuleModal({
  rule, users, onClose, onSaved,
}: {
  rule: PayrollRule | null;
  users: UserWithStats[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(rule ? String(rule.employee_id) : "");
  const [baseSalary, setBaseSalary] = useState(rule ? String(rule.base_salary) : "0");
  const [pct, setPct] = useState(rule ? String(rule.commission_percent) : "0");
  const [condition, setCondition] = useState<"none" | "from_setter" | "closer_self" | "any">(rule?.commission_condition ?? "none");
  const [activeFrom, setActiveFrom] = useState(rule?.active_from ?? new Date().toISOString().slice(0, 10));
  const [activeTo, setActiveTo] = useState(rule?.active_to ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!employeeId) return;
    setSaving(true);
    try {
      const data = {
        employee_id: parseInt(employeeId),
        base_salary: parseInt(baseSalary) || 0,
        commission_percent: parseInt(pct) || 0,
        commission_condition: condition,
        active_from: activeFrom,
        active_to: activeTo || null,
      };
      if (rule) await payrollApi.updateRule(rule.id, data);
      else await payrollApi.createRule(data);
      onSaved();
      onClose();
    } catch (e: any) { toast(e.message || "Ошибка", "error"); }
    finally { setSaving(false); }
  }

  const CONDITIONS = [
    { value: "none", label: "Без комиссий" },
    { value: "from_setter", label: "Сделка от сеттера (from_setter)" },
    { value: "closer_self", label: "Самостоятельная сделка (closer_self)" },
    { value: "any", label: "Любая сделка (any)" },
  ];

  return (
    <Modal open title={rule ? "Изменить правило" : "Новое правило зарплаты"} onClose={onClose} width={500}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={save} disabled={saving || !employeeId} loading={saving}>Сохранить</Button>
        </>
      }>
      <FormField label="Сотрудник" required>
        <Select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
          <option value="">— выбрать —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.position})</option>)}
        </Select>
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Оклад (сом)">
          <Input type="number" min="0" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} />
        </FormField>
        <FormField label="Комиссия (%)">
          <Input type="number" min="0" max="100" value={pct} onChange={e => setPct(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Условие комиссии">
        <Select value={condition} onChange={e => setCondition(e.target.value as "none" | "from_setter" | "closer_self" | "any")}>
          {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Действует с">
          <Input type="date" value={activeFrom} onChange={e => setActiveFrom(e.target.value)} />
        </FormField>
        <FormField label="По (необязательно)">
          <Input type="date" value={activeTo} onChange={e => setActiveTo(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

// ── Detail drawer ───────────────────────────────────────────────
function DetailPanel({
  calc, userName, onClose, onCommit, isAdmin,
}: {
  calc: PayrollCalculation;
  userName: string;
  onClose: () => void;
  onCommit: () => void;
  isAdmin: boolean;
}) {
  const [committing, setCommitting] = useState(false);

  async function handleCommit() {
    setCommitting(true);
    try { await onCommit(); }
    finally { setCommitting(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
      <div style={{ width: Math.min(520, window.innerWidth), height: "100vh", background: "var(--bg)", overflowY: "auto", padding: 28, boxShadow: "-4px 0 24px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{userName}</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{calc.period_start} — {calc.period_end}</div>
          </div>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Оклад", value: FMT(calc.base_salary), color: "var(--text1)" },
            { label: "Комиссии", value: FMT(calc.commission_amount), color: "var(--primary)" },
            { label: "Бонусы", value: FMT(calc.bonus_amount), color: "var(--green)" },
            { label: "Штрафы", value: FMT(calc.penalty_amount), color: "var(--red)" },
          ].map(({ label, value, color }) => (
            <Card key={label} padding="12px 14px">
              <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            </Card>
          ))}
        </div>

        <Card padding="14px 16px" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>Итого к выплате</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green)" }}>{FMT(calc.total_amount)}</div>
        </Card>

        {calc.dev_breakdown && (
          <div>
            {calc.dev_breakdown.kind !== "backender" && calc.dev_breakdown.bots && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--text2)" }}>
                  Боты ({calc.dev_breakdown.bots.length})
                  {calc.dev_breakdown.free_bots_limit != null && calc.dev_breakdown.free_bots_limit > 0 && (
                    <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400, marginLeft: 8 }}>
                      первые {calc.dev_breakdown.free_bots_limit} в фиксе
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {calc.dev_breakdown.bots.map((b) => (
                    <Card key={b.project_id} padding="8px 14px" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{b.company}</div>
                        {b.delivered_at && <div style={{ fontSize: 11, color: "var(--text3)" }}>Сдан: {b.delivered_at}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {b.in_free_limit ? (
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>в фиксе</span>
                        ) : (
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>{FMT(b.price)}</span>
                        )}
                      </div>
                    </Card>
                  ))}
                  {calc.dev_breakdown.bots.length === 0 && (
                    <div style={{ color: "var(--text3)", fontSize: 13, padding: "10px 0" }}>Нет сданных ботов в этом периоде</div>
                  )}
                </div>
                {calc.dev_breakdown.support_count != null && calc.dev_breakdown.support_count > 0 && (
                  <Card padding="10px 14px" style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, color: "var(--text2)" }}>
                      Тех. поддержка × {calc.dev_breakdown.support_count} бот{calc.dev_breakdown.support_count > 1 ? "а" : ""}
                      <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 6 }}>({FMT(calc.dev_breakdown.support_price ?? 0)}/бот)</span>
                    </div>
                    <div style={{ fontWeight: 700, color: "var(--orange)" }}>{FMT(calc.dev_breakdown.support_total ?? 0)}</div>
                  </Card>
                )}
              </>
            )}
            {calc.dev_breakdown.kind === "backender" && (
              <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                Фиксированный оклад. Детализация не требуется.
              </div>
            )}
          </div>
        )}

        {!calc.dev_breakdown && calc.deals.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--text2)" }}>
              Сделки ({calc.deals.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {calc.deals.map((d) => (
                <Card key={d.deal_id} padding="10px 14px">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text3)" }}>
                        #{d.deal_id} · {d.role === "setter" ? "Сеттер" : "Клоузер"} · {d.deal_type || "—"}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>
                        Сумма сделки: <strong>{FMT(d.deal_amount)}</strong>
                      </div>
                      {d.payment_date && (
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>Дата: {d.payment_date}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>{FMT(d.commission)}</div>
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>комиссия</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        {!calc.dev_breakdown && calc.deals.length === 0 && (
          <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
            Оплаченных сделок в периоде нет
          </div>
        )}

        {isAdmin && (
          <div style={{ marginTop: 24 }}>
            <Button variant="primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleCommit} disabled={committing} loading={committing}>
              Зафиксировать расчёт
            </Button>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6, textAlign: "center" }}>
              Создаст снимок PayrollRecord со статусом «черновик»
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dev Config Tab ──────────────────────────────────────────────
function DevConfigTab({ configs, onSaved, isAdmin }: { configs: DevPayrollConfig[]; onSaved: () => void; isAdmin: boolean }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Record<number, Partial<DevPayrollConfig>>>({});
  const [saving, setSaving] = useState<number | null>(null);

  function patch(id: number, key: keyof DevPayrollConfig, value: number) {
    setEditing(e => ({ ...e, [id]: { ...e[id], [key]: value } }));
  }

  function get(cfg: DevPayrollConfig, key: keyof DevPayrollConfig): number {
    return (editing[cfg.id]?.[key] ?? cfg[key]) as number;
  }

  async function save(cfg: DevPayrollConfig) {
    setSaving(cfg.id);
    try {
      await devPayrollConfigApi.update(cfg.id, {
        new_bot_price: get(cfg, "new_bot_price"),
        support_price: get(cfg, "support_price"),
        base_salary: get(cfg, "base_salary"),
        free_bots_limit: get(cfg, "free_bots_limit"),
      });
      onSaved();
      setEditing(e => { const n = { ...e }; delete n[cfg.id]; return n; });
    } catch (e: any) { toast(e.message || "Ошибка", "error"); }
    finally { setSaving(null); }
  }

  const ROLE_LABELS: Record<string, string> = { prompter: "Промпт-инженер", teamlead: "Тимлид" };

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16 }}>
        Глобальные ставки для расчёта зарплат разработки. Бэкендеры используют индивидуальные правила из вкладки «Правила».
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {configs.map((cfg) => (
          <Card key={cfg.id} padding={20}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{ROLE_LABELS[cfg.role_kind] ?? cfg.role_kind}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {([
                ["base_salary", "Оклад (сом)"],
                ["new_bot_price", "Цена нового бота (сом)"],
                ["support_price", "Цена тех. поддержки/бот (сом)"],
                ["free_bots_limit", "Ботов в фиксе (шт)"],
              ] as [keyof DevPayrollConfig, string][]).map(([key, label]) => (
                <FormField key={key} label={label}>
                  <Input type="number" min="0"
                    value={get(cfg, key)}
                    onChange={(e) => patch(cfg.id, key, parseInt(e.target.value) || 0)}
                    disabled={!isAdmin} />
                </FormField>
              ))}
            </div>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={() => save(cfg)} disabled={saving === cfg.id} loading={saving === cfg.id}>
                Сохранить
              </Button>
            )}
          </Card>
        ))}
        {configs.length === 0 && (
          <div style={{ color: "var(--text3)", padding: 20 }}>Настройки не найдены. Запустите seed_dev_payroll().</div>
        )}
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────
type Tab = "payroll" | "rules" | "records" | "dev_config";

export default function SalariesPage() {
  const { isAdmin, user: me } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("payroll");

  const [periodOffset, setPeriodOffset] = useState(0);
  const period = periodDates(periodOffset);

  const [calculations, setCalculations] = useState<PayrollCalculation[]>([]);
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [devConfigs, setDevConfigs] = useState<DevPayrollConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailCalc, setDetailCalc] = useState<PayrollCalculation | null>(null);
  const [detailUser, setDetailUser] = useState<string>("");
  const [ruleModal, setRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<PayrollRule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [calcResult, rulesResult, recsResult, usersResult, configsResult] = await Promise.all([
        payrollApi.calculate(period.start, period.end) as Promise<PayrollCalculation | PayrollCalculation[]>,
        payrollApi.rules(),
        payrollApi.records(),
        api.listUsers(),
        devPayrollConfigApi.list(),
      ]);
      const calcs = Array.isArray(calcResult) ? calcResult : [calcResult];
      setCalculations(calcs.filter(c => c.base_salary > 0 || c.commission_amount > 0 || c.total_amount > 0));
      setRules(rulesResult);
      setRecords(recsResult);
      setUsers(usersResult);
      setDevConfigs(configsResult);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [period.start, period.end]);

  useEffect(() => { loadData(); }, [loadData]);

  const usersMap: Record<number, string> = {};
  users.forEach(u => { usersMap[u.id] = u.name; });

  async function handleCommit(calc: PayrollCalculation) {
    await payrollApi.commit({
      employee_id: calc.employee_id,
      period_start: calc.period_start,
      period_end: calc.period_end,
    });
    await loadData();
    setDetailCalc(null);
    toast("Расчёт зафиксирован!");
  }

  const totals = calculations.reduce(
    (acc, c) => ({
      base: acc.base + c.base_salary,
      commission: acc.commission + c.commission_amount,
      total: acc.total + c.total_amount,
    }),
    { base: 0, commission: 0, total: 0 }
  );

  return (
    <Shell title="Зарплаты">
      <PageHeader
        title="Зарплаты"
        subtitle={`Расчёт и выплата — ${period.label}`}
        actions={
          <>
            <Button variant="ghost" icon="download" onClick={() => analyticsApi.exportXlsx("payroll")}>Excel</Button>
            {isAdmin && (
              <Button variant="primary" icon="add" onClick={() => { setEditingRule(null); setRuleModal(true); }}>Правило</Button>
            )}
          </>
        }
      />

      {/* Period switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Button variant="ghost" icon="chevron_left" onClick={() => setPeriodOffset(p => p - 1)} />
        <span style={{ fontWeight: 600, fontSize: 14, minWidth: 160, textAlign: "center" }}>{period.label}</span>
        <Button variant="ghost" icon="chevron_right" onClick={() => setPeriodOffset(p => p + 1)} disabled={periodOffset >= 0} />
        {periodOffset !== 0 && (
          <Button variant="ghost" size="sm" onClick={() => setPeriodOffset(0)}>Сегодня</Button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {([
          ["payroll", "Расчёт"],
          ["rules", "Правила"],
          ["records", "История"],
          ["dev_config", "Ставки разработки"],
        ] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
            color: tab === t ? "var(--primary)" : "var(--text2)",
            borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
            background: "none", border: "none", borderRadius: "4px 4px 0 0", cursor: "pointer",
          }}>{l}</button>
        ))}
      </div>

      {loading && <div style={{ color: "var(--text3)", padding: 40, textAlign: "center" }}>Загрузка...</div>}

      {/* ── Payroll Tab ── */}
      {!loading && tab === "payroll" && (
        <div>
          {calculations.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { label: "Суммарный ФОТ", value: FMT(totals.total), color: "var(--primary)" },
                { label: "Оклады", value: FMT(totals.base), color: "var(--text1)" },
                { label: "Комиссии", value: FMT(totals.commission), color: "var(--green)" },
              ].map(({ label, value, color }) => (
                <Card key={label} padding="12px 18px">
                  <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                </Card>
              ))}
            </div>
          )}

          <div className="card" style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
                  {["Сотрудник", "Оклад", "Сделок", "Сумма сделок", "Комиссия", "Бонусы", "Штрафы", "Итого", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)", textAlign: h === "Итого" || h === "Комиссия" || h === "Оклад" ? "right" : "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calculations.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "var(--text3)" }}>
                    Нет данных. Убедитесь что для сотрудников заданы правила зарплат.
                  </td></tr>
                )}
                {calculations.map(c => (
                  <tr key={c.employee_id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => { setDetailCalc(c); setDetailUser(usersMap[c.employee_id] ?? `#${c.employee_id}`); }}>
                    <td style={{ padding: "12px 14px", fontWeight: 500 }}>
                      {usersMap[c.employee_id] ?? `Сотрудник #${c.employee_id}`}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
                      {c.base_salary > 0 ? FMT(c.base_salary) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 13 }}>
                      {c.deals.length}
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
                      {c.deals.length > 0 ? FMT(c.deals.reduce((s, d) => s + d.deal_amount, 0)) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: c.commission_amount > 0 ? "var(--primary)" : "var(--text3)" }}>
                      {c.commission_amount > 0 ? FMT(c.commission_amount) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 13, color: c.bonus_amount > 0 ? "var(--green)" : "var(--text3)" }}>
                      {c.bonus_amount > 0 ? FMT(c.bonus_amount) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 13, color: c.penalty_amount > 0 ? "var(--red)" : "var(--text3)" }}>
                      {c.penalty_amount > 0 ? FMT(c.penalty_amount) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--green)" }}>
                      {FMT(c.total_amount)}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--text3)" }}>chevron_right</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Rules Tab ── */}
      {!loading && tab === "rules" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            {isAdmin && (
              <Button variant="primary" icon="add" onClick={() => { setEditingRule(null); setRuleModal(true); }}>Новое правило</Button>
            )}
          </div>
          <div className="card" style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
                  {["Сотрудник", "Оклад", "Комиссия %", "Условие", "С", "По", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>Правил нет</td></tr>
                )}
                {rules.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>{r.employee?.name ?? `#${r.employee_id}`}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace" }}>{r.base_salary > 0 ? FMT(r.base_salary) : "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{r.commission_percent > 0 ? `${r.commission_percent}%` : "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ background: "var(--primary-dim)", color: "var(--primary)", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                        {r.commission_condition}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text3)", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{r.active_from}</td>
                    <td style={{ padding: "10px 14px", color: "var(--text3)", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{r.active_to ?? "∞"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <Button variant="ghost" size="sm" icon="edit" onClick={() => { setEditingRule(r); setRuleModal(true); }} />
                          <Button variant="danger" size="sm" icon="delete" onClick={() => setDeleteRuleId(r.id)} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Records Tab ── */}
      {!loading && tab === "records" && (
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
                {["Сотрудник", "Период", "Оклад", "Комиссия", "Итого", "Статус", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>
                  История выплат пуста. Зафиксируйте расчёт из вкладки «Расчёт».
                </td></tr>
              )}
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <td style={{ padding: "10px 14px", fontWeight: 500 }}>{r.employee?.name ?? `#${r.employee_id}`}</td>
                  <td style={{ padding: "10px 14px", color: "var(--text3)", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                    {r.period_start} — {r.period_end}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace" }}>{FMT(r.base_salary)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace", color: "var(--primary)" }}>{FMT(r.commission_amount)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--green)" }}>{FMT(r.total_amount)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{
                      padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                      background: r.status === "paid" ? "var(--green-bg)" : "var(--bg3)",
                      color: r.status === "paid" ? "var(--green)" : "var(--text3)",
                    }}>
                      {r.status === "paid" ? "Выплачено" : "Черновик"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {isAdmin && r.status === "draft" && (
                      <Button variant="ghost" size="sm" onClick={async () => { await payrollApi.updateRecordStatus(r.id, "paid"); loadData(); }}>
                        Отметить выплаченным
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Dev Config Tab ── */}
      {!loading && tab === "dev_config" && (
        <DevConfigTab configs={devConfigs} onSaved={loadData} isAdmin={!!isAdmin} />
      )}

      {/* Modals */}
      {ruleModal && (
        <RuleModal
          rule={editingRule}
          users={users}
          onClose={() => setRuleModal(false)}
          onSaved={loadData}
        />
      )}
      {detailCalc && (
        <DetailPanel
          calc={detailCalc}
          userName={detailUser}
          onClose={() => setDetailCalc(null)}
          onCommit={() => handleCommit(detailCalc)}
          isAdmin={!!isAdmin}
        />
      )}
      {deleteRuleId !== null && (
        <ConfirmModal
          open
          title="Удалить правило?"
          message="Это действие необратимо. Правило зарплаты будет удалено."
          confirmLabel="Удалить"
          variant="danger"
          onConfirm={async () => { await payrollApi.deleteRule(deleteRuleId!); setDeleteRuleId(null); loadData(); }}
          onCancel={() => setDeleteRuleId(null)}
        />
      )}
    </Shell>
  );
}
