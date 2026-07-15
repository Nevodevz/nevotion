"use client";

import { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/Shell";
import { Modal } from "@/components/Modal";
import { financeApi, settingsApi, analyticsApi } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import type {
  FinanceTransaction, Debt, AccountBalance, FinanceSummary, ExpenseCategory, Account,
} from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { Button, Input, Select, FormField, PageHeader, DateRangePicker } from "@/components/ui";

type Tab = "summary" | "income" | "expenses" | "debts" | "balances" | "sheets";

const FMT = (n: number) =>
  n.toLocaleString("ru-RU") + " с";

const COLOR_GREEN = "var(--green)";
const COLOR_RED = "var(--red)";

function SummaryCard({
  label, value, sub, warn, icon,
}: {
  label: string; value: string; sub?: string; warn?: boolean; icon: string;
}) {
  return (
    <div className="card" style={{ padding: "18px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 24, color: warn ? COLOR_RED : "var(--primary)", marginTop: 2 }}
      >
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: warn ? COLOR_RED : "var(--text1)" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function TxModal({
  onClose, onSave, categories, accounts,
}: {
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  categories: ExpenseCategory[];
  accounts: Account[];
}) {
  const toast = useToast();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!amount || !date) return;
    setSaving(true);
    try {
      await onSave({
        type, category: category || null, amount: parseInt(amount),
        date, comment, account_id: accountId ? parseInt(accountId) : null,
      });
      onClose();
    } catch (e: any) { toast(e.message || "Ошибка", "error"); } finally { setSaving(false); }
  }

  return (
    <Modal open title="Добавить транзакцию" onClose={onClose} width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={submit} disabled={saving || !amount} loading={saving}>Сохранить</Button>
        </>
      }>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["income", "expense"] as const).map(t => (
          <Button key={t} variant={type === t ? "primary" : "ghost"} onClick={() => setType(t)} style={{ flex: 1, justifyContent: "center" }}>
            {t === "income" ? "Доход" : "Расход"}
          </Button>
        ))}
      </div>
      {type === "expense" && (
        <FormField label="Категория">
          <Select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Без категории</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Select>
        </FormField>
      )}
      <FormField label="Сумма (сом)">
        <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
      </FormField>
      <FormField label="Дата">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </FormField>
      <FormField label="Счёт">
        <Select value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">Без счёта</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </FormField>
      <FormField label="Комментарий">
        <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Описание" />
      </FormField>
    </Modal>
  );
}

function DebtModal({ onClose, onSave }: { onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const toast = useToast();
  const [counterparty, setCounterparty] = useState("");
  const [direction, setDirection] = useState<"we_owe" | "owed_to_us">("we_owe");
  const [amount, setAmount] = useState("");
  const [createdDate, setCreatedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!counterparty || !amount) return;
    setSaving(true);
    try {
      await onSave({ counterparty, direction, amount: parseInt(amount), created_date: createdDate, due_date: dueDate || null, comment, status: "active" });
      onClose();
    } catch (e: any) { toast(e.message || "Ошибка", "error"); } finally { setSaving(false); }
  }

  return (
    <Modal open title="Добавить долг" onClose={onClose} width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={submit} disabled={saving || !counterparty || !amount} loading={saving}>Сохранить</Button>
        </>
      }>
      <FormField label="Контрагент">
        <Input value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="Имя или компания" />
      </FormField>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([["we_owe", "Мы должны"], ["owed_to_us", "Нам должны"]] as const).map(([v, l]) => (
          <Button key={v} variant={direction === v ? "primary" : "ghost"} onClick={() => setDirection(v)} style={{ flex: 1, justifyContent: "center" }}>
            {l}
          </Button>
        ))}
      </div>
      <FormField label="Сумма (сом)">
        <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Дата создания">
          <Input type="date" value={createdDate} onChange={e => setCreatedDate(e.target.value)} />
        </FormField>
        <FormField label="Срок оплаты">
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Комментарий">
        <Input value={comment} onChange={e => setComment(e.target.value)} />
      </FormField>
    </Modal>
  );
}

