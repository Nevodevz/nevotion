"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { UserModal } from "@/components/UserModal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import { UserWithStats, Department } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function StaffPage() {
  const { isAdmin } = useApp();
  const router = useRouter();
  const toast = useToast();

  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [archived, setArchived] = useState<UserWithStats[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null);
  const [archiveModal, setArchiveModal] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<UserWithStats | null>(null);
  const [botsCount, setBotsCount] = useState(0);
  const [reassignTo, setReassignTo] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    api.listUsers(undefined, false).then(setUsers).catch(() => {});
    api.listUsers(undefined, true).then((all) => setArchived(all.filter((u) => !u.is_active))).catch(() => {});
    api.listDepartments().then(setDepartments).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // redirect non-admins
  useEffect(() => {
    if (!isAdmin) router.push("/dashboard");
  }, [isAdmin, router]);

  async function openArchive(u: UserWithStats) {
    setArchiveTarget(u);
    try {
      const { count } = await api.userBotsCount(u.id);
      setBotsCount(count);
    } catch { setBotsCount(0); }
    setReassignTo("");
    setArchiveModal(true);
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setActing(true);
    try {
      if (botsCount > 0 && reassignTo) {
        await api.reassignBots(archiveTarget.id, Number(reassignTo));
        toast(`Боты переназначены`);
      }
      await api.archiveUser(archiveTarget.id);
      toast(`${archiveTarget.name} переведён в архив`);
      setArchiveModal(false);
      load();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setActing(false); }
  }

  async function restore(u: UserWithStats) {
    try {
      await api.restoreUser(u.id);
      toast(`${u.name} восстановлен`);
      load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  const activePrompters = users.filter((u) =>
    u.position === "Промпт-инженер" || u.position === "Тимлид"
  );

  const ROLE_LABEL: Record<string, string> = { admin: "Администратор", staff: "Сотрудник" };

  return (
    <Shell title="Сотрудники">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div className="page-h1">Управление сотрудниками</div>
          <div className="page-desc">{users.length} активных · {archived.length} в архиве</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowArchived(!showArchived)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {showArchived ? "visibility_off" : "inventory_2"}
            </span>
            {showArchived ? "Скрыть архив" : `Архив (${archived.length})`}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingUser(null); setUserModal(true); }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
            Добавить сотрудника
          </button>
        </div>
      </div>

      {/* Active staff */}
      <div className="card" style={{ overflow: "hidden", marginBottom: showArchived ? 20 : 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Email</th>
              <th>Должность</th>
              <th>Роль</th>
              <th>Отделы</th>
              <th>Боты</th>
              <th>Статус</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={u.name} color={u.avatar_color} src={u.avatar_url} size={30} />
                    <span style={{ fontWeight: 500, color: "var(--text)" }}>{u.name}</span>
                    {u.is_founder && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 8, background: "rgba(249,115,22,0.1)", color: "#ea580c", fontWeight: 600 }}>Основатель</span>}
                  </span>
                </td>
                <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{u.email}</td>
                <td>{u.position}</td>
                <td>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8,
                    background: u.role === "admin" ? "var(--primary-dim)" : "var(--bg3)",
                    color: u.role === "admin" ? "var(--primary)" : "var(--text3)", fontWeight: 500 }}>
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td style={{ color: "var(--text3)", fontSize: 12 }}>
                  {departments.filter((d) => u.department_ids?.includes(d.id) && !d.admin_only).map((d) => d.name).join(", ") || "—"}
                </td>
                <td style={{ textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>{u.total_bots}</td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: u.is_online ? "var(--green)" : "var(--text3)", flexShrink: 0 }} />
                    {u.is_online ? "В сети" : (u.last_seen_label ?? "Не входил")}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="row-act" onClick={() => { setEditingUser(u); setUserModal(true); }} title="Редактировать">
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>edit</span>
                    </button>
                    <button className="row-act" onClick={() => openArchive(u)} title="В архив"
                      style={{ color: "var(--orange)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>archive</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Archived staff */}
      {showArchived && archived.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Архив
          </div>
          <table className="data-table">
            <thead><tr><th>Сотрудник</th><th>Email</th><th>Должность</th><th></th></tr></thead>
            <tbody>
              {archived.map((u) => (
                <tr key={u.id} style={{ opacity: 0.7 }}>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={u.name} color={u.avatar_color} src={u.avatar_url} size={28} />
                      <span style={{ color: "var(--text2)" }}>{u.name}</span>
                    </span>
                  </td>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{u.email}</td>
                  <td style={{ color: "var(--text3)" }}>{u.position}</td>
                  <td>
                    <button className="row-act" onClick={() => restore(u)} title="Восстановить" style={{ color: "var(--green)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>unarchive</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Archive confirm modal */}
      <Modal open={archiveModal} onClose={() => setArchiveModal(false)}
        title={`Перевести в архив: ${archiveTarget?.name}`} width={440}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setArchiveModal(false)}>Отмена</button>
            <button className="btn btn-primary" onClick={confirmArchive} disabled={acting}
              style={{ background: "var(--orange)" }}>
              {acting ? "Архивирование…" : "В архив"}
            </button>
          </>
        }>
        <p style={{ fontSize: 13, color: "var(--text2)", marginTop: 0 }}>
          Сотрудник не сможет войти в систему. Все данные (задачи, записи, история) сохранятся.
        </p>
        {botsCount > 0 && (
          <div style={{ background: "var(--orange-bg)", border: "1px solid var(--orange)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--orange)", marginBottom: 8 }}>
              ⚠️ На {archiveTarget?.name} назначено {botsCount} {botsCount === 1 ? "бот" : "бота"}
            </div>
            <label className="field-label">Переназначить на:</label>
            <select className="field-select" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">— оставить без ответственного —</option>
              {activePrompters.filter((u) => u.id !== archiveTarget?.id).map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.total_bots} ботов)</option>
              ))}
            </select>
          </div>
        )}
      </Modal>

      <UserModal open={userModal} onClose={() => setUserModal(false)} onSaved={load}
        user={editingUser} departments={departments} />

      <style jsx global>{`
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table thead { background: var(--bg3); }
        .data-table th { padding: 11px 16px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3); border-bottom: 1px solid var(--border); white-space: nowrap; }
        .data-table td { padding: 13px 16px; font-size: 13px; border-bottom: 1px solid var(--border); color: var(--text2); }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tbody tr:hover td { background: var(--bg-hover); }
        .row-act { width: 28px; height: 28px; border: none; background: transparent; color: var(--text3); border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .row-act:hover { background: var(--bg3); color: var(--text); }
      `}</style>
    </Shell>
  );
}
