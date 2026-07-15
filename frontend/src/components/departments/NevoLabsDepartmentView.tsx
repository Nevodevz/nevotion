"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { api, labProjectApi } from "@/lib/api";
import { Department, LabProject, LabProjectStatus, LAB_PROJECT_STATUSES, UserWithStats } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { Button, ConfirmModal, FormField, Input, Select, Textarea } from "@/components/ui";

const STATUS_ICONS: Record<LabProjectStatus, string> = {
  "Идея": "lightbulb",
  "В разработке": "code",
  "Запущен": "rocket_launch",
  "Заморожен": "ac_unit",
};

function StatusBadge({ status }: { status: LabProjectStatus }) {
  const s = LAB_PROJECT_STATUSES.find((x) => x.value === status) ?? LAB_PROJECT_STATUSES[0];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
      borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.color}22`,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{STATUS_ICONS[status]}</span>
      {s.label}
    </span>
  );
}

function fmtDate(d: string) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
}

interface ProjectModalProps {
  open: boolean;
  project: LabProject | null;
  allUsers: UserWithStats[];
  onClose: () => void;
  onSaved: () => void;
}

function ProjectModal({ open, project, allUsers, onClose, onSaved }: ProjectModalProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<LabProjectStatus>("Идея");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setDescription(project?.description ?? "");
      setStatus((project?.status as LabProjectStatus) ?? "Идея");
      setMemberIds(project?.members.map((m) => m.user_id) ?? []);
    }
  }, [open, project]);

  function toggleMember(uid: number) {
    setMemberIds((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  }

  async function save() {
    if (!name.trim()) { toast("Название обязательно", "error"); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description, status, member_ids: memberIds };
      if (project) {
        await labProjectApi.update(project.id, payload);
      } else {
        await labProjectApi.create(payload);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Редактировать проект" : "Новый проект"}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={save} loading={saving}>{project ? "Сохранить" : "Создать"}</Button>
        </>
      }
    >
      <FormField label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название проекта" autoFocus />
      </FormField>

      <FormField label="Описание">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Кратко опишите проект…" rows={3} />
      </FormField>

      <FormField label="Статус">
        <Select value={status} onChange={(e) => setStatus(e.target.value as LabProjectStatus)}>
          {LAB_PROJECT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Участники">
        <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 0" }}>
          {allUsers.map((u) => {
            const selected = memberIds.includes(u.id);
            return (
              <div
                key={u.id}
                onClick={() => toggleMember(u.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  cursor: "pointer", background: selected ? "var(--primary-dim)" : "transparent",
                  transition: "background 0.12s",
                }}
              >
                <input type="checkbox" checked={selected} readOnly style={{ accentColor: "var(--primary)", cursor: "pointer" }} />
                <Avatar name={u.name} color={u.avatar_color} size={26} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{u.position}</div>
                </div>
              </div>
            );
          })}
        </div>
      </FormField>
    </Modal>
  );
}

export function NevoLabsDepartmentView({ dept, departments }: { dept: Department; departments: Department[] }) {
  const { user: currentUser, isAdmin, isFounder } = useApp();
  const toast = useToast();
  const router = useRouter();

  const [projects, setProjects] = useState<LabProject[]>([]);
  const [allUsers, setAllUsers] = useState<UserWithStats[]>([]);
  const [nlabsMembers, setNlabsMembers] = useState<UserWithStats[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<LabProject | null>(null);
  const [archiveId, setArchiveId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prjs, users, nlabs] = await Promise.all([
        labProjectApi.list(showArchived),
        api.listUsers(),
        api.listUsers(dept.id),
      ]);
      setProjects(prjs);
      setAllUsers(users);
      setNlabsMembers(nlabs);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showArchived, dept.id]);

  useEffect(() => { load(); }, [load]);

  const isLabMember = currentUser ? nlabsMembers.some((m) => m.id === currentUser.id) : false;
  const canManageActual = isFounder || isAdmin || isLabMember;

  const archiveProject = projects.find((p) => p.id === archiveId);

  async function doArchive() {
    if (!archiveId) return;
    try {
      await labProjectApi.archive(archiveId);
      toast("Проект архивирован", "success");
      setArchiveId(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="page-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: "var(--primary)" }}>science</span>
            NevoLabs
          </div>
          <div className="page-desc">Внутренние R&amp;D-проекты · Kanban на каждый проект</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ accentColor: "var(--primary)" }}
            />
            Архив
          </label>
          {canManageActual && (
            <Button icon="add" onClick={() => { setEditingProject(null); setModalOpen(true); }}>
              Новый проект
            </Button>
          )}
        </div>
      </div>

      {/* Projects table */}
      {loading ? (
        <div style={{ color: "var(--text3)", padding: "40px 0", textAlign: "center" }}>Загрузка…</div>
      ) : projects.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", color: "var(--text3)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, marginBottom: 12 }}>science</span>
          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text2)" }}>Проектов пока нет</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Создайте первый R&amp;D-проект NevoLabs</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="nlab-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Статус</th>
                  <th>Участники</th>
                  <th>Создан</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const canBoard = isFounder || isAdmin ||
                    p.members.some((m) => m.user_id === currentUser?.id);
                  return (
                    <tr
                      key={p.id}
                      className="nlab-row"
                      onClick={() => {
                        if (canBoard && p.board_id) {
                          router.push(`/dept/nevolabs/${p.id}`);
                        }
                      }}
                      style={{ cursor: canBoard && p.board_id ? "pointer" : "default", opacity: p.is_archived ? 0.55 : 1 }}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {p.is_archived && (
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--text3)" }} title="Архив">archive</span>
                          )}
                          <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{p.name}</span>
                        </div>
                        {p.description && (
                          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, maxWidth: 320,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td><StatusBadge status={p.status as LabProjectStatus} /></td>
                      <td>
                        <div style={{ display: "flex", gap: -4, flexWrap: "wrap" }}>
                          {p.members.slice(0, 5).map((m) => m.user && (
                            <div key={m.id} style={{ marginRight: 4 }} title={m.user.name}>
                              <Avatar name={m.user.name} color={m.user.avatar_color} size={26} />
                            </div>
                          ))}
                          {p.members.length > 5 && (
                            <div style={{
                              width: 26, height: 26, borderRadius: "50%",
                              background: "var(--bg3)", border: "1px solid var(--border)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, color: "var(--text3)", fontWeight: 600,
                            }}>
                              +{p.members.length - 5}
                            </div>
                          )}
                          {p.members.length === 0 && (
                            <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text3)" }}>
                        {fmtDate(p.created_at)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {!p.is_archived && canManageActual && (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="row-act" title="Редактировать"
                              onClick={() => { setEditingProject(p); setModalOpen(true); }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>edit</span>
                            </button>
                            <button className="row-act" title="Архивировать"
                              onClick={() => setArchiveId(p.id)}>
                              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>archive</span>
                            </button>
                            {canBoard && p.board_id && (
                              <button className="row-act" title="Открыть Kanban"
                                onClick={() => router.push(`/dept/nevolabs/${p.id}`)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>view_kanban</span>
                              </button>
                            )}
                          </div>
                        )}
                        {canBoard && p.board_id && p.is_archived && (
                          <button className="row-act" title="Открыть Kanban"
                            onClick={() => router.push(`/dept/nevolabs/${p.id}`)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>view_kanban</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ProjectModal
        open={modalOpen}
        project={editingProject}
        allUsers={allUsers}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />

      <ConfirmModal
        open={archiveId !== null}
        title="Архивировать проект?"
        message={archiveProject
          ? `Проект «${archiveProject.name}» будет архивирован. Канбан-доска сохранится.`
          : ""}
        confirmLabel="Архивировать"
        variant="danger"
        onConfirm={doArchive}
        onCancel={() => setArchiveId(null)}
      />

      <style jsx global>{`
        .nlab-table { width: 100%; border-collapse: collapse; }
        .nlab-table thead { background: var(--bg3); }
        .nlab-table th { padding: 11px 16px; text-align: left; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3);
          border-bottom: 1px solid var(--border); }
        .nlab-table td { padding: 14px 16px; font-size: 13px; border-bottom: 1px solid var(--border); color: var(--text2); }
        .nlab-table tr:last-child td { border-bottom: none; }
        .nlab-row:hover td { background: var(--bg-hover); }
        .row-act { width: 28px; height: 28px; border: none; background: transparent;
          color: var(--text3); border-radius: 5px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; }
        .row-act:hover { background: var(--bg3); color: var(--text); }
      `}</style>
    </div>
  );
}
