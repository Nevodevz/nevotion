"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button, ConfirmModal, FormField, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { leadApi } from "@/lib/api";
import { fmtDate, fmtMoney, todayBishkek } from "@/lib/format";
import type { Account, DealPayment, PaymentSchedule as Schedule } from "@/lib/types";
import { PAYMENT_METHODS, PAYMENT_STATUS } from "@/lib/types";

function StatusChip({ payment }: { payment: DealPayment }) {
  const s = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.planned;
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

/** Compact money read-out: сумма сделки / оплачено / остаток. */
export function FinanceSummary({ schedule }: { schedule: Schedule }) {
  const deal = schedule.deal;
  const amount = deal?.amount ?? 0;
  const paid = deal?.paid_amount ?? 0;
  const remaining = deal?.remaining_amount ?? 0;
  const pct = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;

  const cell = (label: string, value: string, color?: string) => (
    <div style={{ flex: "1 1 140px" }}>
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "var(--text1)" }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        {cell("Сумма сделки", fmtMoney(amount))}
        {cell("Оплачено", fmtMoney(paid), "var(--green)")}
        {cell("Остаток", fmtMoney(remaining), remaining > 0 ? "var(--yellow)" : "var(--green)")}
      </div>

      <div style={{ height: 6, borderRadius: 3, background: "var(--bg3)", overflow: "hidden" }}
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        aria-label="Доля оплаты">
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--green)", transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
        Оплачено {pct}% от суммы сделки
        {schedule.unscheduled_amount > 0 && (
          <> · не распределено по графику: <b style={{ color: "var(--yellow)" }}>{fmtMoney(schedule.unscheduled_amount)}</b></>
        )}
      </div>
    </div>
  );
}

const EMPTY_FORM = { planned_date: "", planned_amount: "", payment_method: "", account_id: "", comment: "" };

function PaymentFormModal({
  payment, accounts, maxAmount, onClose, onSubmit,
}: {
  payment: DealPayment | null;
  accounts: Account[];
  maxAmount: number;
  onClose: () => void;
  onSubmit: (data: {
    planned_date: string; planned_amount: number;
    payment_method: string; account_id: number | null; comment: string;
  }) => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState(() => payment ? {
    planned_date: payment.planned_date,
    planned_amount: String(payment.planned_amount),
    payment_method: payment.payment_method,
    account_id: payment.account_id ? String(payment.account_id) : "",
    comment: payment.comment,
  } : { ...EMPTY_FORM, planned_date: todayBishkek(), planned_amount: String(maxAmount || "") });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    const amount = Number(form.planned_amount);
    if (!form.planned_date) { toast("Укажите плановую дату", "error"); return; }
    if (!amount || amount <= 0) { toast("Укажите плановую сумму", "error"); return; }
    setSaving(true);
    try {
      await onSubmit({
        planned_date: form.planned_date,
        planned_amount: amount,
        payment_method: form.payment_method,
        account_id: form.account_id ? Number(form.account_id) : null,
        comment: form.comment,
      });
      onClose();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={payment ? "Изменить платёж" : "Добавить платёж"} onClose={onClose} width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={submit} loading={saving} disabled={saving}>Сохранить</Button>
        </>
      }>
      <FormField label="Плановая дата" required>
        <Input type="date" value={form.planned_date} onChange={set("planned_date")} />
      </FormField>
      <FormField label="Плановая сумма" required>
        <Input type="number" min={0} value={form.planned_amount} onChange={set("planned_amount")} suffix="сом" />
      </FormField>
      {maxAmount > 0 && !payment && (
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: -8, marginBottom: 12 }}>
          Не распределено по графику: {fmtMoney(maxAmount)}
        </div>
      )}
      <FormField label="Способ оплаты">
        <Select value={form.payment_method} onChange={set("payment_method")}>
          <option value="">— не выбран —</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </FormField>
      <FormField label="Счёт">
        <Select value={form.account_id} onChange={set("account_id")}>
          <option value="">— не выбран —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </FormField>
      <FormField label="Комментарий">
        <Textarea rows={2} value={form.comment} onChange={set("comment")} />
      </FormField>
    </Modal>
  );
}

