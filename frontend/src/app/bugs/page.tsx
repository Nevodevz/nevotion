"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { bugApi } from "@/lib/api";
import { BugReport, BugStatus, BUG_STATUS, BUG_PRIORITY, BugPriority } from "@/lib/types";
import { Button, Input, Select, Textarea, FormField, PageHeader, ConfirmModal } from "@/components/ui";

const STATUS_COLS: { key: BugStatus; label: string }[] = [
  { key: "new",         label: "Новые" },
  { key: "in_progress", label: "В работе" },
  { key: "resolved",    label: "Решены" },
];

const PRIORITY_OPTIONS: { value: BugPriority; label: string }[] = [
  { value: "low",      label: "Низкий" },
  { value: "medium",   label: "Средний" },
  { value: "high",     label: "Высокий" },
  { value: "critical", label: "Критичный" },
];

export default function BugsPage() {
  const { isAdmin, user } = useApp();
  const toast = useToast();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailBug, setDetailBug] = useState<BugReport | null>(null);

  const load = useCallback(() => {
    bugApi.list().then(setBugs).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStatus = (status: BugStatus) => bugs.filter((b) => b.status === status);

  return (
    <Shell title="Баги">
      <PageHeader
        title="Трекер багов"
        actions={
          <Button variant="primary" icon="add" onClick={() => setCreateOpen(true)}>
            Сообщить о баге
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {STATUS_COLS.map((col) => {
          const st = BUG_STATUS[col.key];
          const colBugs = byStatus(col.key);
          return (
            <div key={col.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text2)" }}>
                  {col.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--text3)", background: "var(--bg3)", padding: "1px 8px", borderRadius: 10, fontFamily: "JetBrains Mono, monospace" }}>
                  {colBugs.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {colBugs.map((b) => {
                  const pr = BUG_PRIORITY[b.priority as BugPriority] ?? BUG_PRIORITY.medium;
                  return (
                    <div key={b.id} className="card" style={{ padding: 14, cursor: "pointer" }}
                      onClick={() => setDetailBug(b)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: pr.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {pr.label}
                        </span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)" }}>
                          #{b.id}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6, lineHeight: 1.4 }}>
                        {b.title}
                      </div>
                      {b.description && (
                        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10, overflow: "hidden", maxHeight: 36, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {b.description}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        {b.reporter ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 20, background: "var(--bg3)", border: "0.5px solid var(--border)" }}>
                            <Avatar name={b.reporter.name} color={b.reporter.avatar_color} size={16} />
                            <span style={{ fontSize: 11, color: "var(--text2)", fontWeight: 500 }}>{b.reporter.name}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>Аноним</span>
                        )}
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
                          {new Date(b.created_at).toLocaleDateString("ru-RU")}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {colBugs.length === 0 && (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text3)", fontSize: 13,
                    background: "var(--bg3)", borderRadius: 8, border: "1.5px dashed var(--border)" }}>
                    Нет записей
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CreateBugModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />

      {detailBug && (
        <BugDetailModal
          open={!!detailBug}
          onClose={() => setDetailBug(null)}
          bug={detailBug}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          onSaved={() => { load(); setDetailBug(null); }}
        />
      )}
    </Shell>
  );
}

function CreateBugModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: "", description: "", priority: "medium" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ title: "", description: "", priority: "medium" });
  }, [open]);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await bugApi.create(form);
      toast("Баг-репорт отправлен");
      onClose(); onSaved();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Сообщить о баге" width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={save} disabled={saving || !form.title.trim()} loading={saving}>Отправить</Button>
        </>
      }>
      <FormField label="Заголовок" required>
        <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Кратко опишите проблему" />
      </FormField>
      <FormField label="Описание">
        <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Подробности, шаги воспроизведения…" />
      </FormField>
      <FormField label="Приоритет">
        <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      </FormField>
    </Modal>
  );
}

function BugDetailModal({ open, onClose, bug, isAdmin, currentUserId, onSaved }: {
  open: boolean; onClose: () => void; bug: BugReport;
  isAdmin: boolean; currentUserId?: number; onSaved: () => void;
}) {
  const toast = useToast();
  const st = BUG_STATUS[bug.status];
  const pr = BUG_PRIORITY[bug.priority as BugPriority] ?? BUG_PRIORITY.medium;
  const canEdit = isAdmin || bug.reporter_id === currentUserId;
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function changeStatus(newStatus: BugStatus) {
    try {
      await bugApi.update(bug.id, { status: newStatus });
      toast("Статус обновлён");
      onSaved();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function del() {
    try {
      await bugApi.delete(bug.id);
      toast("Удалено");
      onSaved();
    } catch (e: any) { toast(e.message, "error"); }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Баг #${bug.id}`} width={520}
        footer={
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            {canEdit && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>Удалить</Button>
            )}
            <div style={{ marginLeft: "auto" }}>
              <Button variant="ghost" onClick={onClose}>Закрыть</Button>
            </div>
          </div>
        }>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
          <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: pr.color, background: "var(--bg3)" }}>{pr.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text3)" }}>
            {new Date(bug.created_at).toLocaleString("ru-RU")}
          </span>
        </div>

        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>{bug.title}</div>

        {bug.description && (
          <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6, marginBottom: 14, whiteSpace: "pre-wrap" }}>{bug.description}</div>
        )}

        {bug.reporter && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 12px", background: "var(--bg3)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
            <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>Автор:</span>
            <Avatar name={bug.reporter.name} color={bug.reporter.avatar_color} size={22} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{bug.reporter.name}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>{bug.reporter.position}</span>
          </div>
        )}

        {isAdmin && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", marginBottom: 8 }}>Изменить статус</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["new","in_progress","resolved"] as BugStatus[]).filter((s) => s !== bug.status).map((s) => {
                const ms = BUG_STATUS[s];
                return (
                  <button key={s} onClick={() => changeStatus(s)}
                    style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${ms.color}`, background: ms.bg, color: ms.color, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                    {ms.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        title="Удалить баг-репорт?"
        message="Это действие необратимо. Баг-репорт будет удалён."
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={del}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
