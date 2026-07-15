"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { useApp } from "@/context/AppContext";
import { settingsApi } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import type { LeadSource, ServiceItem, LeadStage, RejectReason, ExpenseCategory, Account } from "@/lib/types";
import { Button, Input, PageHeader } from "@/components/ui";

type Tab = "sources" | "services" | "stages" | "reject" | "expense" | "accounts";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "sources",  label: "Источники",          icon: "share" },
  { key: "services", label: "Услуги",              icon: "design_services" },
  { key: "stages",   label: "Этапы воронки",       icon: "filter_alt" },
  { key: "reject",   label: "Причины отказа",      icon: "cancel" },
  { key: "expense",  label: "Статьи расходов",     icon: "receipt_long" },
  { key: "accounts", label: "Счета",               icon: "account_balance_wallet" },
];

// ── Generic lookup list (name + is_active) ──────────────────────

function LookupSection({
  items,
  onAdd,
  onRename,
  onToggle,
  onMoveUp,
  onMoveDown,
  extraCols,
}: {
  items: any[];
  onAdd: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onToggle: (id: number, is_active: boolean) => Promise<void>;
  onMoveUp: (id: number) => Promise<void>;
  onMoveDown: (id: number) => Promise<void>;
  extraCols?: (item: any) => React.ReactNode;
}) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    try { await onAdd(newName.trim()); setNewName(""); } finally { setBusy(false); }
  }

  async function handleRename(id: number) {
    if (!editName.trim()) return;
    setBusy(true);
    try { await onRename(id, editName.trim()); setEditId(null); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Input
            placeholder="Новый пункт…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        </div>
        <Button variant="primary" icon="add" onClick={handleAdd} disabled={busy || !newName.trim()}>
          Добавить
        </Button>
      </div>

      <div className="sett-list">
        {items.map((item, idx) => (
          <div key={item.id} className="sett-row">
            {editId === item.id ? (
              <div style={{ flex: 1 }}>
                <Input
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(item.id);
                    if (e.key === "Escape") setEditId(null);
                  }}
                  onBlur={() => handleRename(item.id)}
                />
              </div>
            ) : (
              <span className={`sett-name ${"is_active" in item && !item.is_active ? "sett-name-inactive" : ""}`}>
                {item.name}
              </span>
            )}

            {extraCols && extraCols(item)}

            {"is_active" in item && (
              <span className={`sett-status ${item.is_active ? "sett-status-on" : "sett-status-off"}`}>
                {item.is_active ? "Активен" : "Выключен"}
              </span>
            )}

            <div className="sett-actions">
              <button className="sett-icon-btn" onClick={() => onMoveUp(item.id)} disabled={idx === 0} title="Вверх">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_upward</span>
              </button>
              <button className="sett-icon-btn" onClick={() => onMoveDown(item.id)} disabled={idx === items.length - 1} title="Вниз">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_downward</span>
              </button>
              <button className="sett-icon-btn" onClick={() => { setEditId(item.id); setEditName(item.name); }} title="Переименовать">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
              </button>
              {"is_active" in item && (
                <button
                  className="sett-icon-btn"
                  onClick={() => onToggle(item.id, !item.is_active)}
                  title={item.is_active ? "Отключить" : "Включить"}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {item.is_active ? "visibility" : "visibility_off"}
                  </span>
                </button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>Список пуст</div>
        )}
      </div>
    </div>
  );
}

// ── Stages section (extra fields) ───────────────────────────────

function StagesSection({
  stages,
  onAdd,
  onUpdate,
  onMoveUp,
  onMoveDown,
}: {
  stages: LeadStage[];
  onAdd: (data: any) => Promise<void>;
  onUpdate: (id: number, data: any) => Promise<void>;
  onMoveUp: (id: number) => Promise<void>;
  onMoveDown: (id: number) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<LeadStage>>({});
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    try { await onAdd({ name: newName.trim() }); setNewName(""); } finally { setBusy(false); }
  }

  async function handleSave(id: number) {
    setBusy(true);
    try { await onUpdate(id, editData); setEditId(null); setEditData({}); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Input
            placeholder="Новый этап…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        </div>
        <Button variant="primary" icon="add" onClick={handleAdd} disabled={busy || !newName.trim()}>
          Добавить
        </Button>
      </div>

      <div className="sett-list">
        {stages.map((stage, idx) => (
          <div key={stage.id} className="sett-row">
            <div
              className="stage-color-dot"
              style={{ background: stage.color, flexShrink: 0 }}
            />

            {editId === stage.id ? (
              <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 140px" }}>
                  <Input
                    value={editData.name ?? stage.name}
                    autoFocus
                    onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Цвет</span>
                  <input
                    type="color"
                    value={editData.color ?? stage.color}
                    onChange={(e) => setEditData((d) => ({ ...d, color: e.target.value }))}
                    style={{
                      width: 38, height: 38, border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius-md)", background: "var(--bg-input)",
                      cursor: "pointer", padding: 2,
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Норма дней</span>
                  <Input
                    type="number"
                    style={{ width: 72 }}
                    value={editData.norm_days ?? stage.norm_days ?? ""}
                    onChange={(e) => setEditData((d) => ({ ...d, norm_days: e.target.value ? Number(e.target.value) : null }))}
                  />
                </div>
                <label style={{ fontSize: 12, color: "var(--text3)", display: "flex", alignItems: "center", gap: 4, paddingBottom: 8 }}>
                  <input type="checkbox" checked={editData.is_won ?? stage.is_won}
                    onChange={(e) => setEditData((d) => ({ ...d, is_won: e.target.checked }))} />
                  Оплачено
                </label>
                <label style={{ fontSize: 12, color: "var(--text3)", display: "flex", alignItems: "center", gap: 4, paddingBottom: 8 }}>
                  <input type="checkbox" checked={editData.is_lost ?? stage.is_lost}
                    onChange={(e) => setEditData((d) => ({ ...d, is_lost: e.target.checked }))} />
                  Минус
                </label>
                <Button variant="primary" size="sm" onClick={() => handleSave(stage.id)} disabled={busy}>Сохранить</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditId(null); setEditData({}); }}>Отмена</Button>
              </div>
            ) : (
              <>
                <span className="sett-name">{stage.name}</span>
                {stage.norm_days != null && (
                  <span className="sett-badge" style={{ background: "var(--bg3)", color: "var(--text3)" }}>{stage.norm_days}д</span>
                )}
                {stage.is_won && <span className="sett-badge" style={{ background: "var(--green-bg)", color: "var(--green)" }}>Оплачено</span>}
                {stage.is_lost && <span className="sett-badge" style={{ background: "var(--red-bg)", color: "var(--red)" }}>Минус</span>}
                <div className="sett-actions">
                  <button className="sett-icon-btn" onClick={() => onMoveUp(stage.id)} disabled={idx === 0} title="Вверх">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_upward</span>
                  </button>
                  <button className="sett-icon-btn" onClick={() => onMoveDown(stage.id)} disabled={idx === stages.length - 1} title="Вниз">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_downward</span>
                  </button>
                  <button className="sett-icon-btn" onClick={() => { setEditId(stage.id); setEditData({}); }} title="Редактировать">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {stages.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>Список пуст</div>
        )}
      </div>
    </div>
  );
}

// ── Accounts section ─────────────────────────────────────────────

function AccountsSection({
  accounts,
  onAdd,
  onUpdate,
  onMoveUp,
  onMoveDown,
}: {
  accounts: Account[];
  onAdd: (data: any) => Promise<void>;
  onUpdate: (id: number, data: any) => Promise<void>;
  onMoveUp: (id: number) => Promise<void>;
  onMoveDown: (id: number) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("сом");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("сом");
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    try { await onAdd({ name: newName.trim(), currency: newCurrency }); setNewName(""); setNewCurrency("сом"); } finally { setBusy(false); }
  }

  async function handleSave(id: number) {
    setBusy(true);
    try { await onUpdate(id, { name: editName, currency: editCurrency }); setEditId(null); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <Input placeholder="Название счёта…" value={newName}
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        </div>
        <Input style={{ width: 80 }} placeholder="Валюта" value={newCurrency}
          onChange={(e) => setNewCurrency(e.target.value)} />
        <Button variant="primary" icon="add" onClick={handleAdd} disabled={busy || !newName.trim()}>
          Добавить
        </Button>
      </div>

      <div className="sett-list">
        {accounts.map((acc, idx) => (
          <div key={acc.id} className="sett-row">
            {editId === acc.id ? (
              <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <Input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)} />
                </div>
                <Input style={{ width: 80 }} value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)} />
                <Button variant="primary" size="sm" onClick={() => handleSave(acc.id)}>Сохранить</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>Отмена</Button>
              </div>
            ) : (
              <>
                <span className={`sett-name ${!acc.is_active ? "sett-name-inactive" : ""}`}>{acc.name}</span>
                <span className="sett-badge" style={{ background: "var(--bg3)", color: "var(--text3)" }}>{acc.currency}</span>
                <span className={`sett-status ${acc.is_active ? "sett-status-on" : "sett-status-off"}`}>
                  {acc.is_active ? "Активен" : "Выключен"}
                </span>
                <div className="sett-actions">
                  <button className="sett-icon-btn" onClick={() => onMoveUp(acc.id)} disabled={idx === 0} title="Вверх">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_upward</span>
                  </button>
                  <button className="sett-icon-btn" onClick={() => onMoveDown(acc.id)} disabled={idx === accounts.length - 1} title="Вниз">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_downward</span>
                  </button>
                  <button className="sett-icon-btn" onClick={() => { setEditId(acc.id); setEditName(acc.name); setEditCurrency(acc.currency); }} title="Переименовать">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  </button>
                  <button
                    className="sett-icon-btn"
                    onClick={() => onUpdate(acc.id, { is_active: !acc.is_active })}
                    title={acc.is_active ? "Отключить" : "Включить"}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {acc.is_active ? "visibility" : "visibility_off"}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {accounts.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>Список пуст</div>
        )}
      </div>
    </div>
  );
}


// ── Main page ────────────────────────────────────────────────────

export default function SettingsPage() {
  const { isAdmin } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("sources");

  const [sources, setSources] = useState<LeadSource[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [rejectReasons, setRejectReasons] = useState<RejectReason[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!isAdmin) { router.push("/dashboard"); return; }
    loadAll();
  }, [isAdmin]);

  async function loadAll() {
    const [s, sv, st, rr, ec, ac] = await Promise.all([
      settingsApi.listSources().catch(() => []),
      settingsApi.listServices().catch(() => []),
      settingsApi.listStages().catch(() => []),
      settingsApi.listRejectReasons().catch(() => []),
      settingsApi.listExpenseCategories().catch(() => []),
      settingsApi.listAccounts().catch(() => []),
    ]);
    setSources(s as LeadSource[]);
    setServices(sv as ServiceItem[]);
    setStages(st as LeadStage[]);
    setRejectReasons(rr as RejectReason[]);
    setExpenseCategories(ec as ExpenseCategory[]);
    setAccounts(ac as Account[]);
  }

  async function wrap(fn: () => Promise<void>, reload: () => Promise<void>) {
    try { await fn(); await reload(); toast("Сохранено", "success"); }
    catch (e: any) { toast(e.message || "Ошибка", "error"); }
  }

  // Sources
  const loadSources = async () => setSources(await settingsApi.listSources());
  const srcHandlers = {
    onAdd: (name: string) => wrap(() => settingsApi.createSource(name).then(), loadSources),
    onRename: (id: number, name: string) => wrap(() => settingsApi.updateSource(id, { name }).then(), loadSources),
    onToggle: (id: number, is_active: boolean) => wrap(() => settingsApi.updateSource(id, { is_active }).then(), loadSources),
    onMoveUp: (id: number) => {
      const idx = sources.findIndex((s) => s.id === id);
      if (idx <= 0) return Promise.resolve();
      return wrap(() => settingsApi.reorderSource(id, idx - 1).then((r) => setSources(r as LeadSource[])), async () => {});
    },
    onMoveDown: (id: number) => {
      const idx = sources.findIndex((s) => s.id === id);
      if (idx >= sources.length - 1) return Promise.resolve();
      return wrap(() => settingsApi.reorderSource(id, idx + 1).then((r) => setSources(r as LeadSource[])), async () => {});
    },
  };

  // Services
  const loadServices = async () => setServices(await settingsApi.listServices());
  const svcHandlers = {
    onAdd: (name: string) => wrap(() => settingsApi.createService(name).then(), loadServices),
    onRename: (id: number, name: string) => wrap(() => settingsApi.updateService(id, { name }).then(), loadServices),
    onToggle: (id: number, is_active: boolean) => wrap(() => settingsApi.updateService(id, { is_active }).then(), loadServices),
    onMoveUp: (id: number) => {
      const idx = services.findIndex((s) => s.id === id);
      if (idx <= 0) return Promise.resolve();
      return wrap(() => settingsApi.reorderService(id, idx - 1).then((r) => setServices(r as ServiceItem[])), async () => {});
    },
    onMoveDown: (id: number) => {
      const idx = services.findIndex((s) => s.id === id);
      if (idx >= services.length - 1) return Promise.resolve();
      return wrap(() => settingsApi.reorderService(id, idx + 1).then((r) => setServices(r as ServiceItem[])), async () => {});
    },
  };

  // Stages
  const loadStages = async () => setStages(await settingsApi.listStages());
  const stageHandlers = {
    onAdd: (data: any) => wrap(() => settingsApi.createStage(data).then(), loadStages),
    onUpdate: (id: number, data: any) => wrap(() => settingsApi.updateStage(id, data).then(), loadStages),
    onMoveUp: (id: number) => {
      const idx = stages.findIndex((s) => s.id === id);
      if (idx <= 0) return Promise.resolve();
      return wrap(() => settingsApi.reorderStage(id, idx - 1).then((r) => setStages(r as LeadStage[])), async () => {});
    },
    onMoveDown: (id: number) => {
      const idx = stages.findIndex((s) => s.id === id);
      if (idx >= stages.length - 1) return Promise.resolve();
      return wrap(() => settingsApi.reorderStage(id, idx + 1).then((r) => setStages(r as LeadStage[])), async () => {});
    },
  };

  // Reject reasons
  const loadReject = async () => setRejectReasons(await settingsApi.listRejectReasons());
  const rejectHandlers = {
    onAdd: (name: string) => wrap(() => settingsApi.createRejectReason(name).then(), loadReject),
    onRename: (id: number, name: string) => wrap(() => settingsApi.updateRejectReason(id, { name }).then(), loadReject),
    onToggle: (id: number, is_active: boolean) => wrap(() => settingsApi.updateRejectReason(id, { is_active }).then(), loadReject),
    onMoveUp: (id: number) => {
      const idx = rejectReasons.findIndex((r) => r.id === id);
      if (idx <= 0) return Promise.resolve();
      return wrap(() => settingsApi.reorderRejectReason(id, idx - 1).then((r) => setRejectReasons(r as RejectReason[])), async () => {});
    },
    onMoveDown: (id: number) => {
      const idx = rejectReasons.findIndex((r) => r.id === id);
      if (idx >= rejectReasons.length - 1) return Promise.resolve();
      return wrap(() => settingsApi.reorderRejectReason(id, idx + 1).then((r) => setRejectReasons(r as RejectReason[])), async () => {});
    },
  };

  // Expense categories
  const loadExpense = async () => setExpenseCategories(await settingsApi.listExpenseCategories());
  const expenseHandlers = {
    onAdd: (name: string) => wrap(() => settingsApi.createExpenseCategory(name).then(), loadExpense),
    onRename: (id: number, name: string) => wrap(() => settingsApi.updateExpenseCategory(id, { name }).then(), loadExpense),
    onToggle: (id: number, is_active: boolean) => wrap(() => settingsApi.updateExpenseCategory(id, { is_active }).then(), loadExpense),
    onMoveUp: (id: number) => {
      const idx = expenseCategories.findIndex((e) => e.id === id);
      if (idx <= 0) return Promise.resolve();
      return wrap(() => settingsApi.reorderExpenseCategory(id, idx - 1).then((r) => setExpenseCategories(r as ExpenseCategory[])), async () => {});
    },
    onMoveDown: (id: number) => {
      const idx = expenseCategories.findIndex((e) => e.id === id);
      if (idx >= expenseCategories.length - 1) return Promise.resolve();
      return wrap(() => settingsApi.reorderExpenseCategory(id, idx + 1).then((r) => setExpenseCategories(r as ExpenseCategory[])), async () => {});
    },
  };

  // Accounts
  const loadAccounts = async () => setAccounts(await settingsApi.listAccounts());
  const accountHandlers = {
    onAdd: (data: any) => wrap(() => settingsApi.createAccount(data).then(), loadAccounts),
    onUpdate: (id: number, data: any) => wrap(() => settingsApi.updateAccount(id, data).then(), loadAccounts),
    onMoveUp: (id: number) => {
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx <= 0) return Promise.resolve();
      return wrap(() => settingsApi.reorderAccount(id, idx - 1).then((r) => setAccounts(r as Account[])), async () => {});
    },
    onMoveDown: (id: number) => {
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx >= accounts.length - 1) return Promise.resolve();
      return wrap(() => settingsApi.reorderAccount(id, idx + 1).then((r) => setAccounts(r as Account[])), async () => {});
    },
  };

  return (
    <Shell title="Настройки">
      <PageHeader
        title="Настройки"
        subtitle="Справочники CRM — редактируйте списки источников, услуг, этапов воронки и счетов"
      />

      <div className="card">
        {/* Tabs */}
        <div className="sett-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`sett-tab ${tab === t.key ? "sett-tab-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "24px 20px" }}>
          {tab === "sources" && (
            <LookupSection items={sources} {...srcHandlers} />
          )}
          {tab === "services" && (
            <LookupSection items={services} {...svcHandlers} />
          )}
          {tab === "stages" && (
            <StagesSection stages={stages} {...stageHandlers} />
          )}
          {tab === "reject" && (
            <LookupSection items={rejectReasons} {...rejectHandlers} />
          )}
          {tab === "expense" && (
            <LookupSection items={expenseCategories} {...expenseHandlers} />
          )}
          {tab === "accounts" && (
            <AccountsSection accounts={accounts} {...accountHandlers} />
          )}
        </div>
      </div>

      <style jsx global>{`
        .sett-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 12px 12px 0; border-bottom: 1px solid var(--border); }
        .sett-tab { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border: none; background: none; color: var(--text3); font-size: 13px; font-family: inherit; cursor: pointer; border-radius: 6px 6px 0 0; transition: all 0.13s; margin-bottom: -1px; border-bottom: 2px solid transparent; }
        .sett-tab:hover { color: var(--text); background: var(--bg3); }
        .sett-tab-active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 500; }
        .sett-list { display: flex; flex-direction: column; }
        .sett-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 0.5px solid var(--border); }
        .sett-row:last-child { border-bottom: none; }
        .sett-name { flex: 1; min-width: 0; font-size: 14px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sett-name-inactive { color: var(--text3); text-decoration: line-through; }
        .sett-status { flex-shrink: 0; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .sett-status-on { background: var(--green-bg); color: var(--green); }
        .sett-status-off { background: var(--bg3); color: var(--text3); }
        .sett-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .sett-icon-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: var(--text3); border-radius: 6px; }
        .sett-icon-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
        .sett-icon-btn:disabled { opacity: 0.3; cursor: default; }
        .sett-badge { flex-shrink: 0; padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 500; }
        .stage-color-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
      `}</style>
    </Shell>
  );
}