function AddBalanceModal({ accounts, onClose, onSave }: { accounts: Account[]; onClose: () => void; onSave: (data: any) => Promise<void> }) {
  const toast = useToast();
  const [accountId, setAccountId] = useState(accounts[0]?.id ? String(accounts[0].id) : "");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!balance || !accountId) return;
    setSaving(true);
    try {
      await onSave({ account_id: parseInt(accountId), date: new Date().toISOString().slice(0, 10), balance: parseInt(balance), comment: "" });
      onClose();
    } catch (e: any) { toast(e.message || "Ошибка", "error"); } finally { setSaving(false); }
  }

  return (
    <Modal open title="Снимок остатка" onClose={onClose} width={380}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={submit} disabled={saving || !balance} loading={saving}>Сохранить</Button>
        </>
      }>
      <FormField label="Счёт">
        <Select value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </FormField>
      <FormField label="Остаток (сом)">
        <Input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0" autoFocus />
      </FormField>
    </Modal>
  );
}

const DEBT_STATUS: Record<string, { label: string; color: string }> = {
  active:  { label: "Активный",  color: "var(--yellow)" },
  partial: { label: "Частично",  color: "var(--orange, #e67e22)" },
  paid:    { label: "Оплачен",   color: "var(--green)" },
  overdue: { label: "Просрочен", color: "var(--red)" },
};