function ConfirmPaymentModal({
  payment, accounts, onClose, onSubmit,
}: {
  payment: DealPayment;
  accounts: Account[];
  onClose: () => void;
  onSubmit: (data: {
    amount: number; paid_date: string; payment_method: string;
    account_id: number | null; comment: string;
  }) => Promise<void>;
}) {
  const toast = useToast();
  const outstanding = payment.planned_amount - payment.paid_amount;
  const [form, setForm] = useState({
    amount: String(payment.planned_amount),
    paid_date: payment.paid_date ?? todayBishkek(),
    payment_method: payment.payment_method,
    account_id: payment.account_id ? String(payment.account_id) : "",
    comment: payment.comment,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount < 0) { toast("Укажите сумму оплаты", "error"); return; }
    setSaving(true);
    try {
      await onSubmit({
        amount,
        paid_date: form.paid_date,
        payment_method: form.payment_method,
        account_id: form.account_id ? Number(form.account_id) : null,
        comment: form.comment,
      });
      onClose();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Зафиксировать оплату" onClose={onClose} width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={submit} loading={saving} disabled={saving}>Зафиксировать</Button>
        </>
      }>
      <div style={{ fontSize: 12, color: "var(--text2)", background: "var(--bg3)", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
        Плановая сумма: <b>{fmtMoney(payment.planned_amount)}</b>
        {payment.paid_amount > 0 && <> · уже оплачено: <b>{fmtMoney(payment.paid_amount)}</b> · осталось: <b>{fmtMoney(outstanding)}</b></>}
        <div style={{ color: "var(--text3)", marginTop: 4 }}>
          Укажите итоговую оплаченную сумму по этому траншу. Частичная оплата допускается.
        </div>
      </div>
      <FormField label="Оплачено" required>
        <Input type="number" min={0} max={payment.planned_amount} value={form.amount} onChange={set("amount")} suffix="сом" />
      </FormField>
      <FormField label="Дата оплаты" required>
        <Input type="date" value={form.paid_date} onChange={set("paid_date")} />
      </FormField>
      <FormField label="Способ оплаты">
        <Select value={form.payment_method} onChange={set("payment_method")}>
          <option value="">— не выбран —</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </FormField>
      <FormField label="Счёт">
        <Select value={form.account_id} onChange={set("account_id")}>
          <option value="">— не выбран —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </FormField>
      <FormField label="Комментарий">
        <Textarea rows={2} value={form.comment} onChange={set("comment")} />
      </FormField>
    </Modal>
  );
}

/**
 * Payment schedule for a deal: plan, edit, and confirm actual payments.
 *
 * All money rules (schedule ≤ deal amount, overdue detection, deal status) are
 * enforced server-side; this component surfaces them.
 */
export function PaymentScheduleSection({
  leadId, schedule, accounts, canManage, loading, error, onChanged, onRetry,
}: {
  leadId: number;
  schedule: Schedule | null;
  accounts: Account[];
  canManage: boolean;
  loading: boolean;
  error: string | null;
  onChanged: (next: Schedule) => void;
  onRetry: () => void;
}) {
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DealPayment | null>(null);
  const [confirming, setConfirming] = useState<DealPayment | null>(null);
  const [deleting, setDeleting] = useState<DealPayment | null>(null);

  if (error) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center" }}>
        <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</div>
        <Button size="sm" variant="ghost" onClick={onRetry}>Повторить</Button>
      </div>
    );
  }

  if (loading || !schedule) {
    return <div style={{ padding: "24px 0", color: "var(--text3)", fontSize: 13 }}>Загрузка графика оплат…</div>;
  }

  if (!schedule.deal) {
    return (
      <div style={{ padding: "20px 0", color: "var(--text3)", fontSize: 13 }}>
        У лида ещё нет сделки. Укажите сумму сделки в карточке лида, чтобы построить график оплат.
      </div>
    );
  }

  const payments = schedule.payments;

  return (
    <>
      <FinanceSummary schedule={schedule} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)" }}>График оплат</div>
        {canManage && (
          <Button size="sm" variant="ghost" icon="add"
            disabled={schedule.unscheduled_amount <= 0}
            title={schedule.unscheduled_amount <= 0 ? "Вся сумма сделки уже распределена" : undefined}
            onClick={() => setAddOpen(true)}>
            Добавить платёж
          </Button>
        )}
      </div>

      {payments.length === 0 ? (
        <div style={{ padding: "20px 0", color: "var(--text3)", fontSize: 13 }}>
          График оплат пуст{canManage ? " — добавьте первый плановый платёж" : ""}.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ background: "var(--bg2)" }}>
                {["План. дата", "План. сумма", "Оплачено", "Дата оплаты", "Статус", "Способ", "Комментарий", ""].map((h, i) => (
                  <th key={i} style={{
                    padding: "8px 10px", textAlign: i === 1 || i === 2 ? "right" : "left",
                    fontSize: 11, color: "var(--text3)", fontWeight: 600, whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} style={{
                  borderBottom: "1px solid var(--border)",
                  opacity: p.status === "cancelled" ? 0.55 : 1,
                }}>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap", color: p.is_overdue ? "var(--red)" : "var(--text2)" }}>
                    {fmtDate(p.planned_date)}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {fmtMoney(p.planned_amount)}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", whiteSpace: "nowrap", color: p.paid_amount > 0 ? "var(--green)" : "var(--text3)" }}>
                    {p.paid_amount > 0 ? fmtMoney(p.paid_amount) : "—"}
                  </td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap", color: "var(--text3)" }}>
                    {p.paid_date ? fmtDate(p.paid_date) : "—"}
                  </td>
                  <td style={{ padding: "9px 10px" }}><StatusChip payment={p} /></td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>{p.payment_method || "—"}</td>
                  <td style={{ padding: "9px 10px", color: "var(--text3)", maxWidth: 200 }}>
                    <div>{p.comment || "—"}</div>
                    {(p.author || p.editor) && (
                      <div style={{ fontSize: 10, marginTop: 2 }}>
                        {(p.editor ?? p.author)?.name} · {fmtDate(p.updated_at)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {canManage && p.status !== "cancelled" && (
                      <div style={{ display: "inline-flex", gap: 4 }}>
                        {p.status !== "paid" && (
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(p)}>
                            Зафиксировать
                          </Button>
                        )}
                        <button title="Изменить" onClick={() => setEditing(p)}
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text3)", display: "flex", padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                        </button>
                        <button title="Удалить" onClick={() => setDeleting(p)}
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text3)", display: "flex", padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <PaymentFormModal
          payment={null}
          accounts={accounts}
          maxAmount={schedule.unscheduled_amount}
          onClose={() => setAddOpen(false)}
          onSubmit={async (data) => {
            onChanged(await leadApi.createPayment(leadId, data));
            toast("Платёж добавлен", "success");
          }}
        />
      )}

      {editing && (
        <PaymentFormModal
          payment={editing}
          accounts={accounts}
          maxAmount={schedule.unscheduled_amount + editing.planned_amount}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            onChanged(await leadApi.updatePayment(leadId, editing.id, data));
            toast("Платёж обновлён", "success");
          }}
        />
      )}

      {confirming && (
        <ConfirmPaymentModal
          payment={confirming}
          accounts={accounts}
          onClose={() => setConfirming(null)}
          onSubmit={async (data) => {
            onChanged(await leadApi.confirmPayment(leadId, confirming.id, data));
            toast("Оплата зафиксирована", "success");
          }}
        />
      )}

      <ConfirmModal
        open={deleting !== null}
        title="Удалить платёж"
        message={
          deleting && deleting.paid_amount > 0
            ? "У платежа есть подтверждённая оплата — связанная финансовая транзакция также будет удалена."
            : "Плановый платёж будет удалён из графика."
        }
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={async () => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          try {
            onChanged(await leadApi.deletePayment(leadId, target.id));
            toast("Платёж удалён", "success");
          } catch (e: unknown) {
            toast((e as Error).message, "error");
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