export default function FinancePage() {
  const { isAdmin } = useApp();
  const [tab, setTab] = useState<Tab>("summary");
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [totalTx, setTotalTx] = useState(0);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [txType, setTxType] = useState<"income" | "expense" | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, debtRes, balRes, sumRes, catRes, accRes] = await Promise.all([
        financeApi.transactions({ type: txType || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, limit: 100 }),
        financeApi.debts(),
        financeApi.balances(),
        financeApi.summary({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
        settingsApi.listExpenseCategories(),
        settingsApi.listAccounts(),
      ]);
      setTransactions(txRes.items);
      setTotalTx(txRes.total);
      setDebts(debtRes);
      setBalances(balRes);
      setSummary(sumRes);
      setCategories(catRes);
      setAccounts(accRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [txType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const income = transactions.filter(t => t.type === "income");
  const expenses = transactions.filter(t => t.type === "expense");

  return (
    <Shell title="Финансы">
      <PageHeader
        title="Финансы"
        subtitle="Доходы, расходы, долги и счета"
        actions={
          <>
            <Button variant="ghost" icon="download" onClick={() => analyticsApi.exportXlsx("finance")}>Excel</Button>
            {isAdmin && (
              <Button variant="primary" icon="add" onClick={() => setShowTxModal(true)}>Добавить</Button>
            )}
          </>
        }
      />

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <DateRangePicker
          value={{ from: dateFrom, to: dateTo }}
          onChange={v => { setDateFrom(v.from); setDateTo(v.to); }}
          onReset={() => { setDateFrom(""); setDateTo(""); }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {([
          ["summary", "Итог"],
          ["income", "Доходы"],
          ["expenses", "Расходы"],
          ["debts", "Долги"],
          ["balances", "Счета"],
          ["sheets", "Таблица"],
        ] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--primary)" : "var(--text2)",
              borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
              background: "none", border: "none", borderRadius: "4px 4px 0 0", cursor: "pointer",
            }}>
            {l}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "var(--text3)", padding: 40, textAlign: "center" }}>Загрузка...</div>}

      {!loading && tab === "summary" && summary && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
            <SummaryCard label="Доходы" value={FMT(summary.income)} icon="trending_up" />
            <SummaryCard label="Расходы" value={FMT(summary.expenses)} icon="trending_down" />
            <SummaryCard label="Прибыль" value={FMT(summary.profit)} icon="account_balance_wallet" warn={summary.profit < 0} />
            <SummaryCard label="ФОТ" value={FMT(summary.fot)} icon="group" />
            <SummaryCard label="Маркетинг" value={FMT(summary.marketing_expenses)} icon="campaign" />
            <SummaryCard label="Деньги на счетах" value={FMT(summary.total_on_accounts)} icon="savings" />
            <SummaryCard label="Мы должны" value={FMT(summary.we_owe)} icon="arrow_upward" warn={summary.we_owe > 0} />
            <SummaryCard label="Нам должны" value={FMT(summary.owed_to_us)} icon="arrow_downward" />
            <SummaryCard label="Ожидаем (30д)" value={FMT(summary.plan_income_30d)} icon="schedule" />
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 14 }}>Прогноз кассового разрыва</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {([
                { label: "Через 7 дней", val: summary.cashflow_forecast.days_7, warn: summary.cashflow_forecast.warning_7 },
                { label: "Через 14 дней", val: summary.cashflow_forecast.days_14, warn: summary.cashflow_forecast.warning_14 },
                { label: "Через 30 дней", val: summary.cashflow_forecast.days_30, warn: summary.cashflow_forecast.warning_30 },
              ]).map(({ label, val, warn }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: warn ? COLOR_RED : COLOR_GREEN }}>
                    {warn && <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "middle", marginRight: 4 }}>warning</span>}
                    {FMT(val)}
                  </div>
                  {warn && <div style={{ fontSize: 11, color: COLOR_RED }}>Кассовый разрыв!</div>}
                </div>
              ))}
            </div>
          </div>

          {summary.account_balances.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Остатки на счетах</div>
              {summary.account_balances.map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{b.account?.name || `Счёт ${b.account_id}`}</span>
                  <span style={{ fontWeight: 600 }}>{FMT(b.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && tab === "income" && (
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text3)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Дата</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Комментарий</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Сумма</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Способ</th>
              </tr>
            </thead>
            <tbody>
              {income.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>Нет доходов</td></tr>
              )}
              {income.map(t => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <td style={{ padding: "8px 12px" }}>{t.date}</td>
                  <td style={{ padding: "8px 12px" }}>{t.comment || "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: COLOR_GREEN }}>{FMT(t.amount)}</td>
                  <td style={{ padding: "8px 12px", color: "var(--text3)" }}>{t.payment_method || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "expenses" && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 12 }}>
              <Button variant="primary" icon="add" onClick={() => setShowTxModal(true)}>Добавить расход</Button>
            </div>
          )}
          <div className="card" style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text3)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Дата</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Категория</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Комментарий</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>Нет расходов</td></tr>
                )}
                {expenses.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "8px 12px" }}>{t.date}</td>
                    <td style={{ padding: "8px 12px" }}>
                      {t.category && <span style={{ background: "var(--bg3)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>{t.category}</span>}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{t.comment || "—"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: COLOR_RED }}>{FMT(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === "debts" && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 12 }}>
              <Button variant="primary" icon="add" onClick={() => setShowDebtModal(true)}>Добавить долг</Button>
            </div>
          )}
          <div className="card" style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text3)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Контрагент</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Направление</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Сумма</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Срок</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {debts.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>Нет долгов</td></tr>
                )}
                {debts.map(d => {
                  const st = DEBT_STATUS[d.status] || { label: d.status, color: "var(--text3)" };
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{d.counterparty}</td>
                      <td style={{ padding: "8px 12px", color: d.direction === "we_owe" ? COLOR_RED : COLOR_GREEN }}>
                        {d.direction === "we_owe" ? "Мы должны" : "Нам должны"}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{FMT(d.amount)}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text3)" }}>{d.due_date || "—"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ color: st.color, fontWeight: 500, fontSize: 12 }}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === "balances" && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 12 }}>
              <Button variant="primary" icon="add" onClick={() => setShowBalanceModal(true)}>Снимок остатка</Button>
            </div>
          )}
          <div className="card" style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text3)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Счёт</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Дата</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Остаток</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {balances.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>Нет данных</td></tr>
                )}
                {balances.map(b => (
                  <tr key={b.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{b.account?.name || `Счёт ${b.account_id}`}</td>
                    <td style={{ padding: "8px 12px" }}>{b.date}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{FMT(b.balance)}</td>
                    <td style={{ padding: "8px 12px", color: "var(--text3)" }}>{b.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "sheets" && (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text3)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 12 }}>table_chart</span>
          <div style={{ fontWeight: 500, color: "var(--text2)", marginBottom: 8 }}>Google Sheets</div>
          <div style={{ fontSize: 13 }}>
            Для встроенной таблицы перейдите в{" "}
            <a href="/dept/finance" style={{ color: "var(--primary)" }}>Отдел финансов</a>
          </div>
        </div>
      )}

      {showTxModal && (
        <TxModal
          onClose={() => setShowTxModal(false)}
          onSave={async (data) => { await financeApi.createTransaction(data); await load(); }}
          categories={categories}
          accounts={accounts}
        />
      )}
      {showDebtModal && (
        <DebtModal
          onClose={() => setShowDebtModal(false)}
          onSave={async (data) => { await financeApi.createDebt(data); await load(); }}
        />
      )}
      {showBalanceModal && (
        <AddBalanceModal
          accounts={accounts}
          onClose={() => setShowBalanceModal(false)}
          onSave={async (data) => { await financeApi.createBalance(data); await load(); }}
        />
      )}
    </Shell>
  );
}
